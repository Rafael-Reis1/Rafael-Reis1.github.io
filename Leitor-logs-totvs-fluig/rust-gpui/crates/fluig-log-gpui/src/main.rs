#![windows_subsystem = "windows"]

mod app;

use app::LogViewerApp;
use gpui::{
    App, Application, Bounds, TitlebarOptions, WindowBounds, WindowDecorations, WindowOptions,
    prelude::*, px, size,
};
use std::path::PathBuf;

fn main() {
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
                titlebar: Some(TitlebarOptions {
                    title: Some("Leitor de Logs TOTVS/Fluig (Rust + GPUI)".into()),
                    ..Default::default()
                }),
                window_min_size: Some(size(px(900.0), px(580.0))),
                ..Default::default()
            },
            |window, cx| cx.new(|cx| LogViewerApp::new(initial_paths, window, cx)),
        )
        .expect("Falha ao abrir janela GPUI");

        cx.activate(true);
    });
}
