//! What desktop sign-in for sync needs from the shell (see
//! `src/platform/pkce-auth.ts` and docs/architecture/sync.md, section 3):
//! a loopback address for the browser to come back to, the system browser,
//! Google's token endpoint, and the OS keychain for the refresh token.
//! Each command does one fixed thing; none takes a URL to fetch.

use std::io::{BufRead, BufReader, ErrorKind, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{channel, Receiver};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri_plugin_opener::OpenerExt;

const AUTH_PREFIX: &str = "https://accounts.google.com/o/oauth2/v2/auth?";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const REVOKE_URL: &str = "https://oauth2.googleapis.com/revoke";
const KEYCHAIN_SERVICE: &str = "rsvp-reader";
/// How long sign-in waits for the browser to come back.
const WAIT: Duration = Duration::from_secs(5 * 60);

const DONE_PAGE: &str = "<!doctype html><meta charset=utf-8><title>RSVP Reader</title>\
<body style=\"font:16px system-ui;margin:3em\">Signed in. You can close this tab and go back to RSVP Reader.";

/// The browser's answer to the sign-in under way, once it arrives, and a
/// count of sign-ins started: a listener stops once a newer one has begun.
#[derive(Default)]
pub struct Callback {
  answer: Mutex<Option<Receiver<String>>>,
  started: Arc<AtomicU64>,
}

/// Listen on a free loopback port. The first request that carries an answer
/// (`code` or `error`) is passed on and answered with a "you can close this
/// tab" page; anything else (a favicon) is turned away. Pressing Connect
/// again starts a new listener, and this one stops and frees its port.
#[tauri::command]
pub fn oauth_listen(state: tauri::State<Callback>) -> Result<u16, String> {
  let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
  let port = listener.local_addr().map_err(|e| e.to_string())?.port();
  let (send, receive) = channel();
  *state.answer.lock().unwrap() = Some(receive);
  let started = Arc::clone(&state.started);
  let this = started.fetch_add(1, Ordering::SeqCst) + 1;
  std::thread::spawn(move || {
    let still_wanted = || started.load(Ordering::SeqCst) == this;
    if let Some(query) = serve_once(&listener, Instant::now() + WAIT, still_wanted) {
      let _ = send.send(query);
    }
  });
  Ok(port)
}

/// Answer requests on `listener` until one carries Google's answer, which is
/// returned; or until `until`, or until `still_wanted` says no, when `None`
/// is. Polls rather than blocks, so it can notice either.
fn serve_once(
  listener: &TcpListener,
  until: Instant,
  still_wanted: impl Fn() -> bool,
) -> Option<String> {
  listener.set_nonblocking(true).ok()?;
  while Instant::now() < until && still_wanted() {
    let mut stream = match listener.accept() {
      Ok((stream, _)) => stream,
      Err(e) if e.kind() == ErrorKind::WouldBlock => {
        std::thread::sleep(Duration::from_millis(100));
        continue;
      }
      Err(_) => continue,
    };
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut line = String::new();
    if BufReader::new(&stream).read_line(&mut line).is_err() {
      continue;
    }
    let answer = answer_of(&line);
    let (status, body) = if answer.is_some() {
      ("200 OK", DONE_PAGE)
    } else {
      ("404 Not Found", "")
    };
    let _ = write!(
      stream,
      "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
      body.len()
    );
    if answer.is_some() {
      return answer;
    }
  }
  None
}

/// The query string of a request line ("GET /?code=…&state=… HTTP/1.1")
/// that carries Google's answer, a `code` or an `error`.
fn answer_of(request_line: &str) -> Option<String> {
  let query = request_line.split_whitespace().nth(1)?.split_once('?')?.1;
  query
    .split('&')
    .any(|p| p.starts_with("code=") || p.starts_with("error="))
    .then(|| query.to_string())
}

/// Wait for the browser to come back to the address `oauth_listen` made.
#[tauri::command]
pub async fn oauth_callback(state: tauri::State<'_, Callback>) -> Result<String, String> {
  let receive = state
    .answer
    .lock()
    .unwrap()
    .take()
    .ok_or("No sign-in is under way.")?;
  tauri::async_runtime::spawn_blocking(move || receive.recv_timeout(WAIT))
    .await
    .map_err(|e| e.to_string())?
    .map_err(|_| "Sign-in took too long, or the browser window was closed.".to_string())
}

/// Open Google's sign-in page in the system browser. Only that page.
#[tauri::command]
pub fn oauth_open(app: tauri::AppHandle, url: String) -> Result<(), String> {
  if !url.starts_with(AUTH_PREFIX) {
    return Err("Only Google's sign-in page can be opened.".into());
  }
  app
    .opener()
    .open_url(url, None::<&str>)
    .map_err(|e| e.to_string())
}

/// POST a form to Google's token or revoke endpoint. Returns the status and
/// body, an error status included, for the caller to read.
#[tauri::command]
pub async fn oauth_post(
  endpoint: String,
  form: std::collections::HashMap<String, String>,
) -> Result<(u16, String), String> {
  let url = match endpoint.as_str() {
    "token" => TOKEN_URL,
    "revoke" => REVOKE_URL,
    _ => return Err("Unknown endpoint.".into()),
  };
  tauri::async_runtime::spawn_blocking(move || {
    let agent: ureq::Agent = ureq::Agent::config_builder()
      .http_status_as_error(false)
      .timeout_global(Some(Duration::from_secs(30)))
      .build()
      .into();
    let mut response = agent
      .post(url)
      .send_form(form.iter().map(|(k, v)| (k.as_str(), v.as_str())))
      .map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let body = response
      .body_mut()
      .read_to_string()
      .map_err(|e| e.to_string())?;
    Ok((status, body))
  })
  .await
  .map_err(|e| e.to_string())?
}

fn entry(key: &str) -> Result<keyring::Entry, String> {
  keyring::Entry::new(KEYCHAIN_SERVICE, key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secret_get(key: String) -> Result<Option<String>, String> {
  match entry(&key)?.get_password() {
    Ok(value) => Ok(Some(value)),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}

#[tauri::command]
pub fn secret_set(key: String, value: String) -> Result<(), String> {
  entry(&key)?.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secret_delete(key: String) -> Result<(), String> {
  match entry(&key)?.delete_credential() {
    Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
    Err(e) => Err(e.to_string()),
  }
}

#[cfg(test)]
mod tests {
  use super::{answer_of, serve_once};
  use std::io::{Read, Write};
  use std::net::{TcpListener, TcpStream};
  use std::sync::atomic::{AtomicBool, Ordering};
  use std::sync::Arc;
  use std::time::{Duration, Instant};

  fn get(port: u16, path: &str) -> String {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
    write!(stream, "GET {path} HTTP/1.1\r\nHost: x\r\n\r\n").unwrap();
    let mut reply = String::new();
    stream.read_to_string(&mut reply).unwrap();
    reply
  }

  #[test]
  fn serves_until_googles_answer_comes() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let server = std::thread::spawn(move || {
      serve_once(&listener, Instant::now() + Duration::from_secs(10), || true)
    });
    assert!(get(port, "/favicon.ico").starts_with("HTTP/1.1 404"));
    assert!(get(port, "/?code=c&state=s").contains("Signed in."));
    assert_eq!(server.join().unwrap().as_deref(), Some("code=c&state=s"));
  }

  #[test]
  fn stops_once_a_newer_sign_in_began() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let wanted = Arc::new(AtomicBool::new(true));
    let flag = Arc::clone(&wanted);
    let server = std::thread::spawn(move || {
      serve_once(&listener, Instant::now() + Duration::from_secs(60), || {
        flag.load(Ordering::SeqCst)
      })
    });
    wanted.store(false, Ordering::SeqCst);
    let started = Instant::now();
    assert_eq!(server.join().unwrap(), None);
    assert!(started.elapsed() < Duration::from_secs(2));
  }

  #[test]
  fn takes_googles_answer_and_nothing_else() {
    assert_eq!(
      answer_of("GET /?state=s&code=4%2F0Ab HTTP/1.1\r\n").as_deref(),
      Some("state=s&code=4%2F0Ab")
    );
    assert_eq!(
      answer_of("GET /?error=access_denied&state=s HTTP/1.1").as_deref(),
      Some("error=access_denied&state=s")
    );
    assert_eq!(answer_of("GET /favicon.ico HTTP/1.1"), None);
    assert_eq!(answer_of("GET /?notcode=1 HTTP/1.1"), None);
    assert_eq!(answer_of(""), None);
  }
}
