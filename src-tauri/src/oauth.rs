//! What desktop sign-in for sync needs from the shell (see
//! `src/platform/pkce-auth.ts` and docs/architecture/sync.md, section 3):
//! a loopback address for the browser to come back to, the system browser,
//! Google's token endpoint, and the OS keychain for the refresh token.
//! Each command does one fixed thing; none takes a URL to fetch.

use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::mpsc::{channel, Receiver};
use std::sync::Mutex;
use std::time::Duration;

use tauri_plugin_opener::OpenerExt;

const AUTH_PREFIX: &str = "https://accounts.google.com/o/oauth2/v2/auth?";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const REVOKE_URL: &str = "https://oauth2.googleapis.com/revoke";
const KEYCHAIN_SERVICE: &str = "rsvp-reader";
/// How long sign-in waits for the browser to come back.
const WAIT: Duration = Duration::from_secs(5 * 60);

const DONE_PAGE: &str = "<!doctype html><meta charset=utf-8><title>RSVP Reader</title>\
<body style=\"font:16px system-ui;margin:3em\">Signed in. You can close this tab and go back to RSVP Reader.";

/// The browser's answer to the sign-in under way, once it arrives.
#[derive(Default)]
pub struct Callback(Mutex<Option<Receiver<String>>>);

/// Listen on a free loopback port. The first request that carries an answer
/// (`code` or `error`) is passed on and answered with a "you can close this
/// tab" page; anything else (a favicon) is turned away.
#[tauri::command]
pub fn oauth_listen(state: tauri::State<Callback>) -> Result<u16, String> {
  let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
  let port = listener.local_addr().map_err(|e| e.to_string())?.port();
  let (send, receive) = channel();
  *state.0.lock().unwrap() = Some(receive);
  std::thread::spawn(move || {
    for stream in listener.incoming() {
      let Ok(mut stream) = stream else { continue };
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
      if let Some(query) = answer {
        let _ = send.send(query);
        break;
      }
    }
  });
  Ok(port)
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
    .0
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
  use super::answer_of;

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
