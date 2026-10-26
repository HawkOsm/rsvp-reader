use std::sync::Mutex;

mod oauth;

/// The file path passed on the command line at launch (`rsvp-reader
/// ~/books/essay.pdf`), if any — taken (read once) by the frontend via
/// `pending_open_file` on startup, mirroring the desktop Python app's own
/// command-line-open behavior.
struct PendingOpenFile(Mutex<Option<String>>);

#[tauri::command]
fn pending_open_file(state: tauri::State<PendingOpenFile>) -> Option<String> {
  state.0.lock().unwrap().take()
}

fn cli_file_argument() -> Option<String> {
  // Skip argv[0] (the binary itself) and any flag-like arguments — the
  // one plain positional argument, if present, is the file to open.
  std::env::args().skip(1).find(|arg| !arg.starts_with('-'))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .manage(PendingOpenFile(Mutex::new(cli_file_argument())))
    .manage(oauth::Callback::default())
    .invoke_handler(tauri::generate_handler![
      pending_open_file,
      oauth::oauth_listen,
      oauth::oauth_callback,
      oauth::oauth_open,
      oauth::oauth_post,
      oauth::secret_get,
      oauth::secret_set,
      oauth::secret_delete,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
