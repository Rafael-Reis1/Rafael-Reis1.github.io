#![windows_subsystem = "windows"]

mod app;

use app::LogViewerApp;
use gpui::{
    App, Application, Bounds, TitlebarOptions, WindowBounds, WindowDecorations, WindowOptions,
    prelude::*, px, size,
};
use std::path::PathBuf;

fn main() {
    #[cfg(target_os = "linux")]
    ensure_linux_desktop_integration();

    let initial_paths: Vec<PathBuf> = std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        .filter(|p| p.is_file())
        .collect();

    Application::new().run(move |cx: &mut App| {
        let bounds = Bounds::centered(None, size(px(1360.0), px(860.0)), cx);
        cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Maximized(bounds)),
                window_decorations: if cfg!(target_os = "linux") {
                    Some(WindowDecorations::Client)
                } else {
                    None
                },
                app_id: Some("fluig-log-gpui".to_string()),
                titlebar: Some(TitlebarOptions {
                    title: Some("Leitor de Logs TOTVS/Fluig (Rust + GPUI)".into()),
                    ..Default::default()
                }),
                window_min_size: Some(size(px(900.0), px(580.0))),
                ..Default::default()
            },
            |window, cx| {
                window.set_window_title("Leitor de Logs TOTVS/Fluig (Rust + GPUI)");
                cx.new(|cx| LogViewerApp::new(initial_paths, window, cx))
            },
        )
        .expect("Falha ao abrir janela GPUI");

        cx.activate(true);
    });
}

#[cfg(target_os = "linux")]
fn ensure_linux_desktop_integration() {
    const ICON_BYTES: &[u8] = include_bytes!("../../../../assets/icon-512.png");
    const APP_ID: &str = "fluig-log-gpui";

    let Some(data_dir) = linux_data_home() else {
        return;
    };
    let Ok(exe_path) = std::env::current_exe() else {
        return;
    };
    let exec_target = std::env::var_os("APPIMAGE")
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
        .unwrap_or(exe_path);

    let icons_dir = data_dir.join("icons/hicolor/512x512/apps");
    let apps_dir = data_dir.join("applications");
    if std::fs::create_dir_all(&icons_dir).is_err() || std::fs::create_dir_all(&apps_dir).is_err() {
        return;
    }

    let icon_path = icons_dir.join(format!("{APP_ID}.png"));
    if std::fs::read(&icon_path).ok().as_deref() != Some(ICON_BYTES) {
        let _ = std::fs::write(&icon_path, ICON_BYTES);
    }

    let desktop_path = apps_dir.join(format!("{APP_ID}.desktop"));
    let desktop_content = format!(
        "[Desktop Entry]\n\
         Type=Application\n\
         Name=Leitor de Logs TOTVS/Fluig\n\
         Comment=Analise logs gigantes localmente em streaming (Rust + GPUI)\n\
         Exec={} %F\n\
         Icon={}\n\
         Terminal=false\n\
         Categories=Development;Utility;\n\
         StartupNotify=true\n\
         StartupWMClass={APP_ID}\n",
        escape_desktop_exec_arg(&exec_target),
        icon_path.display()
    );

    if std::fs::read_to_string(&desktop_path).ok().as_deref() != Some(desktop_content.as_str()) {
        let _ = std::fs::write(&desktop_path, desktop_content);
    }
}

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
fn linux_data_home() -> Option<PathBuf> {
    if let Some(xdg) = std::env::var_os("XDG_DATA_HOME").filter(|v| !v.is_empty()) {
        return Some(PathBuf::from(xdg));
    }
    std::env::var_os("HOME")
        .filter(|v| !v.is_empty())
        .map(|home| PathBuf::from(home).join(".local").join("share"))
}

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
fn escape_desktop_exec_arg(path: &std::path::Path) -> String {
    let raw = path.to_string_lossy();
    let mut out = String::with_capacity(raw.len() + 2);
    out.push('"');
    for ch in raw.chars() {
        match ch {
            '"' | '`' | '$' | '\\' => {
                out.push('\\');
                out.push(ch);
            }
            '%' => out.push_str("%%"),
            _ => out.push(ch),
        }
    }
    out.push('"');
    out
}

#[cfg(test)]
mod tests {
    use super::escape_desktop_exec_arg;
    use std::path::Path;

    #[test]
    fn desktop_exec_arg_quotes_and_escapes_special_chars() {
        assert_eq!(
            escape_desktop_exec_arg(Path::new("/home/user/My Apps/fluig-log-gpui")),
            "\"/home/user/My Apps/fluig-log-gpui\""
        );
        assert_eq!(
            escape_desktop_exec_arg(Path::new("/tmp/a\"b$c%d")),
            "\"/tmp/a\\\"b\\$c%%d\""
        );
    }
}
