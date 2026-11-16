use fluig_log_core::{
    ExportFormat, FileSettings, FilterCriteria, FilteredResult, LogEntry, LogLevel, LogStats,
    ParseProgress, ParsedLogData, SearchSpec, SortOrder, build_export_bytes, filter_entries,
    find_highlight_ranges, format_bytes, format_delta_badge, format_duration_ms,
    format_log_entry_as_text, format_pt_br_number, get_files_storage_key, get_log_signature,
    is_supported_log_path, load_file_settings, parse_files_streaming, parse_text,
    save_file_settings, text_matches_spec,
};
use futures::StreamExt;
use gpui::{
    AnyElement, Bounds, ClipboardItem, Context, Decorations, DispatchPhase, ExternalPaths,
    FocusHandle, FontWeight, HighlightStyle, Hsla, KeyDownEvent, ListAlignment, ListOffset,
    ListState, MouseButton, MouseDownEvent, MouseMoveEvent, MouseUpEvent, PathPromptOptions,
    Pixels, Render, Rgba, SharedString, StyledText, Window, canvas, div, list, prelude::*, px,
    relative, rgb, rgba,
};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const ROW_HEIGHT_PX: f32 = 30.0;

// Paleta alinhada ao style.css da versão web (#06071A / #131426 / #1A1B2C / #F2511B)
fn col_bg_deep() -> Rgba {
    rgb(0x06071A)
}
fn col_bg_popup() -> Rgba {
    rgb(0x1A1B2C)
}
fn col_bg_surface() -> Rgba {
    rgb(0x131426)
}
fn col_bg_panel() -> Rgba {
    rgb(0x1F2031)
}
fn col_bg_log_area() -> Rgba {
    rgb(0x101120)
}
fn col_bg_header() -> Rgba {
    rgb(0x262738)
}
fn col_bg_row_alt() -> Rgba {
    rgba(0xFFFFFF05)
}
fn col_bg_row_active() -> Rgba {
    rgba(0x3E44518C)
}
fn col_bg_row_pinned() -> Rgba {
    rgba(0xF2511B1F)
}
fn col_border() -> Rgba {
    rgba(0xFFFFFF14)
}
fn col_border_strong() -> Rgba {
    rgba(0xF2511B88)
}
fn col_text() -> Rgba {
    rgb(0xF7F7F7)
}
fn col_text_muted() -> Rgba {
    rgb(0x9AA2B8)
}
fn col_accent() -> Rgba {
    rgb(0xF2511B)
}
fn col_accent_hover() -> Rgba {
    rgb(0xEE6233)
}
fn col_error() -> Rgba {
    rgb(0xE06C75)
}
fn col_error_bg() -> Rgba {
    rgba(0xE06C7526)
}
fn col_warn() -> Rgba {
    rgb(0xE5C07B)
}
fn col_warn_bg() -> Rgba {
    rgba(0xE5C07B21)
}
fn col_info() -> Rgba {
    rgb(0x61AFEF)
}
fn col_info_bg() -> Rgba {
    rgba(0x61AFEF21)
}
fn col_debug() -> Rgba {
    rgb(0x56B6C2)
}
fn col_debug_bg() -> Rgba {
    rgba(0x56B6C221)
}
fn col_class() -> Rgba {
    rgb(0x98C379)
}
fn col_thread() -> Rgba {
    rgb(0xC678DD)
}
fn col_date() -> Rgba {
    rgb(0xCCDFFF)
}
fn col_success() -> Rgba {
    rgb(0x98C379)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ViewMode {
    Home,
    Viewer,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ActiveInput {
    Search,
    TimeStart,
    TimeEnd,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ToastKind {
    Info,
    Success,
    Error,
}

#[derive(Debug, Clone)]
struct ToastState {
    message: String,
    kind: ToastKind,
    generation: u64,
}

#[derive(Debug, Clone)]
struct LoadingState {
    label: String,
    progress_pct: u8,
    detail: String,
    cancel_flag: Arc<AtomicBool>,
}

#[derive(Debug, Clone, Copy)]
enum VisibleRow {
    EntryHeader {
        filtered_pos: usize,
        entry_idx: usize,
    },
    StackToggle {
        entry_idx: usize,
        line_count: usize,
        is_expanded: bool,
        has_match_inside: bool,
    },
    StackLine {
        entry_idx: usize,
        line_idx: usize,
    },
}

enum LoadMessage {
    Progress(ParseProgress),
    Done(std::result::Result<ParsedLogData, String>),
}

#[derive(Debug, Clone)]
struct LoadTabMeta {
    short_title: String,
    loaded_label: String,
    file_id: Option<String>,
}

struct ScrollbarMetrics {
    thumb_h: Pixels,
    track_range: Pixels,
    offset_top: Pixels,
    total_rows: usize,
    max_top_rows: f32,
}

fn scroll_list_to_pct(
    list_state: &ListState,
    total_rows: usize,
    max_top_rows: f32,
    new_pct: f32,
) {
    if total_rows == 0 {
        return;
    }
    let pct = new_pct.clamp(0.0, 1.0);
    if pct <= 0.0 {
        list_state.scroll_to(ListOffset {
            item_ix: 0,
            offset_in_item: px(0.),
        });
        return;
    }
    if pct >= 0.999 {
        list_state.scroll_to(ListOffset {
            item_ix: total_rows,
            offset_in_item: px(0.),
        });
        return;
    }

    let target_pos = pct * max_top_rows;
    let item_ix = (target_pos.floor() as usize).min(total_rows.saturating_sub(1));
    let frac = (target_pos - item_ix as f32).clamp(0.0, 0.999);
    let item_h = list_state
        .bounds_for_item(item_ix)
        .map_or(px(ROW_HEIGHT_PX), |b| b.size.height);
    list_state.scroll_to(ListOffset {
        item_ix,
        offset_in_item: item_h * frac,
    });
}

struct LogTab {
    id: u64,
    short_title: String,
    loaded_label: String,
    current_file_id: Option<String>,
    entries: Vec<LogEntry>,
    stats: LogStats,
    criteria: FilterCriteria,
    filtered: FilteredResult,
    visible_rows: Vec<VisibleRow>,
    expanded_entries: HashSet<usize>,
    global_expand_state: bool,
    pinned_signatures: HashSet<String>,
    active_row: usize,
    list_state: ListState,
}

impl LogTab {
    fn from_parsed(id: u64, meta: LoadTabMeta, data: ParsedLogData) -> Self {
        let mut criteria = FilterCriteria::default();
        let mut pinned_signatures = HashSet::new();

        if let Some(file_id) = meta.file_id.as_deref()
            && let Some(saved) = load_file_settings(file_id)
        {
            pinned_signatures = saved.pinned_signatures.iter().cloned().collect();
            saved.apply_to_criteria(&mut criteria);
        }

        let filtered = filter_entries(&data.entries, &criteria, &pinned_signatures);
        let mut tab = Self {
            id,
            short_title: meta.short_title,
            loaded_label: meta.loaded_label,
            current_file_id: meta.file_id,
            entries: data.entries,
            stats: data.stats,
            criteria,
            filtered,
            visible_rows: Vec::new(),
            expanded_entries: HashSet::new(),
            global_expand_state: false,
            pinned_signatures,
            active_row: 0,
            list_state: ListState::new(0, ListAlignment::Top, px(300.)),
        };
        tab.rebuild_visible_rows(false);
        tab
    }

    fn persist_settings(&self) {
        let Some(file_id) = self.current_file_id.as_deref() else {
            return;
        };
        let pinned: Vec<String> = self.pinned_signatures.iter().cloned().collect();
        let settings = FileSettings::from_state(&self.criteria, &pinned);
        save_file_settings(file_id, &settings);
    }

    fn apply_filters(&mut self) {
        self.filtered = filter_entries(&self.entries, &self.criteria, &self.pinned_signatures);
        self.rebuild_visible_rows(false);
        self.active_row = 0;
    }

    fn rebuild_visible_rows(&mut self, preserve_scroll: bool) {
        let prev_scroll = preserve_scroll.then(|| self.list_state.logical_scroll_top());
        let mut rows = Vec::with_capacity(self.filtered.indices.len());
        let search_spec = &self.filtered.search_spec;

        for (filtered_pos, &entry_idx) in self.filtered.indices.iter().enumerate() {
            let Some(entry) = self.entries.get(entry_idx) else {
                continue;
            };

            if !entry.is_stacktrace_only() {
                rows.push(VisibleRow::EntryHeader {
                    filtered_pos,
                    entry_idx,
                });
            }

            if !entry.stacktrace.is_empty() {
                let is_expanded = self.expanded_entries.contains(&entry_idx);
                let has_match_inside = search_spec.has_query
                    && entry
                        .stacktrace
                        .iter()
                        .any(|line| text_matches_spec(line, search_spec));

                rows.push(VisibleRow::StackToggle {
                    entry_idx,
                    line_count: entry.stacktrace.len(),
                    is_expanded,
                    has_match_inside,
                });

                if is_expanded {
                    for line_idx in 0..entry.stacktrace.len() {
                        rows.push(VisibleRow::StackLine {
                            entry_idx,
                            line_idx,
                        });
                    }
                }
            }
        }

        self.visible_rows = rows;
        if self.visible_rows.is_empty() {
            self.active_row = 0;
        } else if self.active_row >= self.visible_rows.len() {
            self.active_row = self.visible_rows.len() - 1;
        }
        self.list_state.reset(self.visible_rows.len());
        if let Some(top) = prev_scroll {
            self.list_state.scroll_to(top);
        }
    }

    fn table_bounds(&self) -> Bounds<Pixels> {
        self.list_state.viewport_bounds()
    }

    fn scrollbar_metrics(&self) -> Option<ScrollbarMetrics> {
        let total_rows = self.visible_rows.len();
        let viewport = self.table_bounds();
        let table_height = viewport.size.height;
        if total_rows == 0 || table_height <= px(0.) {
            return None;
        }

        let top = self.list_state.logical_scroll_top();
        let at_top = top.item_ix == 0 && top.offset_in_item <= px(0.5);

        let mut visible_count = 0usize;
        let mut visible_span = px(0.);
        let mut first_item_h = px(ROW_HEIGHT_PX);
        let mut last_visible_ix = top.item_ix;
        let mut last_visible_bottom = viewport.top();

        for ix in top.item_ix..total_rows {
            let Some(item_bounds) = self.list_state.bounds_for_item(ix) else {
                break;
            };
            if visible_count == 0 {
                first_item_h = item_bounds.size.height.max(px(1.));
            }
            visible_count += 1;
            visible_span += item_bounds.size.height;
            last_visible_ix = ix;
            last_visible_bottom = item_bounds.bottom();
            if item_bounds.bottom() >= viewport.bottom() {
                break;
            }
        }

        let at_bottom = visible_count > 0
            && last_visible_ix + 1 >= total_rows
            && last_visible_bottom <= viewport.bottom() + px(0.5);

        if at_top && at_bottom {
            return None;
        }

        let measured_max_scroll = self.list_state.max_offset_for_scrollbar().height;
        let measured_total_height = table_height + measured_max_scroll;
        let estimated_total_height =
            px(total_rows as f32 * ROW_HEIGHT_PX).max(measured_total_height);

        if at_top && estimated_total_height <= table_height + px(0.5) {
            return None;
        }

        let max_thumb_h = (table_height - px(20.)).max(px(28.));
        let thumb_h = ((table_height / estimated_total_height) * table_height)
            .clamp(px(28.), max_thumb_h);
        let track_range = (table_height - thumb_h - px(8.)).max(px(0.));

        let avg_vis_h = if visible_count > 0 {
            (visible_span / visible_count as f32).max(px(12.))
        } else {
            px(ROW_HEIGHT_PX)
        };
        let est_visible_rows = (table_height / avg_vis_h).clamp(1.0, total_rows as f32);
        let max_top_rows = (total_rows as f32 - est_visible_rows).max(1.0);

        let pct = if at_bottom {
            1.0
        } else if at_top {
            0.0
        } else {
            let frac_in_item = (top.offset_in_item / first_item_h).clamp(0.0, 0.999);
            let current_row = top.item_ix as f32 + frac_in_item;
            (current_row / max_top_rows).clamp(0.0, 0.999)
        };

        let offset_top = px(4.) + track_range * pct;

        Some(ScrollbarMetrics {
            thumb_h,
            track_range,
            offset_top,
            total_rows,
            max_top_rows,
        })
    }

    fn active_input_str(&self, kind: ActiveInput) -> &str {
        match kind {
            ActiveInput::Search => &self.criteria.search_query,
            ActiveInput::TimeStart => &self.criteria.time_start,
            ActiveInput::TimeEnd => &self.criteria.time_end,
        }
    }

    fn active_input_mut(&mut self, kind: ActiveInput) -> &mut String {
        match kind {
            ActiveInput::Search => &mut self.criteria.search_query,
            ActiveInput::TimeStart => &mut self.criteria.time_start,
            ActiveInput::TimeEnd => &mut self.criteria.time_end,
        }
    }

    fn append_to_input(&mut self, kind: ActiveInput, text: &str) {
        match kind {
            ActiveInput::Search => {
                for ch in text.chars() {
                    if !ch.is_control() {
                        self.criteria.search_query.push(ch);
                    }
                }
            }
            ActiveInput::TimeStart | ActiveInput::TimeEnd => {
                let target = self.active_input_mut(kind);
                for ch in text.chars() {
                    push_time_mask_char(target, ch);
                }
            }
        }
    }
}

fn push_time_mask_char(target: &mut String, ch: char) {
    if ch == ':' {
        if target.len() == 1 {
            target.insert(0, '0');
            target.push(':');
        }
        return;
    }
    if !ch.is_ascii_digit() || target.len() >= 8 {
        return;
    }
    let next_len = target.len();
    let valid = match next_len {
        0 => ('0'..='2').contains(&ch),
        1 => {
            if target.starts_with('2') {
                ('0'..='3').contains(&ch)
            } else {
                true
            }
        }
        2 | 3 | 5 | 6 => ('0'..='5').contains(&ch),
        4 | 7 => true,
        _ => false,
    };
    if !valid {
        return;
    }
    if next_len == 2 || next_len == 5 {
        target.push(':');
    }
    target.push(ch);
}

pub struct LogViewerApp {
    focus_handle: FocusHandle,
    view_mode: ViewMode,
    tabs: Vec<LogTab>,
    active_tab_idx: usize,
    next_tab_id: u64,
    paste_seq: usize,
    active_input: Option<ActiveInput>,
    scrollbar_drag_offset: Option<Pixels>,
    loading_state: Option<LoadingState>,
    export_modal_open: bool,
    export_format: ExportFormat,
    shortcuts_modal_open: bool,
    toast: Option<ToastState>,
    toast_seq: u64,
    load_seq: u64,
}

impl LogViewerApp {
    pub fn new(initial_paths: Vec<PathBuf>, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let focus_handle = cx.focus_handle();
        window.focus(&focus_handle);

        let mut app = Self {
            focus_handle,
            view_mode: ViewMode::Home,
            tabs: Vec::new(),
            active_tab_idx: 0,
            next_tab_id: 1,
            paste_seq: 0,
            active_input: None,
            scrollbar_drag_offset: None,
            loading_state: None,
            export_modal_open: false,
            export_format: ExportFormat::Txt,
            shortcuts_modal_open: false,
            toast: None,
            toast_seq: 0,
            load_seq: 0,
        };

        if !initial_paths.is_empty() {
            app.load_files(initial_paths, cx);
        }

        app
    }

    fn active_tab(&self) -> Option<&LogTab> {
        self.tabs.get(self.active_tab_idx)
    }

    fn active_tab_mut(&mut self) -> Option<&mut LogTab> {
        self.tabs.get_mut(self.active_tab_idx)
    }

    fn show_toast(&mut self, message: impl Into<String>, kind: ToastKind, cx: &mut Context<Self>) {
        self.toast_seq += 1;
        let toast_gen = self.toast_seq;
        self.toast = Some(ToastState {
            message: message.into(),
            kind,
            generation: toast_gen,
        });
        cx.notify();

        cx.spawn(async move |this, cx| {
            gpui::Timer::after(Duration::from_millis(2800)).await;
            let _ = this.update(cx, |app, cx| {
                if app.toast.as_ref().is_some_and(|t| t.generation == toast_gen) {
                    app.toast = None;
                    cx.notify();
                }
            });
        })
        .detach();
    }

    fn persist_settings(&self) {
        if let Some(tab) = self.active_tab() {
            tab.persist_settings();
        }
    }

    fn apply_filters(&mut self, cx: &mut Context<Self>) {
        if let Some(tab) = self.active_tab_mut() {
            tab.apply_filters();
        }
        cx.notify();
    }

    fn open_file_picker(&mut self, cx: &mut Context<Self>) {
        let rx = cx.prompt_for_paths(PathPromptOptions {
            files: true,
            directories: false,
            multiple: true,
            prompt: None,
        });

        cx.spawn(async move |this, cx| {
            if let Ok(Ok(Some(paths))) = rx.await {
                let _ = this.update(cx, |app, cx| {
                    app.load_files(paths, cx);
                });
            }
        })
        .detach();
    }

    fn cancel_current_load(&mut self, cx: &mut Context<Self>) {
        if let Some(state) = self.loading_state.take() {
            state.cancel_flag.store(true, Ordering::Relaxed);
        }
        self.load_seq += 1;
        cx.notify();
    }

    fn clear_transient_ui(&mut self) {
        self.active_input = None;
        self.scrollbar_drag_offset = None;
        self.export_modal_open = false;
        self.shortcuts_modal_open = false;
    }

    fn load_files(&mut self, raw_paths: Vec<PathBuf>, cx: &mut Context<Self>) {
        let valid_paths: Vec<PathBuf> = raw_paths
            .into_iter()
            .filter(|p| p.is_file() && is_supported_log_path(p))
            .collect();

        if valid_paths.is_empty() {
            self.show_toast(
                "Por favor, envie um arquivo .log, .txt, .out ou .gz válido.",
                ToastKind::Error,
                cx,
            );
            return;
        }

        self.cancel_current_load(cx);
        let my_seq = self.load_seq;

        let total_bytes: u64 = valid_paths
            .iter()
            .map(|p| std::fs::metadata(p).map(|m| m.len()).unwrap_or(0))
            .sum();

        let first_name = valid_paths[0]
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "arquivo.log".to_string());

        let (short_title, label) = if valid_paths.len() == 1 {
            (
                first_name.clone(),
                format!("{first_name} ({})", format_bytes(total_bytes)),
            )
        } else {
            (
                format!("{first_name} (+{})", valid_paths.len() - 1),
                format!(
                    "{} arquivos ({})",
                    valid_paths.len(),
                    format_bytes(total_bytes)
                ),
            )
        };

        let meta = LoadTabMeta {
            short_title,
            loaded_label: label.clone(),
            file_id: Some(get_files_storage_key(&valid_paths)),
        };

        let cancel_flag = Arc::new(AtomicBool::new(false));
        self.loading_state = Some(LoadingState {
            label,
            progress_pct: 5,
            detail: "Iniciando leitura em blocos...".to_string(),
            cancel_flag: Arc::clone(&cancel_flag),
        });
        cx.notify();

        let (tx, mut rx) = futures::channel::mpsc::unbounded::<LoadMessage>();
        let worker_cancel = Arc::clone(&cancel_flag);

        std::thread::spawn(move || {
            let tx_prog = tx.clone();
            let result = parse_files_streaming(&valid_paths, &worker_cancel, move |progress| {
                let _ = tx_prog.unbounded_send(LoadMessage::Progress(progress));
            });
            let mapped = result.map_err(|e| e.to_string());
            let _ = tx.unbounded_send(LoadMessage::Done(mapped));
        });

        cx.spawn(async move |this, cx| {
            let mut meta = Some(meta);
            while let Some(msg) = rx.next().await {
                let keep_going = this
                    .update(cx, |app, cx| {
                        if app.load_seq != my_seq {
                            return false;
                        }
                        match msg {
                            LoadMessage::Progress(p) => {
                                if let Some(state) = app.loading_state.as_mut() {
                                    state.progress_pct = p.progress_pct;
                                    state.detail = format!(
                                        "{}% • {} linhas ({} agrupadas)",
                                        p.progress_pct,
                                        format_pt_br_number(p.processed_lines),
                                        format_pt_br_number(p.unique_entries)
                                    );
                                }
                                cx.notify();
                                true
                            }
                            LoadMessage::Done(Ok(data)) => {
                                if let Some(tab_meta) = meta.take() {
                                    app.finish_loading_data(tab_meta, data, cx);
                                }
                                false
                            }
                            LoadMessage::Done(Err(err)) => {
                                app.loading_state = None;
                                if !err.contains("cancelada") {
                                    app.show_toast(
                                        format!("Erro ao processar log: {err}"),
                                        ToastKind::Error,
                                        cx,
                                    );
                                }
                                cx.notify();
                                false
                            }
                        }
                    })
                    .unwrap_or(false);

                if !keep_going {
                    break;
                }
            }
        })
        .detach();
    }

    fn load_pasted_text(&mut self, text: String, cx: &mut Context<Self>) {
        if text.trim().is_empty() {
            self.show_toast("Área de transferência está vazia.", ToastKind::Error, cx);
            return;
        }

        self.cancel_current_load(cx);
        let my_seq = self.load_seq;
        let bytes = text.len() as u64;
        self.paste_seq += 1;
        let paste_num = self.paste_seq;

        let short_title = format!("Colado #{paste_num}");
        let label = format!("Log colado #{paste_num} ({})", format_bytes(bytes));
        let meta = LoadTabMeta {
            short_title,
            loaded_label: label.clone(),
            file_id: None,
        };

        let cancel_flag = Arc::new(AtomicBool::new(false));
        self.loading_state = Some(LoadingState {
            label,
            progress_pct: 35,
            detail: "Processando texto colado...".to_string(),
            cancel_flag,
        });
        cx.notify();

        let (tx, mut rx) = futures::channel::mpsc::unbounded::<ParsedLogData>();
        std::thread::spawn(move || {
            let parsed = parse_text(&text);
            let _ = tx.unbounded_send(parsed);
        });

        cx.spawn(async move |this, cx| {
            if let Some(data) = rx.next().await {
                let _ = this.update(cx, |app, cx| {
                    if app.load_seq == my_seq {
                        app.finish_loading_data(meta, data, cx);
                    }
                });
            }
        })
        .detach();
    }

    fn finish_loading_data(
        &mut self,
        meta: LoadTabMeta,
        data: ParsedLogData,
        cx: &mut Context<Self>,
    ) {
        self.loading_state = None;
        self.persist_settings();
        self.clear_transient_ui();

        let tab_id = self.next_tab_id;
        self.next_tab_id += 1;
        let tab = LogTab::from_parsed(tab_id, meta, data);
        self.tabs.push(tab);
        self.active_tab_idx = self.tabs.len() - 1;
        self.view_mode = ViewMode::Viewer;
        cx.notify();
    }

    fn select_tab(&mut self, idx: usize, cx: &mut Context<Self>) {
        if idx >= self.tabs.len() || idx == self.active_tab_idx {
            return;
        }
        self.persist_settings();
        self.clear_transient_ui();
        self.active_tab_idx = idx;
        self.view_mode = ViewMode::Viewer;
        cx.notify();
    }

    fn cycle_tab(&mut self, forward: bool, cx: &mut Context<Self>) {
        let len = self.tabs.len();
        if len <= 1 {
            return;
        }
        let next = if forward {
            (self.active_tab_idx + 1) % len
        } else {
            (self.active_tab_idx + len - 1) % len
        };
        self.select_tab(next, cx);
    }

    fn close_tab(&mut self, idx: usize, cx: &mut Context<Self>) {
        if idx >= self.tabs.len() {
            return;
        }
        self.tabs[idx].persist_settings();
        self.tabs.remove(idx);
        self.clear_transient_ui();

        if self.tabs.is_empty() {
            self.active_tab_idx = 0;
            self.view_mode = ViewMode::Home;
        } else if idx < self.active_tab_idx {
            self.active_tab_idx -= 1;
        } else if self.active_tab_idx >= self.tabs.len() {
            self.active_tab_idx = self.tabs.len() - 1;
        }
        cx.notify();
    }

    fn close_viewer(&mut self, cx: &mut Context<Self>) {
        self.close_tab(self.active_tab_idx, cx);
    }

    fn toggle_pin_entry(&mut self, entry_idx: usize, cx: &mut Context<Self>) {
        let Some(tab) = self.active_tab_mut() else {
            return;
        };
        let Some(entry) = tab.entries.get(entry_idx) else {
            return;
        };
        let sig = get_log_signature(entry);
        if sig.is_empty() {
            return;
        }
        if !tab.pinned_signatures.remove(&sig) {
            tab.pinned_signatures.insert(sig);
        }
        tab.persist_settings();
        if tab.criteria.pinned_only {
            tab.apply_filters();
        }
        cx.notify();
    }

    fn clear_all_pins(&mut self, cx: &mut Context<Self>) {
        let Some(tab) = self.active_tab_mut() else {
            return;
        };
        if tab.pinned_signatures.is_empty() {
            return;
        }
        tab.pinned_signatures.clear();
        if tab.criteria.pinned_only {
            tab.criteria.pinned_only = false;
        }
        tab.persist_settings();
        tab.apply_filters();
        cx.notify();
    }

    fn toggle_expand_entry(&mut self, entry_idx: usize, cx: &mut Context<Self>) {
        let Some(tab) = self.active_tab_mut() else {
            return;
        };
        if !tab.expanded_entries.remove(&entry_idx) {
            tab.expanded_entries.insert(entry_idx);
        }
        tab.rebuild_visible_rows(true);
        cx.notify();
    }

    fn toggle_all_stacktraces(&mut self, cx: &mut Context<Self>) {
        let Some(tab) = self.active_tab_mut() else {
            return;
        };
        let any_with_stack = tab
            .filtered
            .indices
            .iter()
            .any(|&idx| tab.entries.get(idx).is_some_and(|e| e.has_stacktrace()));
        if !any_with_stack {
            return;
        }

        tab.global_expand_state = !tab.global_expand_state;
        if tab.global_expand_state {
            for &idx in &tab.filtered.indices {
                if tab.entries.get(idx).is_some_and(|e| e.has_stacktrace()) {
                    tab.expanded_entries.insert(idx);
                }
            }
        } else {
            tab.expanded_entries.clear();
        }
        tab.rebuild_visible_rows(true);
        cx.notify();
    }

    fn clear_all_filters(&mut self, cx: &mut Context<Self>) {
        let Some(tab) = self.active_tab_mut() else {
            return;
        };
        tab.criteria.search_query.clear();
        tab.criteria.regex_mode = false;
        tab.criteria.time_start.clear();
        tab.criteria.time_end.clear();
        tab.criteria.show_info = false;
        tab.criteria.show_warn = false;
        tab.criteria.show_error = false;
        tab.criteria.show_debug = false;
        tab.criteria.pinned_only = false;
        tab.criteria.with_stacktrace_only = false;
        tab.apply_filters();
        tab.persist_settings();
        cx.notify();
    }

    fn set_active_row(&mut self, row_ix: usize, reveal: bool, cx: &mut Context<Self>) {
        let Some(tab) = self.active_tab_mut() else {
            return;
        };
        let len = tab.visible_rows.len();
        if len == 0 {
            tab.active_row = 0;
            return;
        }
        tab.active_row = row_ix.min(len - 1);
        if reveal {
            let target = tab.active_row;
            let viewport = tab.table_bounds();
            if let Some(item_bounds) = tab.list_state.bounds_for_item(target)
                && viewport.size.height > px(0.)
            {
                if item_bounds.top() < viewport.top() {
                    tab.list_state.scroll_to(ListOffset {
                        item_ix: target,
                        offset_in_item: px(0.),
                    });
                } else if item_bounds.bottom() > viewport.bottom() {
                    if target + 1 >= len {
                        tab.list_state.scroll_to(ListOffset {
                            item_ix: len,
                            offset_in_item: px(0.),
                        });
                    } else {
                        tab.list_state.scroll_to_reveal_item(target);
                    }
                }
            } else if target == 0 {
                tab.list_state.scroll_to(ListOffset {
                    item_ix: 0,
                    offset_in_item: px(0.),
                });
            } else if target + 1 >= len {
                tab.list_state.scroll_to(ListOffset {
                    item_ix: len,
                    offset_in_item: px(0.),
                });
            } else {
                tab.list_state.scroll_to(ListOffset {
                    item_ix: target,
                    offset_in_item: px(0.),
                });
            }
        }
        cx.notify();
    }

    fn copy_active_row(&mut self, cx: &mut Context<Self>) {
        let text = self.active_tab().and_then(|tab| {
            let row = tab.visible_rows.get(tab.active_row).copied()?;
            match row {
                VisibleRow::EntryHeader { entry_idx, .. } => tab
                    .entries
                    .get(entry_idx)
                    .map(|e| format_log_entry_as_text(e, false)),
                VisibleRow::StackToggle { entry_idx, .. } => tab
                    .entries
                    .get(entry_idx)
                    .map(|e| format_log_entry_as_text(e, true)),
                VisibleRow::StackLine {
                    entry_idx,
                    line_idx,
                    ..
                } => tab
                    .entries
                    .get(entry_idx)
                    .and_then(|e| e.stacktrace.get(line_idx))
                    .cloned(),
            }
        });

        if let Some(txt) = text {
            cx.write_to_clipboard(ClipboardItem::new_string(txt));
            self.show_toast("Linha copiada para a área de transferência!", ToastKind::Success, cx);
        }
    }

    fn open_export_modal(&mut self, cx: &mut Context<Self>) {
        if self
            .active_tab()
            .is_none_or(|tab| tab.filtered.indices.is_empty())
        {
            self.show_toast("Não há logs filtrados para exportar.", ToastKind::Error, cx);
            return;
        }
        self.active_input = None;
        self.export_modal_open = true;
        cx.notify();
    }

    fn execute_export(&mut self, cx: &mut Context<Self>) {
        let Some(tab) = self.active_tab() else {
            return;
        };
        let format = self.export_format;
        let bytes = build_export_bytes(
            &tab.entries,
            &tab.filtered.indices,
            tab.criteria.sort_order,
            format,
        );
        let suggested_name = format!(
            "logs-export-{}.{}",
            unix_timestamp_label(),
            format.extension()
        );
        let default_dir = std::env::current_dir().unwrap_or_else(|_| std::env::temp_dir());
        let rx = cx.prompt_for_new_path(&default_dir, Some(&suggested_name));

        cx.spawn(async move |this, cx| {
            if let Ok(Ok(Some(dest_path))) = rx.await {
                let write_res = std::fs::write(&dest_path, bytes);
                let _ = this.update(cx, |app, cx| match write_res {
                    Ok(()) => {
                        app.export_modal_open = false;
                        app.show_toast(
                            format!("Exportação .{} gerada com sucesso!", format.extension()),
                            ToastKind::Success,
                            cx,
                        );
                    }
                    Err(err) => {
                        app.show_toast(
                            format!("Erro ao salvar exportação: {err}"),
                            ToastKind::Error,
                            cx,
                        );
                    }
                });
            }
        })
        .detach();
    }

    fn handle_key_down(&mut self, event: &KeyDownEvent, _window: &mut Window, cx: &mut Context<Self>) {
        let key = event.keystroke.key.as_str();
        let key_char = event.keystroke.key_char.as_deref();
        let mods = event.keystroke.modifiers;

        if self.export_modal_open || self.shortcuts_modal_open {
            if key == "escape" {
                self.export_modal_open = false;
                self.shortcuts_modal_open = false;
                cx.stop_propagation();
                cx.notify();
            }
            return;
        }

        if self.loading_state.is_some() {
            if key == "escape" {
                self.cancel_current_load(cx);
                self.show_toast("Leitura cancelada.", ToastKind::Info, cx);
                cx.stop_propagation();
            }
            return;
        }

        if self.view_mode == ViewMode::Viewer && (mods.control || mods.platform) && !mods.alt {
            if key == "tab" || key == "pagedown" || key == "pageup" {
                let forward = match key {
                    "pagedown" => true,
                    "pageup" => false,
                    _ => !mods.shift,
                };
                self.cycle_tab(forward, cx);
                cx.stop_propagation();
                return;
            }
            if key == "w" {
                self.close_tab(self.active_tab_idx, cx);
                cx.stop_propagation();
                return;
            }
        }

        if let Some(input_kind) = self.active_input {
            self.handle_input_keystroke(input_kind, event, cx);
            cx.stop_propagation();
            return;
        }

        // Atalhos globais fora de campos de texto
        if (mods.control || mods.platform) && key == "o" {
            self.open_file_picker(cx);
            cx.stop_propagation();
            return;
        }

        if (mods.control || mods.platform)
            && key == "v"
            && let Some(text) = cx.read_from_clipboard().and_then(|item| item.text())
        {
            self.load_pasted_text(text, cx);
            cx.stop_propagation();
            return;
        }

        if self.view_mode != ViewMode::Viewer || self.active_tab().is_none() {
            return;
        }

        if (mods.control || mods.platform) && key == "c" {
            self.copy_active_row(cx);
            cx.stop_propagation();
            return;
        }

        if key == "escape" {
            self.close_viewer(cx);
            cx.stop_propagation();
            return;
        }

        if (key == "/" || key_char == Some("/")) && !mods.control && !mods.alt {
            self.active_input = Some(ActiveInput::Search);
            cx.stop_propagation();
            cx.notify();
            return;
        }

        if key_char == Some("?") || key == "f1" {
            self.shortcuts_modal_open = !self.shortcuts_modal_open;
            cx.stop_propagation();
            cx.notify();
            return;
        }

        if mods.control || mods.alt || mods.platform {
            return;
        }

        match key {
            "p" => {
                if let Some(entry_idx) = self
                    .active_tab()
                    .and_then(|t| t.visible_rows.get(t.active_row).copied())
                    .map(row_entry_idx)
                {
                    self.toggle_pin_entry(entry_idx, cx);
                }
            }
            "i" | "w" | "e" | "d" | "f" => {
                if let Some(tab) = self.active_tab_mut() {
                    match key {
                        "i" => tab.criteria.show_info = !tab.criteria.show_info,
                        "w" => tab.criteria.show_warn = !tab.criteria.show_warn,
                        "e" => tab.criteria.show_error = !tab.criteria.show_error,
                        "d" => tab.criteria.show_debug = !tab.criteria.show_debug,
                        "f" => tab.criteria.pinned_only = !tab.criteria.pinned_only,
                        _ => {}
                    }
                    tab.apply_filters();
                    tab.persist_settings();
                    cx.notify();
                }
            }
            "enter" => {
                if mods.shift {
                    self.toggle_all_stacktraces(cx);
                } else if let Some(entry_idx) = self.active_tab().and_then(|t| {
                    let row = t.visible_rows.get(t.active_row).copied()?;
                    let idx = row_entry_idx(row);
                    t.entries.get(idx).is_some_and(|e| e.has_stacktrace()).then_some(idx)
                }) {
                    self.toggle_expand_entry(entry_idx, cx);
                }
            }
            "up" | "down" => {
                let Some((len, active_row)) = self
                    .active_tab()
                    .map(|t| (t.visible_rows.len(), t.active_row))
                else {
                    return;
                };
                if len == 0 {
                    return;
                }
                let step = if mods.shift { 10 } else { 1 };
                let next = if key == "down" {
                    if mods.shift {
                        (active_row + step).min(len - 1)
                    } else if active_row + 1 >= len {
                        0
                    } else {
                        active_row + 1
                    }
                } else if mods.shift {
                    active_row.saturating_sub(step)
                } else if active_row == 0 {
                    len - 1
                } else {
                    active_row - 1
                };
                self.set_active_row(next, true, cx);
            }
            "pageup" | "left" => {
                if let Some((len, active_row)) = self
                    .active_tab()
                    .map(|t| (t.visible_rows.len(), t.active_row))
                    && len > 0
                {
                    let next = active_row.saturating_sub(40);
                    self.set_active_row(next, true, cx);
                }
            }
            "pagedown" | "right" => {
                if let Some((len, active_row)) = self
                    .active_tab()
                    .map(|t| (t.visible_rows.len(), t.active_row))
                    && len > 0
                {
                    let next = (active_row + 40).min(len - 1);
                    self.set_active_row(next, true, cx);
                }
            }
            "home" => {
                if self
                    .active_tab()
                    .is_some_and(|t| !t.visible_rows.is_empty())
                {
                    self.set_active_row(0, true, cx);
                }
            }
            "end" => {
                if let Some(len) = self
                    .active_tab()
                    .map(|t| t.visible_rows.len())
                    .filter(|&len| len > 0)
                {
                    self.set_active_row(len - 1, true, cx);
                }
            }
            _ => {}
        }
    }

    fn handle_input_keystroke(
        &mut self,
        input_kind: ActiveInput,
        event: &KeyDownEvent,
        cx: &mut Context<Self>,
    ) {
        let key = event.keystroke.key.as_str();
        let mods = event.keystroke.modifiers;

        match key {
            "escape" => {
                self.active_input = None;
                cx.notify();
                return;
            }
            "enter" => {
                self.active_input = None;
                self.apply_filters(cx);
                self.persist_settings();
                return;
            }
            "tab" => {
                self.active_input = match (input_kind, mods.shift) {
                    (ActiveInput::Search, false) => Some(ActiveInput::TimeStart),
                    (ActiveInput::TimeStart, false) => Some(ActiveInput::TimeEnd),
                    (ActiveInput::TimeEnd, false) => None,
                    (ActiveInput::Search, true) => None,
                    (ActiveInput::TimeStart, true) => Some(ActiveInput::Search),
                    (ActiveInput::TimeEnd, true) => Some(ActiveInput::TimeStart),
                };
                cx.notify();
                return;
            }
            "backspace" => {
                if let Some(tab) = self.active_tab_mut() {
                    let target = tab.active_input_mut(input_kind);
                    if mods.control {
                        target.clear();
                    } else {
                        target.pop();
                        if matches!(input_kind, ActiveInput::TimeStart | ActiveInput::TimeEnd)
                            && target.ends_with(':')
                        {
                            target.pop();
                        }
                    }
                    tab.apply_filters();
                    tab.persist_settings();
                    cx.notify();
                }
                return;
            }
            _ => {}
        }

        if (mods.control || mods.platform) && key == "c" {
            let txt = self.active_input_str(input_kind).to_string();
            if !txt.is_empty() {
                cx.write_to_clipboard(ClipboardItem::new_string(txt));
            }
            return;
        }

        if (mods.control || mods.platform) && key == "v" {
            if let Some(pasted) = cx.read_from_clipboard().and_then(|item| item.text()) {
                let single_line = pasted.replace(['\r', '\n'], "");
                if let Some(tab) = self.active_tab_mut() {
                    tab.append_to_input(input_kind, &single_line);
                    tab.apply_filters();
                    tab.persist_settings();
                    cx.notify();
                }
            }
            return;
        }

        if !mods.control
            && !mods.platform
            && !mods.alt
            && let Some(ch) = event.keystroke.key_char.as_deref()
            && let Some(tab) = self.active_tab_mut()
        {
            tab.append_to_input(input_kind, ch);
            tab.apply_filters();
            tab.persist_settings();
            cx.notify();
        }
    }

    fn active_input_str(&self, kind: ActiveInput) -> &str {
        self.active_tab()
            .map(|t| t.active_input_str(kind))
            .unwrap_or("")
    }

    fn render_home(&mut self, cx: &mut Context<Self>) -> AnyElement {
        div()
            .id("home-screen")
            .size_full()
            .flex()
            .flex_col()
            .items_center()
            .justify_center()
            .p_8()
            .gap_6()
            .on_drag_move::<ExternalPaths>(|_ev, _window, _cx| {})
            .drag_over::<ExternalPaths>(|style, _, _, _| {
                style.bg(rgba(0xF2511B0F))
            })
            .on_drop(cx.listener(|this, paths: &ExternalPaths, _window, cx| {
                this.load_files(paths.paths().to_vec(), cx);
            }))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .items_center()
                    .gap_2()
                    .child(
                        div()
                            .text_3xl()
                            .font_weight(FontWeight::BOLD)
                            .text_color(rgb(0xFFFFFF))
                            .child("Leitor de Logs TOTVS/Fluig"),
                    )
                    .child(
                        div()
                            .text_sm()
                            .text_color(col_text_muted())
                            .child("Analise logs gigantes localmente em streaming — versão nativa em Rust + GPUI."),
                    ),
            )
            .child(
                div()
                    .id("dropzone-card")
                    .w(px(720.))
                    .max_w_full()
                    .px_8()
                    .py_10()
                    .rounded_2xl()
                    .border_2()
                    .border_dashed()
                    .border_color(col_accent())
                    .bg(rgba(0x131426BF))
                    .flex()
                    .flex_col()
                    .items_center()
                    .gap_4()
                    .cursor_pointer()
                    .hover(|s| s.bg(col_bg_panel()).border_color(rgb(0xFF7A48)))
                    .drag_over::<ExternalPaths>(|style, _, _, _| {
                        style.bg(col_bg_panel()).border_color(rgb(0xFF7A48))
                    })
                    .on_drop(cx.listener(|this, paths: &ExternalPaths, _window, cx| {
                        this.load_files(paths.paths().to_vec(), cx);
                    }))
                    .on_click(cx.listener(|this, _ev, _window, cx| {
                        this.open_file_picker(cx);
                    }))
                    .child(
                        div()
                            .px_4()
                            .py_2()
                            .rounded_full()
                            .bg(rgba(0xF2511B24))
                            .text_color(rgb(0xFFB196))
                            .text_sm()
                            .font_weight(FontWeight::SEMIBOLD)
                            .child("📄 Arraste e solte o arquivo de log aqui ou clique para selecionar"),
                    )
                    .child(
                        div()
                            .text_xs()
                            .text_color(col_text_muted())
                            .text_center()
                            .child("Suporta .log, logs rotacionados, .txt, .out, .log.gz, múltiplos arquivos e Ctrl+V"),
                    ),
            )
            .child(
                div()
                    .text_xs()
                    .text_color(col_text_muted())
                    .child("Criado por Rafael Reis"),
            )
            .into_any_element()
    }

    fn render_viewer(&mut self, cx: &mut Context<Self>) -> AnyElement {
        if self.active_tab().is_none() {
            return self.render_home(cx);
        }

        div()
            .id("viewer-root")
            .size_full()
            .p_3()
            .drag_over::<ExternalPaths>(|style, _, _, _| {
                style.border_1().border_color(col_accent())
            })
            .on_drop(cx.listener(|this, paths: &ExternalPaths, _window, cx| {
                this.load_files(paths.paths().to_vec(), cx);
            }))
            .child(
                div()
                    .size_full()
                    .rounded_xl()
                    .bg(col_bg_popup())
                    .border_1()
                    .border_color(col_border())
                    .p_3()
                    .flex()
                    .flex_col()
                    .gap_2()
                    .child(self.render_topbar(cx))
                    .child(self.render_dashboard(cx))
                    .child(self.render_filters_bar(cx))
                    .child(self.render_log_table(cx)),
            )
            .into_any_element()
    }

    fn render_topbar(&mut self, cx: &mut Context<Self>) -> AnyElement {
        let tabs_count = self.tabs.len();
        let tab_pills: Vec<(usize, u64, String, bool)> = self
            .tabs
            .iter()
            .enumerate()
            .map(|(idx, tab)| {
                let is_active = idx == self.active_tab_idx;
                let lines_info = if tab.stats.processed_lines > 0 {
                    format!(" • {} linhas", format_pt_br_number(tab.stats.processed_lines))
                } else {
                    String::new()
                };
                let label = if tabs_count == 1 {
                    format!("📄 {}{}", tab.loaded_label, lines_info)
                } else if is_active {
                    format!("📄 {}{}", tab.short_title, lines_info)
                } else {
                    format!("📄 {}", tab.short_title)
                };
                (idx, tab.id, label, is_active)
            })
            .collect();

        let (sort_order, global_expand_state) = self
            .active_tab()
            .map(|t| (t.criteria.sort_order, t.global_expand_state))
            .unwrap_or((SortOrder::Desc, false));

        let sort_label = if sort_order == SortOrder::Asc {
            "↑ Cronológica"
        } else {
            "↓ Mais recentes"
        };
        let expand_label = if global_expand_state {
            "▾ Recolher tudo"
        } else {
            "▸ Expandir tudo"
        };
        let close_label = if tabs_count > 1 {
            "Fechar aba"
        } else {
            "Fechar"
        };

        div()
            .w_full()
            .px_3()
            .py_2()
            .rounded_lg()
            .bg(col_bg_surface())
            .border_1()
            .border_color(col_border())
            .flex()
            .items_center()
            .justify_between()
            .gap_3()
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .items_center()
                    .gap_2()
                    .overflow_hidden()
                    .child(
                        div()
                            .min_w_0()
                            .flex()
                            .items_center()
                            .gap_1p5()
                            .overflow_hidden()
                            .children(tab_pills.into_iter().map(
                                |(tab_idx, tab_id, label, is_active)| {
                                    div()
                                        .id(("tab-pill", tab_id))
                                        .min_w(px(if is_active { 110. } else { 52. }))
                                        .max_w(px(if tabs_count == 1 {
                                            420.
                                        } else if is_active {
                                            280.
                                        } else {
                                            180.
                                        }))
                                        .flex_shrink()
                                        .px_2p5()
                                        .py_1()
                                        .rounded_md()
                                        .bg(if is_active {
                                            rgba(0xF2511B29)
                                        } else {
                                            col_bg_log_area()
                                        })
                                        .border_1()
                                        .border_color(if is_active {
                                            col_accent()
                                        } else {
                                            col_border()
                                        })
                                        .flex()
                                        .items_center()
                                        .gap_1p5()
                                        .cursor_pointer()
                                        .hover(|s| {
                                            if is_active {
                                                s.bg(rgba(0xF2511B38))
                                            } else {
                                                s.bg(col_bg_panel()).border_color(col_accent())
                                            }
                                        })
                                        .on_click(cx.listener(move |this, _ev, _window, cx| {
                                            this.select_tab(tab_idx, cx);
                                        }))
                                        .child(
                                            div()
                                                .flex_1()
                                                .min_w_0()
                                                .truncate()
                                                .text_xs()
                                                .font_weight(if is_active {
                                                    FontWeight::SEMIBOLD
                                                } else {
                                                    FontWeight::MEDIUM
                                                })
                                                .text_color(if is_active {
                                                    rgb(0xFFFFFF)
                                                } else {
                                                    col_text_muted()
                                                })
                                                .child(label),
                                        )
                                        .child(
                                            div()
                                                .id(("tab-close", tab_id))
                                                .flex_none()
                                                .px_1()
                                                .rounded_sm()
                                                .text_xs()
                                                .text_color(if is_active {
                                                    rgb(0xFFD2C2)
                                                } else {
                                                    col_text_muted()
                                                })
                                                .cursor_pointer()
                                                .hover(|s| {
                                                    s.bg(rgba(0xFFFFFF20))
                                                        .text_color(rgb(0xFFFFFF))
                                                })
                                                .on_click(cx.listener(
                                                    move |this, _ev, _window, cx| {
                                                        cx.stop_propagation();
                                                        this.close_tab(tab_idx, cx);
                                                    },
                                                ))
                                                .child("✕"),
                                        )
                                },
                            )),
                    )
                    .child(
                        toolbar_btn("btn-open-another", "+ Abrir outro", false)
                            .flex_none()
                            .on_click(cx.listener(|this, _ev, _window, cx| {
                                this.active_input = None;
                                this.open_file_picker(cx);
                            })),
                    )
                    .child(
                        toolbar_btn("btn-paste-top", "📋 Colar", false)
                            .flex_none()
                            .on_click(cx.listener(|this, _ev, _window, cx| {
                                this.active_input = None;
                                if let Some(txt) =
                                    cx.read_from_clipboard().and_then(|c| c.text())
                                {
                                    this.load_pasted_text(txt, cx);
                                } else {
                                    this.show_toast(
                                        "Área de transferência vazia.",
                                        ToastKind::Error,
                                        cx,
                                    );
                                }
                            })),
                    ),
            )
            .child(
                div()
                    .flex_none()
                    .flex()
                    .items_center()
                    .gap_2()
                    .child(
                        toolbar_btn("btn-sort", sort_label, sort_order == SortOrder::Asc).on_click(
                            cx.listener(|this, _ev, _window, cx| {
                                this.active_input = None;
                                if let Some(tab) = this.active_tab_mut() {
                                    tab.criteria.sort_order = match tab.criteria.sort_order {
                                        SortOrder::Desc => SortOrder::Asc,
                                        SortOrder::Asc => SortOrder::Desc,
                                    };
                                    tab.apply_filters();
                                    tab.persist_settings();
                                }
                                cx.notify();
                            }),
                        ),
                    )
                    .child(
                        toolbar_btn("btn-expand-all", expand_label, global_expand_state).on_click(
                            cx.listener(|this, _ev, _window, cx| {
                                this.active_input = None;
                                this.toggle_all_stacktraces(cx);
                            }),
                        ),
                    )
                    .child(
                        toolbar_btn("btn-export", "Exportar Logs", false).on_click(cx.listener(
                            |this, _ev, _window, cx| {
                                this.open_export_modal(cx);
                            },
                        )),
                    )
                    .child(
                        toolbar_btn("btn-shortcuts", "?", self.shortcuts_modal_open).on_click(
                            cx.listener(|this, _ev, _window, cx| {
                                this.active_input = None;
                                this.shortcuts_modal_open = !this.shortcuts_modal_open;
                                cx.notify();
                            }),
                        ),
                    )
                    .child(
                        div()
                            .id("btn-close-viewer")
                            .px_3()
                            .py_1()
                            .rounded_md()
                            .bg(col_accent())
                            .border_1()
                            .border_color(col_accent())
                            .text_xs()
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(rgb(0xFFFFFF))
                            .cursor_pointer()
                            .hover(|s| s.bg(col_accent_hover()))
                            .on_click(cx.listener(|this, _ev, _window, cx| {
                                this.close_viewer(cx);
                            }))
                            .child(close_label),
                    ),
            )
            .into_any_element()
    }

    fn render_dashboard(&mut self, cx: &mut Context<Self>) -> AnyElement {
        let Some(tab) = self.active_tab() else {
            return div().into_any_element();
        };

        let total = format_pt_br_number(tab.filtered.visible_occurrences);
        let errors = format_pt_br_number(tab.filtered.visible_errors);
        let warnings = format_pt_br_number(tab.filtered.visible_warnings);
        let visible = format_pt_br_number(tab.filtered.visible_entries);
        let duration = tab.filtered.visible_duration_text.clone();
        let full_duration = format_duration_ms(tab.stats.duration_ms);
        let duration_label = if duration == "--" {
            full_duration
        } else {
            duration
        };
        let err_active = tab.criteria.show_error
            && !tab.criteria.show_warn
            && !tab.criteria.show_info
            && !tab.criteria.show_debug;
        let warn_active = tab.criteria.show_warn
            && !tab.criteria.show_error
            && !tab.criteria.show_info
            && !tab.criteria.show_debug;

        div()
            .w_full()
            .flex()
            .items_center()
            .gap_2()
            .child(
                stat_card("stat-all", "Ocorrências", total, col_text(), true, false).on_click(
                    cx.listener(|this, _ev, _window, cx| {
                        this.active_input = None;
                        if let Some(tab) = this.active_tab_mut() {
                            tab.criteria.show_info = false;
                            tab.criteria.show_warn = false;
                            tab.criteria.show_error = false;
                            tab.criteria.show_debug = false;
                            tab.apply_filters();
                            tab.persist_settings();
                        }
                        cx.notify();
                    }),
                ),
            )
            .child(
                stat_card("stat-err", "Erros", errors, col_error(), true, err_active).on_click(
                    cx.listener(|this, _ev, _window, cx| {
                        this.active_input = None;
                        if let Some(tab) = this.active_tab_mut() {
                            let toggle_off = tab.criteria.show_error
                                && !tab.criteria.show_warn
                                && !tab.criteria.show_info
                                && !tab.criteria.show_debug;
                            tab.criteria.show_info = false;
                            tab.criteria.show_warn = false;
                            tab.criteria.show_debug = false;
                            tab.criteria.show_error = !toggle_off;
                            tab.apply_filters();
                            tab.persist_settings();
                        }
                        cx.notify();
                    }),
                ),
            )
            .child(
                stat_card(
                    "stat-warn",
                    "Alertas",
                    warnings,
                    col_warn(),
                    true,
                    warn_active,
                )
                .on_click(cx.listener(|this, _ev, _window, cx| {
                    this.active_input = None;
                    if let Some(tab) = this.active_tab_mut() {
                        let toggle_off = tab.criteria.show_warn
                            && !tab.criteria.show_error
                            && !tab.criteria.show_info
                            && !tab.criteria.show_debug;
                        tab.criteria.show_info = false;
                        tab.criteria.show_error = false;
                        tab.criteria.show_debug = false;
                        tab.criteria.show_warn = !toggle_off;
                        tab.apply_filters();
                        tab.persist_settings();
                    }
                    cx.notify();
                })),
            )
            .child(stat_card(
                "stat-visible",
                "Filtrados",
                visible,
                col_text(),
                false,
                false,
            ))
            .child(stat_card(
                "stat-duration",
                "Duração",
                duration_label,
                col_info(),
                false,
                false,
            ))
            .into_any_element()
    }

    fn render_filters_bar(&mut self, cx: &mut Context<Self>) -> AnyElement {
        let Some(tab) = self.active_tab() else {
            return div().into_any_element();
        };

        let search_focused = self.active_input == Some(ActiveInput::Search);
        let start_focused = self.active_input == Some(ActiveInput::TimeStart);
        let end_focused = self.active_input == Some(ActiveInput::TimeEnd);
        let regex_invalid =
            tab.filtered.search_spec.is_regex && !tab.filtered.search_spec.is_valid_regex;

        let regex_mode = tab.criteria.regex_mode;
        let show_info = tab.criteria.show_info;
        let show_warn = tab.criteria.show_warn;
        let show_error = tab.criteria.show_error;
        let show_debug = tab.criteria.show_debug;
        let pinned_only = tab.criteria.pinned_only;
        let with_stacktrace_only = tab.criteria.with_stacktrace_only;

        let search_text = tab.criteria.search_query.clone();
        let time_start = tab.criteria.time_start.clone();
        let time_end = tab.criteria.time_end.clone();
        let has_search = !search_text.is_empty();
        let has_time = !time_start.is_empty() || !time_end.is_empty();
        let has_filters = tab.criteria.has_any_filter();

        div()
            .w_full()
            .px_3()
            .py_2()
            .rounded_lg()
            .bg(col_bg_surface())
            .border_1()
            .border_color(col_border())
            .flex()
            .flex_wrap()
            .items_center()
            .gap_2()
            // Search input
            .child(
                div()
                    .id("search-box")
                    .flex_1()
                    .min_w(px(260.))
                    .h(px(32.))
                    .px_2()
                    .rounded_md()
                    .bg(col_bg_log_area())
                    .border_1()
                    .border_color(if regex_invalid {
                        col_error()
                    } else if search_focused {
                        col_accent()
                    } else {
                        col_border()
                    })
                    .flex()
                    .items_center()
                    .gap_2()
                    .cursor_text()
                    .on_click(cx.listener(|this, _ev, _window, cx| {
                        this.active_input = Some(ActiveInput::Search);
                        cx.notify();
                    }))
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .truncate()
                            .text_xs()
                            .text_color(if has_search { col_text() } else { col_text_muted() })
                            .child(if has_search {
                                if search_focused {
                                    format!("{search_text}|")
                                } else {
                                    search_text
                                }
                            } else if search_focused {
                                "| Buscar... (-termo exclui ou /regex/)".to_string()
                            } else {
                                "Buscar... (use -termo para excluir ou /regex/)".to_string()
                            }),
                    )
                    .child(
                        div()
                            .id("regex-toggle-btn")
                            .px_2()
                            .py_0p5()
                            .rounded_sm()
                            .text_xs()
                            .font_weight(FontWeight::BOLD)
                            .cursor_pointer()
                            .bg(if regex_mode {
                                col_accent()
                            } else {
                                col_bg_panel()
                            })
                            .text_color(if regex_mode {
                                rgb(0xFFFFFF)
                            } else {
                                col_text_muted()
                            })
                            .on_click(cx.listener(|this, _ev, _window, cx| {
                                cx.stop_propagation();
                                if let Some(tab) = this.active_tab_mut() {
                                    tab.criteria.regex_mode = !tab.criteria.regex_mode;
                                    tab.apply_filters();
                                    tab.persist_settings();
                                }
                                cx.notify();
                            }))
                            .child(".*"),
                    )
                    .when(has_search, |el| {
                        el.child(
                            div()
                                .id("clear-search-btn")
                                .px_1p5()
                                .py_0p5()
                                .rounded_sm()
                                .text_xs()
                                .text_color(col_text_muted())
                                .cursor_pointer()
                                .hover(|s| s.text_color(col_text()))
                                .on_click(cx.listener(|this, _ev, _window, cx| {
                                    cx.stop_propagation();
                                    if let Some(tab) = this.active_tab_mut() {
                                        tab.criteria.search_query.clear();
                                        tab.apply_filters();
                                        tab.persist_settings();
                                    }
                                    cx.notify();
                                }))
                                .child("✕"),
                        )
                    }),
            )
            // Time filters
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap_1()
                    .child(
                        time_input_box("time-start-box", &time_start, "Início HH:MM", start_focused)
                            .on_click(cx.listener(|this, _ev, _window, cx| {
                                this.active_input = Some(ActiveInput::TimeStart);
                                cx.notify();
                            })),
                    )
                    .child(div().text_xs().text_color(col_text_muted()).child("-"))
                    .child(
                        time_input_box("time-end-box", &time_end, "Fim HH:MM", end_focused)
                            .on_click(cx.listener(|this, _ev, _window, cx| {
                                this.active_input = Some(ActiveInput::TimeEnd);
                                cx.notify();
                            })),
                    )
                    .child(
                        div()
                            .id("clear-time-btn")
                            .w(px(26.))
                            .h(px(32.))
                            .rounded_md()
                            .bg(col_bg_log_area())
                            .border_1()
                            .border_color(col_border())
                            .flex()
                            .items_center()
                            .justify_center()
                            .text_xs()
                            .text_color(col_text_muted())
                            .when(!has_time, |d| d.opacity(0.35))
                            .when(has_time, |d| {
                                d.cursor_pointer()
                                    .hover(|s| s.text_color(col_text()).border_color(col_error()))
                                    .on_click(cx.listener(|this, _ev, _window, cx| {
                                        this.active_input = None;
                                        if let Some(tab) = this.active_tab_mut() {
                                            tab.criteria.time_start.clear();
                                            tab.criteria.time_end.clear();
                                            tab.apply_filters();
                                            tab.persist_settings();
                                        }
                                        cx.notify();
                                    }))
                            })
                            .child("✕"),
                    ),
            )
            // Level & flag chips
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap_1p5()
                    .child(
                        filter_chip("chk-info", "INFO", show_info, col_info(), col_info_bg())
                            .on_click(cx.listener(|this, _ev, _window, cx| {
                                this.active_input = None;
                                if let Some(tab) = this.active_tab_mut() {
                                    tab.criteria.show_info = !tab.criteria.show_info;
                                    tab.apply_filters();
                                    tab.persist_settings();
                                }
                                cx.notify();
                            })),
                    )
                    .child(
                        filter_chip("chk-warn", "WARN", show_warn, col_warn(), col_warn_bg())
                            .on_click(cx.listener(|this, _ev, _window, cx| {
                                this.active_input = None;
                                if let Some(tab) = this.active_tab_mut() {
                                    tab.criteria.show_warn = !tab.criteria.show_warn;
                                    tab.apply_filters();
                                    tab.persist_settings();
                                }
                                cx.notify();
                            })),
                    )
                    .child(
                        filter_chip("chk-err", "ERROR", show_error, col_error(), col_error_bg())
                            .on_click(cx.listener(|this, _ev, _window, cx| {
                                this.active_input = None;
                                if let Some(tab) = this.active_tab_mut() {
                                    tab.criteria.show_error = !tab.criteria.show_error;
                                    tab.apply_filters();
                                    tab.persist_settings();
                                }
                                cx.notify();
                            })),
                    )
                    .child(
                        filter_chip("chk-dbg", "DEBUG", show_debug, col_debug(), col_debug_bg())
                            .on_click(cx.listener(|this, _ev, _window, cx| {
                                this.active_input = None;
                                if let Some(tab) = this.active_tab_mut() {
                                    tab.criteria.show_debug = !tab.criteria.show_debug;
                                    tab.apply_filters();
                                    tab.persist_settings();
                                }
                                cx.notify();
                            })),
                    )
                    .child(
                        filter_chip(
                            "chk-pin",
                            "📍 Fixados",
                            pinned_only,
                            col_warn(),
                            col_warn_bg(),
                        )
                        .on_click(cx.listener(|this, _ev, _window, cx| {
                            this.active_input = None;
                            if let Some(tab) = this.active_tab_mut() {
                                tab.criteria.pinned_only = !tab.criteria.pinned_only;
                                tab.apply_filters();
                                tab.persist_settings();
                            }
                            cx.notify();
                        })),
                    )
                    .child(
                        filter_chip(
                            "chk-stack",
                            "🧩 Com Detalhes",
                            with_stacktrace_only,
                            col_accent(),
                            col_accent(),
                        )
                        .on_click(cx.listener(|this, _ev, _window, cx| {
                            this.active_input = None;
                            if let Some(tab) = this.active_tab_mut() {
                                tab.criteria.with_stacktrace_only =
                                    !tab.criteria.with_stacktrace_only;
                                tab.apply_filters();
                                tab.persist_settings();
                            }
                            cx.notify();
                        })),
                    )
                    .child(
                        toolbar_btn_stateful(
                            "btn-clear-filters",
                            "Limpar filtros",
                            false,
                            has_filters,
                        )
                        .h(px(32.))
                        .flex()
                        .items_center()
                        .when(has_filters, |el| {
                            el.on_click(cx.listener(|this, _ev, _window, cx| {
                                this.active_input = None;
                                this.clear_all_filters(cx);
                            }))
                        }),
                    ),
            )
            .into_any_element()
    }

    fn render_log_table(&mut self, cx: &mut Context<Self>) -> AnyElement {
        let Some(tab) = self.active_tab() else {
            return div().into_any_element();
        };
        let row_count = tab.visible_rows.len();
        let has_pins = !tab.pinned_signatures.is_empty();
        let list_state = tab.list_state.clone();

        div()
            .flex_1()
            .min_h_0()
            .w_full()
            .rounded_lg()
            .bg(col_bg_log_area())
            .border_1()
            .border_color(col_border())
            .overflow_hidden()
            .flex()
            .flex_col()
            // Cabeçalho da tabela
            .child(
                div()
                    .w_full()
                    .h(px(32.))
                    .pl_2()
                    .pr_5()
                    .bg(col_bg_header())
                    .border_b_1()
                    .border_color(rgb(0x151624))
                    .flex()
                    .items_center()
                    .gap_2()
                    .text_xs()
                    .font_weight(FontWeight::BOLD)
                    .text_color(rgb(0xC5CDE0))
                    .child(
                        div()
                            .w(px(48.))
                            .flex_none()
                            .flex()
                            .items_center()
                            .when(has_pins, |el| {
                                el.child(
                                    div()
                                        .id("clear-pins-btn")
                                        .w(px(22.))
                                        .h(px(20.))
                                        .rounded_sm()
                                        .bg(rgba(0xE06C7529))
                                        .border_1()
                                        .border_color(rgba(0xE06C7573))
                                        .flex()
                                        .items_center()
                                        .justify_center()
                                        .text_xs()
                                        .font_weight(FontWeight::BOLD)
                                        .text_color(rgb(0xFF8B94))
                                        .cursor_pointer()
                                        .hover(|s| {
                                            s.bg(col_error())
                                                .border_color(col_error())
                                                .text_color(rgb(0xFFFFFF))
                                        })
                                        .on_click(cx.listener(|this, _ev, _window, cx| {
                                            this.clear_all_pins(cx);
                                        }))
                                        .child("✕"),
                                )
                            }),
                    )
                    .child(div().w(px(206.)).flex_none().child("DATE"))
                    .child(div().w(px(72.)).flex_none().child("LEVEL"))
                    .child(proportional_col(div(), 1.35, 180.0).child("CLASS"))
                    .child(proportional_col(div(), 0.45, 105.0).child("THREAD"))
                    .child(proportional_col(div(), 3.2, 280.0).child("MESSAGE")),
            )
            // Corpo virtualizado ou mensagem vazia
            .child(if row_count == 0 {
                div()
                    .flex_1()
                    .flex()
                    .items_center()
                    .justify_center()
                    .text_sm()
                    .text_color(col_text_muted())
                    .child("Nenhum log encontrado para este filtro.")
                    .into_any_element()
            } else {
                div()
                    .relative()
                    .flex_1()
                    .min_h_0()
                    .w_full()
                    .child(
                        list(
                            list_state,
                            cx.processor(|this, row_ix: usize, _window, cx| {
                                let Some(tab) = this.tabs.get(this.active_tab_idx) else {
                                    return div().into_any_element();
                                };
                                let Some(row) = tab.visible_rows.get(row_ix).copied() else {
                                    return div().into_any_element();
                                };
                                this.render_visible_row(tab, row_ix, row, cx)
                            }),
                        )
                        .size_full(),
                    )
                    .child(self.render_scrollbar(cx))
                    .into_any_element()
            })
            .into_any_element()
    }

    fn render_scrollbar(&mut self, cx: &mut Context<Self>) -> AnyElement {
        let Some(tab) = self.active_tab() else {
            return div().into_any_element();
        };
        let Some(metrics) = tab.scrollbar_metrics() else {
            return div().into_any_element();
        };

        let thumb_h = metrics.thumb_h;
        let track_range = metrics.track_range;
        let offset_top = metrics.offset_top;
        let total_rows = metrics.total_rows;
        let max_top_rows = metrics.max_top_rows;

        let entity = cx.entity();
        let list_state = tab.list_state.clone();
        let is_dragging = self.scrollbar_drag_offset.is_some();

        div()
            .id("log-scrollbar-track")
            .occlude()
            .absolute()
            .top_0()
            .bottom_0()
            .right_0()
            .w(px(14.))
            .bg(rgba(0x06071A70))
            .cursor_pointer()
            .child(
                div()
                    .absolute()
                    .top(offset_top)
                    .right(px(3.))
                    .w(px(8.))
                    .h(thumb_h)
                    .rounded_full()
                    .bg(if is_dragging {
                        col_accent()
                    } else {
                        rgba(0x9AA2B866)
                    })
                    .hover(|s| s.bg(col_accent())),
            )
            .child(
                canvas(
                    |_, _, _| (),
                    move |track_bounds, _, window, _| {
                        window.on_mouse_event({
                            let entity = entity.clone();
                            let list_state = list_state.clone();
                            move |ev: &MouseDownEvent, phase, _, cx| {
                                if phase != DispatchPhase::Bubble
                                    || ev.button != MouseButton::Left
                                    || !track_bounds.contains(&ev.position)
                                {
                                    return;
                                }

                                let thumb_top = track_bounds.origin.y + offset_top;
                                let thumb_bottom = thumb_top + thumb_h;

                                entity.update(cx, |this, cx| {
                                    if ev.position.y >= thumb_top && ev.position.y <= thumb_bottom {
                                        this.scrollbar_drag_offset = Some(ev.position.y - thumb_top);
                                    } else {
                                        let center_offset = thumb_h * 0.5;
                                        let track_y = (ev.position.y
                                            - track_bounds.origin.y
                                            - px(4.)
                                            - center_offset)
                                            .clamp(px(0.), track_range.max(px(1.)));
                                        let new_pct = if track_range > px(0.) {
                                            (track_y / track_range).clamp(0.0, 1.0)
                                        } else {
                                            0.0
                                        };
                                        scroll_list_to_pct(
                                            &list_state,
                                            total_rows,
                                            max_top_rows,
                                            new_pct,
                                        );
                                        this.scrollbar_drag_offset = Some(center_offset);
                                    }
                                    cx.notify();
                                });
                            }
                        });

                        window.on_mouse_event({
                            let entity = entity.clone();
                            move |_: &MouseUpEvent, phase, _, cx| {
                                if phase != DispatchPhase::Bubble {
                                    return;
                                }
                                if entity.read(cx).scrollbar_drag_offset.is_some() {
                                    entity.update(cx, |this, cx| {
                                        this.scrollbar_drag_offset = None;
                                        cx.notify();
                                    });
                                }
                            }
                        });

                        window.on_mouse_event({
                            let entity = entity.clone();
                            let list_state = list_state.clone();
                            move |ev: &MouseMoveEvent, phase, _, cx| {
                                if phase != DispatchPhase::Bubble || !ev.dragging() {
                                    return;
                                }
                                let Some(grab_offset) = entity.read(cx).scrollbar_drag_offset else {
                                    return;
                                };
                                let track_y = (ev.position.y
                                    - track_bounds.origin.y
                                    - px(4.)
                                    - grab_offset)
                                    .clamp(px(0.), track_range.max(px(1.)));
                                let new_pct = if track_range > px(0.) {
                                    (track_y / track_range).clamp(0.0, 1.0)
                                } else {
                                    0.0
                                };
                                scroll_list_to_pct(
                                    &list_state,
                                    total_rows,
                                    max_top_rows,
                                    new_pct,
                                );
                                cx.notify(entity.entity_id());
                            }
                        });
                    },
                )
                .size_full(),
            )
            .into_any_element()
    }

    fn render_visible_row(
        &self,
        tab: &LogTab,
        row_ix: usize,
        row: VisibleRow,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let is_active = row_ix == tab.active_row;
        let search_spec = &tab.filtered.search_spec;

        match row {
            VisibleRow::EntryHeader {
                filtered_pos,
                entry_idx,
            } => {
                let Some(entry) = tab.entries.get(entry_idx) else {
                    return div().h(px(ROW_HEIGHT_PX)).into_any_element();
                };

                if entry.is_raw() {
                    let is_bold = matches!(entry.kind, fluig_log_core::LogEntryKind::Raw { is_bold: true });
                    let bg = if is_active {
                        col_bg_row_active()
                    } else if filtered_pos.is_multiple_of(2) {
                        col_bg_log_area()
                    } else {
                        col_bg_row_alt()
                    };
                    return div()
                        .id(("log-row", row_ix))
                        .relative()
                        .w_full()
                        .min_h(px(ROW_HEIGHT_PX))
                        .py_1()
                        .pl(px(62.))
                        .pr_5()
                        .bg(bg)
                        .border_b_1()
                        .border_color(rgba(0xFFFFFF09))
                        .hover(|s| s.bg(rgba(0xFFFFFF13)))
                        .flex()
                        .items_center()
                        .font_family("Consolas")
                        .text_xs()
                        .when(is_bold, |d| d.font_weight(FontWeight::BOLD))
                        .text_color(rgb(0xCBD2E0))
                        .when(is_active, |el| {
                            el.child(
                                div()
                                    .absolute()
                                    .left_0()
                                    .top_0()
                                    .bottom_0()
                                    .w(px(3.))
                                    .bg(col_info()),
                            )
                        })
                        .on_click(cx.listener(move |this, _ev, _window, cx| {
                            this.active_input = None;
                            this.set_active_row(row_ix, false, cx);
                        }))
                        .child(
                            div()
                                .w_full()
                                .min_w_0()
                                .child(render_highlighted_text(entry.message.clone(), search_spec)),
                        )
                        .into_any_element();
                }

                let sig = get_log_signature(entry);
                let is_pinned = !sig.is_empty() && tab.pinned_signatures.contains(&sig);
                let is_error_row = entry.level.is_some_and(LogLevel::is_error_like);
                let is_warn_row = entry.level == Some(LogLevel::Warn);

                let (bg, hover_bg) = if is_active {
                    (col_bg_row_active(), col_bg_row_active())
                } else if is_error_row {
                    (rgba(0xE06C7521), rgba(0xE06C7538))
                } else if is_warn_row {
                    (rgba(0xE5C07B1C), rgba(0xE5C07B33))
                } else if is_pinned {
                    (col_bg_row_pinned(), rgba(0xF2511B2E))
                } else if filtered_pos.is_multiple_of(2) {
                    (col_bg_log_area(), rgba(0xFFFFFF13))
                } else {
                    (col_bg_row_alt(), rgba(0xFFFFFF13))
                };

                let (lvl_text, lvl_fg, lvl_bg) = level_colors(entry.level);
                let repeat_count = entry.count;

                let date_str = entry.date.clone();
                let delta_badge = format_delta_badge(entry.delta_ms);
                let class_str: String = entry.class_name.to_string();
                let class_click = class_str.clone();
                let thread_str: String = entry.thread.to_string();
                let thread_click = thread_str.clone();
                let file_tag = entry.file_name.as_ref().map(|f| f.to_string());
                let msg = entry.message.clone();

                div()
                    .id(("log-row", row_ix))
                    .relative()
                    .w_full()
                    .min_h(px(ROW_HEIGHT_PX))
                    .py_1()
                    .pl_2()
                    .pr_5()
                    .bg(bg)
                    .border_b_1()
                    .border_color(rgba(0xFFFFFF09))
                    .hover(|s| s.bg(hover_bg))
                    .flex()
                    .items_start()
                    .gap_2()
                    .text_xs()
                    .font_family("Consolas")
                    .when(is_pinned, |el| {
                        el.child(
                            div()
                                .absolute()
                                .left_0()
                                .top_0()
                                .bottom_0()
                                .w(px(4.))
                                .bg(col_accent()),
                        )
                    })
                    .when(is_active, |el| {
                        el.child(
                            div()
                                .absolute()
                                .left_0()
                                .top_0()
                                .bottom_0()
                                .w(px(3.))
                                .bg(col_info()),
                        )
                    })
                    .on_click(cx.listener(move |this, _ev, _window, cx| {
                        this.active_input = None;
                        this.set_active_row(row_ix, false, cx);
                    }))
                    // Ações: Pin & Copy
                    .child(
                        div()
                            .w(px(48.))
                            .flex_none()
                            .flex()
                            .items_center()
                            .gap_1()
                            .child(
                                div()
                                    .id(("pin-btn", row_ix))
                                    .w(px(22.))
                                    .h(px(22.))
                                    .rounded_sm()
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .cursor_pointer()
                                    .opacity(if is_pinned { 1.0 } else { 0.35 })
                                    .hover(|s| s.opacity(1.0).bg(col_bg_panel()))
                                    .on_click(cx.listener(move |this, _ev, _window, cx| {
                                        cx.stop_propagation();
                                        this.active_input = None;
                                        if let Some(tab) = this.active_tab_mut() {
                                            tab.active_row = row_ix;
                                        }
                                        this.toggle_pin_entry(entry_idx, cx);
                                    }))
                                    .child("📌"),
                            )
                            .child(
                                div()
                                    .id(("copy-btn", row_ix))
                                    .w(px(22.))
                                    .h(px(22.))
                                    .rounded_sm()
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .cursor_pointer()
                                    .opacity(0.45)
                                    .hover(|s| s.opacity(1.0).bg(col_bg_panel()))
                                    .on_click(cx.listener(move |this, _ev, _window, cx| {
                                        cx.stop_propagation();
                                        this.active_input = None;
                                        let copied = this.active_tab().and_then(|tab| {
                                            tab.entries
                                                .get(entry_idx)
                                                .map(|e| format_log_entry_as_text(e, true))
                                        });
                                        if let Some(txt) = copied {
                                            cx.write_to_clipboard(ClipboardItem::new_string(txt));
                                            this.show_toast(
                                                "Ocorrência copiada!",
                                                ToastKind::Success,
                                                cx,
                                            );
                                        }
                                    }))
                                    .child("📋"),
                            ),
                    )
                    // Date + delta
                    .child(
                        div()
                            .w(px(206.))
                            .flex_none()
                            .flex()
                            .items_center()
                            .justify_start()
                            .gap_1p5()
                            .truncate()
                            .text_color(col_date())
                            .child(date_str)
                            .when_some(delta_badge, |el, badge| {
                                el.child(
                                    div()
                                        .px_1()
                                        .rounded_sm()
                                        .bg(rgba(0x98C3791A))
                                        .text_color(col_class())
                                        .flex_none()
                                        .child(badge),
                                )
                            }),
                    )
                    // Level + count pill (.log-count)
                    .child(
                        div()
                            .w(px(72.))
                            .flex_none()
                            .flex()
                            .items_center()
                            .gap_1()
                            .child(
                                div()
                                    .px_1p5()
                                    .py_0p5()
                                    .rounded_sm()
                                    .bg(lvl_bg)
                                    .text_color(lvl_fg)
                                    .font_weight(FontWeight::BOLD)
                                    .child(lvl_text),
                            )
                            .when(repeat_count > 1, |el| {
                                el.child(
                                    div()
                                        .px_1p5()
                                        .py_0p5()
                                        .rounded_full()
                                        .bg(rgba(0xFFFFFF24))
                                        .text_color(rgb(0xE6EBF5))
                                        .font_weight(FontWeight::BOLD)
                                        .child(format!("x{repeat_count}")),
                                )
                            }),
                    )
                    // Class (clicável)
                    .child(
                        proportional_col(div().id(("cls-btn", row_ix)), 1.35, 180.0)
                            .text_color(col_class())
                            .cursor_pointer()
                            .hover(|s| s.underline().text_color(col_info()))
                            .on_click(cx.listener(move |this, _ev, _window, cx| {
                                cx.stop_propagation();
                                this.active_input = None;
                                if let Some(tab) = this.active_tab_mut() {
                                    if tab.criteria.search_query == class_click {
                                        tab.criteria.search_query.clear();
                                    } else {
                                        tab.criteria.search_query = class_click.clone();
                                    }
                                    tab.apply_filters();
                                    tab.persist_settings();
                                }
                                cx.notify();
                            }))
                            .child(class_str),
                    )
                    // Thread (clicável)
                    .child(
                        proportional_col(div().id(("thr-btn", row_ix)), 0.45, 105.0)
                            .text_color(col_thread())
                            .cursor_pointer()
                            .hover(|s| s.underline().text_color(col_info()))
                            .on_click(cx.listener(move |this, _ev, _window, cx| {
                                cx.stop_propagation();
                                this.active_input = None;
                                if let Some(tab) = this.active_tab_mut() {
                                    if tab.criteria.search_query == thread_click {
                                        tab.criteria.search_query.clear();
                                    } else {
                                        tab.criteria.search_query = thread_click.clone();
                                    }
                                    tab.apply_filters();
                                    tab.persist_settings();
                                }
                                cx.notify();
                            }))
                            .child(thread_str),
                    )
                    // Message + file badge + highlight
                    .child(
                        proportional_col(div(), 3.2, 280.0)
                            .flex()
                            .items_start()
                            .gap_1p5()
                            .text_color(rgb(0xFFFFFF))
                            .when_some(file_tag, |el, tag| {
                                el.child(
                                    div()
                                        .px_1p5()
                                        .rounded_sm()
                                        .bg(rgba(0x61AFEF26))
                                        .text_color(rgb(0x9BD0FF))
                                        .flex_none()
                                        .child(tag),
                                )
                            })
                            .child(
                                div()
                                    .flex_1()
                                    .min_w_0()
                                    .child(render_highlighted_text(msg, search_spec)),
                            ),
                    )
                    .into_any_element()
            }
            VisibleRow::StackToggle {
                entry_idx,
                line_count,
                is_expanded,
                has_match_inside,
                ..
            } => {
                let arrow = if is_expanded { "▼" } else { "▶" };
                let verb = if is_expanded { "Ocultar" } else { "Mostrar" };
                let custom_label = match &tab.entries.get(entry_idx).map(|e| &e.kind) {
                    Some(fluig_log_core::LogEntryKind::StacktraceOnly { label, .. }) => {
                        label.trim_start_matches("Show ").to_string()
                    }
                    Some(fluig_log_core::LogEntryKind::Log {
                        is_config_mode: true,
                    }) => "Configs".to_string(),
                    _ => "Detalhes".to_string(),
                };

                div()
                    .id(("stack-toggle", row_ix))
                    .relative()
                    .w_full()
                    .h(px(ROW_HEIGHT_PX))
                    .pl(px(58.))
                    .pr_5()
                    .bg(if is_active {
                        col_bg_row_active()
                    } else {
                        col_bg_log_area()
                    })
                    .border_b_1()
                    .border_color(rgba(0xFFFFFF0A))
                    .flex()
                    .items_center()
                    .gap_2()
                    .cursor_pointer()
                    .hover(|s| s.bg(rgba(0xFFFFFF0D)))
                    .when(is_active, |el| {
                        el.child(
                            div()
                                .absolute()
                                .left_0()
                                .top_0()
                                .bottom_0()
                                .w(px(3.))
                                .bg(col_info()),
                        )
                    })
                    .on_click(cx.listener(move |this, _ev, _window, cx| {
                        this.active_input = None;
                        if let Some(tab) = this.active_tab_mut() {
                            tab.active_row = row_ix;
                        }
                        this.toggle_expand_entry(entry_idx, cx);
                    }))
                    .child(
                        div()
                            .text_xs()
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(rgb(0x828DA6))
                            .hover(|s| s.text_color(rgb(0xD7DEED)))
                            .child(format!("{arrow} {verb} {custom_label} ({line_count} linhas)")),
                    )
                    .when(!is_expanded && has_match_inside, |el| {
                        el.child(
                            div()
                                .px_2()
                                .py_0p5()
                                .rounded_full()
                                .bg(rgba(0xF2511B38))
                                .border_1()
                                .border_color(rgba(0xF2511B73))
                                .text_xs()
                                .text_color(rgb(0xFFB196))
                                .child("termo nos detalhes"),
                        )
                    })
                    .into_any_element()
            }
            VisibleRow::StackLine {
                entry_idx,
                line_idx,
                ..
            } => {
                let Some(line_text) = tab
                    .entries
                    .get(entry_idx)
                    .and_then(|e| e.stacktrace.get(line_idx))
                    .cloned()
                else {
                    return div().h(px(ROW_HEIGHT_PX)).into_any_element();
                };
                let is_config_mode = tab
                    .entries
                    .get(entry_idx)
                    .is_some_and(|e| e.is_config_mode());
                let trimmed = line_text.trim_start();
                let is_stack_frame = trimmed.starts_with("at ")
                    || trimmed.starts_with("...")
                    || trimmed.starts_with("Caused by:");
                let bar_color = if !is_config_mode && is_stack_frame {
                    col_error()
                } else {
                    rgb(0x4B5263)
                };

                div()
                    .id(("stack-line", row_ix))
                    .relative()
                    .w_full()
                    .min_h(px(24.))
                    .py_0p5()
                    .pl(px(74.))
                    .pr_5()
                    .bg(if is_active {
                        col_bg_row_active()
                    } else {
                        col_bg_log_area()
                    })
                    .hover(|s| s.bg(rgba(0xFFFFFF0A)))
                    .flex()
                    .items_center()
                    .font_family("Consolas")
                    .text_xs()
                    .text_color(rgb(0xB7C0D2))
                    .child(
                        div()
                            .absolute()
                            .left(px(60.))
                            .top_0()
                            .bottom_0()
                            .w(px(2.))
                            .bg(bar_color),
                    )
                    .when(is_active, |el| {
                        el.child(
                            div()
                                .absolute()
                                .left_0()
                                .top_0()
                                .bottom_0()
                                .w(px(3.))
                                .bg(col_info()),
                        )
                    })
                    .on_click(cx.listener(move |this, _ev, _window, cx| {
                        this.active_input = None;
                        this.set_active_row(row_ix, false, cx);
                    }))
                    .child(
                        div()
                            .w_full()
                            .min_w_0()
                            .child(render_highlighted_text(line_text, search_spec)),
                    )
                    .into_any_element()
            }
        }
    }

    fn render_loading_overlay(&mut self, state: &LoadingState, cx: &mut Context<Self>) -> AnyElement {
        let pct = state.progress_pct.clamp(4, 100);
        let label = state.label.clone();
        let detail = state.detail.clone();

        div()
            .id("loading-overlay")
            .occlude()
            .absolute()
            .inset_0()
            .bg(rgba(0x030510D8))
            .flex()
            .items_center()
            .justify_center()
            .child(
                div()
                    .w(px(460.))
                    .p_6()
                    .rounded_xl()
                    .bg(col_bg_surface())
                    .border_1()
                    .border_color(col_border_strong())
                    .flex()
                    .flex_col()
                    .gap_4()
                    .child(
                        div()
                            .text_base()
                            .font_weight(FontWeight::BOLD)
                            .text_color(col_text())
                            .child(label),
                    )
                    .child(
                        div()
                            .w_full()
                            .h(px(10.))
                            .rounded_full()
                            .bg(col_bg_log_area())
                            .overflow_hidden()
                            .child(
                                div()
                                    .h_full()
                                    .w(relative(pct as f32 / 100.0))
                                    .bg(col_accent()),
                            ),
                    )
                    .child(
                        div()
                            .text_xs()
                            .text_color(col_text_muted())
                            .child(detail),
                    )
                    .child(
                        div().w_full().flex().justify_end().child(
                            div()
                                .id("cancel-load-btn")
                                .px_4()
                                .py_1p5()
                                .rounded_md()
                                .bg(col_error_bg())
                                .border_1()
                                .border_color(rgba(0xF8717160))
                                .text_xs()
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_color(col_error())
                                .cursor_pointer()
                                .on_click(cx.listener(|this, _ev, _window, cx| {
                                    this.cancel_current_load(cx);
                                    this.show_toast("Leitura cancelada.", ToastKind::Info, cx);
                                }))
                                .child("Cancelar"),
                        ),
                    ),
            )
            .into_any_element()
    }

    fn render_export_modal(&mut self, cx: &mut Context<Self>) -> AnyElement {
        let count = self.active_tab().map_or(0, |t| t.filtered.indices.len());
        let count_label = format!("{} registros filtrados", format_pt_br_number(count));

        div()
            .id("export-modal-backdrop")
            .occlude()
            .absolute()
            .inset_0()
            .bg(rgba(0x030510C8))
            .flex()
            .items_center()
            .justify_center()
            .on_click(cx.listener(|this, _ev, _window, cx| {
                this.export_modal_open = false;
                cx.notify();
            }))
            .child(
                div()
                    .id("export-modal-card")
                    .w(px(520.))
                    .p_6()
                    .rounded_xl()
                    .bg(col_bg_surface())
                    .border_1()
                    .border_color(col_border_strong())
                    .flex()
                    .flex_col()
                    .gap_4()
                    .on_click(|_ev, _window, cx| cx.stop_propagation())
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(
                                div()
                                    .text_lg()
                                    .font_weight(FontWeight::BOLD)
                                    .text_color(col_text())
                                    .child("Exportar Logs"),
                            )
                            .child(
                                div()
                                    .id("close-export-modal")
                                    .px_2()
                                    .py_1()
                                    .rounded_md()
                                    .cursor_pointer()
                                    .text_color(col_text_muted())
                                    .hover(|s| s.text_color(col_text()))
                                    .on_click(cx.listener(|this, _ev, _window, cx| {
                                        this.export_modal_open = false;
                                        cx.notify();
                                    }))
                                    .child("✕"),
                            ),
                    )
                    .child(
                        div()
                            .text_xs()
                            .text_color(col_text_muted())
                            .child(format!("Selecione o formato desejado ({count_label}):")),
                    )
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .gap_2()
                            .child(
                                export_option_card(
                                    "exp-txt",
                                    "Texto (.log)",
                                    "Formato original, ideal para editores de texto.",
                                    self.export_format == ExportFormat::Txt,
                                )
                                .on_click(cx.listener(|this, _ev, _window, cx| {
                                    this.export_format = ExportFormat::Txt;
                                    cx.notify();
                                })),
                            )
                            .child(
                                export_option_card(
                                    "exp-csv",
                                    "Planilha (.csv)",
                                    "Formato tabular com BOM UTF-8 (ideal para Excel e Power BI).",
                                    self.export_format == ExportFormat::Csv,
                                )
                                .on_click(cx.listener(|this, _ev, _window, cx| {
                                    this.export_format = ExportFormat::Csv;
                                    cx.notify();
                                })),
                            )
                            .child(
                                export_option_card(
                                    "exp-json",
                                    "Dados (.json)",
                                    "Formato estruturado para ingestão e análise automatizada.",
                                    self.export_format == ExportFormat::Json,
                                )
                                .on_click(cx.listener(|this, _ev, _window, cx| {
                                    this.export_format = ExportFormat::Json;
                                    cx.notify();
                                })),
                            ),
                    )
                    .child(
                        div()
                            .flex()
                            .justify_end()
                            .gap_2()
                            .child(
                                toolbar_btn("cancel-export", "Cancelar", false).on_click(cx.listener(
                                    |this, _ev, _window, cx| {
                                        this.export_modal_open = false;
                                        cx.notify();
                                    },
                                )),
                            )
                            .child(
                                div()
                                    .id("confirm-export")
                                    .px_4()
                                    .py_1p5()
                                    .rounded_md()
                                    .bg(col_accent())
                                    .text_xs()
                                    .font_weight(FontWeight::BOLD)
                                    .text_color(rgb(0xFFFFFF))
                                    .cursor_pointer()
                                    .hover(|s| s.bg(col_accent_hover()))
                                    .on_click(cx.listener(|this, _ev, _window, cx| {
                                        this.execute_export(cx);
                                    }))
                                    .child("Exportar"),
                            ),
                    ),
            )
            .into_any_element()
    }

    fn render_shortcuts_modal(&mut self, cx: &mut Context<Self>) -> AnyElement {
        let nav_items = [
            ("/", "Focar no campo de pesquisa"),
            ("P", "Fixar / desfixar linha ativa"),
            ("I / W / E / D", "Filtros INFO / WARN / ERROR / DEBUG"),
            ("F", "Alternar filtro de Fixados"),
            ("↑ / ↓", "Navegar linhas (Shift pula 10)"),
            ("PgUp / PgDn / ← / →", "Pular 40 linhas"),
            ("Home / End", "Ir para início / fim da lista"),
            ("Enter", "Expandir / recolher detalhes"),
        ];
        let action_items = [
            ("Shift + Enter", "Expandir / recolher todos"),
            ("Ctrl + Tab / PgDn", "Próxima aba"),
            ("Ctrl + Shift + Tab / PgUp", "Aba anterior"),
            ("Ctrl + W", "Fechar aba ativa"),
            ("Ctrl + O", "Abrir arquivos em nova aba"),
            ("Ctrl + V", "Colar log em nova aba"),
            ("Ctrl + C", "Copiar ocorrência ativa"),
            ("Esc", "Fechar modal / aba ativa"),
        ];

        let render_col = |section_title: &'static str, list: [(&'static str, &'static str); 8]| {
            div()
                .flex_1()
                .min_w_0()
                .flex()
                .flex_col()
                .gap_1p5()
                .child(
                    div()
                        .pb_1()
                        .text_xs()
                        .font_weight(FontWeight::BOLD)
                        .text_color(col_text_muted())
                        .child(section_title),
                )
                .children(list.into_iter().map(|(k, desc)| {
                    div()
                        .px_2p5()
                        .py_1p5()
                        .rounded_md()
                        .bg(col_bg_log_area())
                        .border_1()
                        .border_color(col_border())
                        .flex()
                        .items_center()
                        .justify_between()
                        .gap_2()
                        .child(
                            div()
                                .flex_none()
                                .px_1p5()
                                .py_0p5()
                                .rounded_sm()
                                .bg(col_bg_panel())
                                .border_1()
                                .border_color(col_border())
                                .font_family("Consolas")
                                .text_xs()
                                .text_color(col_accent())
                                .child(k),
                        )
                        .child(
                            div()
                                .min_w_0()
                                .truncate()
                                .text_xs()
                                .text_color(col_text())
                                .child(desc),
                        )
                }))
        };

        div()
            .id("shortcuts-modal-backdrop")
            .occlude()
            .absolute()
            .inset_0()
            .bg(rgba(0x030510C8))
            .flex()
            .items_center()
            .justify_center()
            .p_4()
            .on_click(cx.listener(|this, _ev, _window, cx| {
                this.shortcuts_modal_open = false;
                cx.notify();
            }))
            .child(
                div()
                    .id("shortcuts-modal-card")
                    .w(px(760.))
                    .max_w_full()
                    .p_5()
                    .rounded_xl()
                    .bg(col_bg_surface())
                    .border_1()
                    .border_color(col_border_strong())
                    .flex()
                    .flex_col()
                    .gap_3()
                    .on_click(|_ev, _window, cx| cx.stop_propagation())
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(
                                div()
                                    .text_lg()
                                    .font_weight(FontWeight::BOLD)
                                    .text_color(col_text())
                                    .child("Atalhos de Teclado"),
                            )
                            .child(
                                div()
                                    .id("close-shortcuts")
                                    .px_2()
                                    .py_1()
                                    .rounded_md()
                                    .cursor_pointer()
                                    .text_color(col_text_muted())
                                    .hover(|s| s.text_color(col_text()))
                                    .on_click(cx.listener(|this, _ev, _window, cx| {
                                        this.shortcuts_modal_open = false;
                                        cx.notify();
                                    }))
                                    .child("✕"),
                            ),
                    )
                    .child(
                        div()
                            .w_full()
                            .flex()
                            .gap_3()
                            .child(render_col("Navegação e Filtros", nav_items))
                            .child(render_col("Abas e Ações", action_items)),
                    )
                    .child(
                        div()
                            .pt_1()
                            .text_xs()
                            .text_color(col_text_muted())
                            .text_center()
                            .child("Criado por Rafael Reis • Edição Desktop (Rust + GPUI)"),
                    ),
            )
            .into_any_element()
    }

    fn render_toast(&self, toast: &ToastState) -> AnyElement {
        let (bg, border, fg) = match toast.kind {
            ToastKind::Info => (col_bg_panel(), col_accent(), col_text()),
            ToastKind::Success => (rgb(0x064E3B), col_success(), rgb(0xECFDF5)),
            ToastKind::Error => (rgb(0x450A0A), col_error(), rgb(0xFEF2F2)),
        };

        div()
            .absolute()
            .bottom_5()
            .right_5()
            .px_4()
            .py_2()
            .rounded_lg()
            .bg(bg)
            .border_1()
            .border_color(border)
            .text_xs()
            .font_weight(FontWeight::SEMIBOLD)
            .text_color(fg)
            .shadow_md()
            .child(toast.message.clone())
            .into_any_element()
    }
    fn render_client_titlebar(&self, window: &Window, cx: &mut Context<Self>) -> AnyElement {
        let title = if self.view_mode == ViewMode::Viewer {
            if let Some(tab) = self.active_tab() {
                format!("Leitor de Logs TOTVS/Fluig — {}", tab.short_title)
            } else {
                "Leitor de Logs TOTVS/Fluig".to_string()
            }
        } else {
            "Leitor de Logs TOTVS/Fluig".to_string()
        };
        let max_icon = if window.is_maximized() { "❐" } else { "▢" };

        let ctrl_btn = |id: &'static str, label: &'static str, is_close: bool| {
            div()
                .id(id)
                .w(px(28.))
                .h(px(22.))
                .rounded_sm()
                .flex()
                .items_center()
                .justify_center()
                .text_xs()
                .font_weight(FontWeight::BOLD)
                .text_color(col_text_muted())
                .cursor_pointer()
                .hover(move |s| {
                    if is_close {
                        s.bg(col_error()).text_color(rgb(0xFFFFFF))
                    } else {
                        s.bg(col_bg_panel()).text_color(rgb(0xFFFFFF))
                    }
                })
                .child(label)
        };

        div()
            .id("client-titlebar")
            .w_full()
            .h(px(34.))
            .flex_none()
            .px_3()
            .bg(col_bg_surface())
            .border_b_1()
            .border_color(col_border())
            .flex()
            .items_center()
            .justify_between()
            .gap_2()
            .on_mouse_down(MouseButton::Left, |ev, window, _cx| {
                if ev.click_count >= 2 {
                    window.zoom_window();
                } else {
                    window.start_window_move();
                }
            })
            .on_mouse_down(MouseButton::Right, |ev, window, _cx| {
                window.show_window_menu(ev.position);
            })
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .items_center()
                    .gap_2()
                    .child(div().w(px(10.)).h(px(10.)).rounded_full().bg(col_accent()))
                    .child(
                        div()
                            .min_w_0()
                            .truncate()
                            .text_xs()
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(col_text())
                            .child(title),
                    ),
            )
            .child(
                div()
                    .flex_none()
                    .flex()
                    .items_center()
                    .gap_1()
                    .child(
                        ctrl_btn("titlebar-min-btn", "—", false).on_mouse_down(
                            MouseButton::Left,
                            |_ev, window, cx| {
                                cx.stop_propagation();
                                window.minimize_window();
                            },
                        ),
                    )
                    .child(
                        ctrl_btn("titlebar-max-btn", max_icon, false).on_mouse_down(
                            MouseButton::Left,
                            |_ev, window, cx| {
                                cx.stop_propagation();
                                window.zoom_window();
                            },
                        ),
                    )
                    .child(
                        ctrl_btn("titlebar-close-btn", "✕", true).on_mouse_down(
                            MouseButton::Left,
                            cx.listener(|this, _ev, window, cx| {
                                cx.stop_propagation();
                                this.persist_settings();
                                window.remove_window();
                                cx.quit();
                            }),
                        ),
                    ),
            )
            .into_any_element()
    }
}

impl Render for LogViewerApp {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let client_decorations =
            cfg!(target_os = "linux") || matches!(window.window_decorations(), Decorations::Client { .. });
        let main_content = match self.view_mode {
            ViewMode::Home => self.render_home(cx),
            ViewMode::Viewer => self.render_viewer(cx),
        };

        let mut root = div()
            .id("app-root")
            .relative()
            .size_full()
            .flex()
            .flex_col()
            .bg(col_bg_deep())
            .text_color(col_text())
            .track_focus(&self.focus_handle)
            .on_key_down(cx.listener(Self::handle_key_down));

        if client_decorations {
            root = root.child(self.render_client_titlebar(window, cx));
        }

        root = root.child(
            div()
                .flex_1()
                .min_h_0()
                .w_full()
                .child(main_content),
        );

        if let Some(loading) = self.loading_state.clone() {
            root = root.child(self.render_loading_overlay(&loading, cx));
        }

        if self.export_modal_open {
            root = root.child(self.render_export_modal(cx));
        }

        if self.shortcuts_modal_open {
            root = root.child(self.render_shortcuts_modal(cx));
        }

        if let Some(toast) = self.toast.as_ref() {
            root = root.child(self.render_toast(toast));
        }

        root
    }
}

fn row_entry_idx(row: VisibleRow) -> usize {
    match row {
        VisibleRow::EntryHeader { entry_idx, .. }
        | VisibleRow::StackToggle { entry_idx, .. }
        | VisibleRow::StackLine { entry_idx, .. } => entry_idx,
    }
}

fn level_colors(level: Option<LogLevel>) -> (&'static str, Rgba, Rgba) {
    match level {
        Some(LogLevel::Error) => ("ERROR", col_error(), col_error_bg()),
        Some(LogLevel::Fatal) => ("FATAL", col_error(), col_error_bg()),
        Some(LogLevel::Warn) => ("WARN", col_warn(), col_warn_bg()),
        Some(LogLevel::Info) => ("INFO", col_info(), col_info_bg()),
        Some(LogLevel::Debug) => ("DEBUG", col_debug(), col_debug_bg()),
        Some(LogLevel::Trace) => ("TRACE", col_text_muted(), rgba(0x94A3B820)),
        None => ("RAW", col_text_muted(), rgba(0x94A3B820)),
    }
}

fn render_highlighted_text(text: String, spec: &SearchSpec) -> AnyElement {
    let ranges = find_highlight_ranges(&text, spec);
    if ranges.is_empty() {
        return SharedString::from(text).into_any_element();
    }
    let style = HighlightStyle {
        background_color: Some(Hsla::from(col_accent())),
        color: Some(Hsla::from(rgb(0xFFFFFF))),
        font_weight: Some(FontWeight::BOLD),
        ..Default::default()
    };
    StyledText::new(text)
        .with_highlights(ranges.into_iter().map(|r| (r, style)))
        .into_any_element()
}

fn proportional_col<E: Styled>(el: E, weight: f32, min_width: f32) -> E {
    let mut el = el.min_w(px(min_width));
    let style = el.style();
    style.flex_grow = Some(weight);
    style.flex_shrink = Some(1.);
    style.flex_basis = Some(relative(0.).into());
    el
}

fn toolbar_btn(id: &'static str, label: impl Into<SharedString>, active: bool) -> gpui::Stateful<gpui::Div> {
    toolbar_btn_stateful(id, label, active, true)
}

fn toolbar_btn_stateful(
    id: &'static str,
    label: impl Into<SharedString>,
    active: bool,
    enabled: bool,
) -> gpui::Stateful<gpui::Div> {
    div()
        .id(id)
        .px_3()
        .py_1()
        .rounded_md()
        .bg(if active {
            rgba(0xF2511B29)
        } else {
            col_bg_surface()
        })
        .border_1()
        .border_color(if active { col_accent() } else { col_border() })
        .text_xs()
        .font_weight(FontWeight::MEDIUM)
        .text_color(if active {
            rgb(0xFFFFFF)
        } else if enabled {
            col_text()
        } else {
            col_text_muted()
        })
        .when(!enabled, |d| d.opacity(0.38))
        .when(enabled, |d| {
            d.cursor_pointer()
                .hover(|s| s.bg(col_bg_panel()).border_color(col_accent()))
        })
        .child(label.into())
}

fn stat_card(
    id: &'static str,
    label: &'static str,
    value: String,
    value_color: Rgba,
    clickable: bool,
    active: bool,
) -> gpui::Stateful<gpui::Div> {
    let base = div()
        .id(id)
        .flex_1()
        .px_3()
        .py_1p5()
        .rounded_lg()
        .bg(if active {
            rgba(0xF2511B1C)
        } else {
            col_bg_surface()
        })
        .border_1()
        .border_color(if active { col_accent() } else { col_border() })
        .flex()
        .items_center()
        .justify_between()
        .child(div().text_xs().text_color(col_text_muted()).child(label))
        .child(
            div()
                .text_sm()
                .font_weight(FontWeight::BOLD)
                .text_color(value_color)
                .child(value),
        );

    if clickable {
        base.cursor_pointer()
            .hover(|s| s.bg(col_bg_panel()).border_color(col_accent()))
    } else {
        base
    }
}

fn time_input_box(
    id: &'static str,
    value: &str,
    placeholder: &'static str,
    focused: bool,
) -> gpui::Stateful<gpui::Div> {
    let display = if value.is_empty() {
        if focused {
            format!("| {placeholder}")
        } else {
            placeholder.to_string()
        }
    } else if focused {
        format!("{value}|")
    } else {
        value.to_string()
    };

    div()
        .id(id)
        .w(px(100.))
        .h(px(32.))
        .px_2()
        .rounded_md()
        .bg(col_bg_log_area())
        .border_1()
        .border_color(if focused { col_accent() } else { col_border() })
        .flex()
        .items_center()
        .cursor_text()
        .text_xs()
        .text_color(if value.is_empty() {
            col_text_muted()
        } else {
            col_text()
        })
        .truncate()
        .child(display)
}

fn filter_chip(
    id: &'static str,
    label: &'static str,
    checked: bool,
    fg: Rgba,
    _bg: Rgba,
) -> gpui::Stateful<gpui::Div> {
    div()
        .id(id)
        .h(px(32.))
        .px_2p5()
        .rounded_md()
        .bg(if checked {
            col_accent()
        } else {
            col_bg_surface()
        })
        .border_1()
        .border_color(if checked { col_accent() } else { col_border() })
        .flex()
        .items_center()
        .cursor_pointer()
        .text_xs()
        .font_weight(FontWeight::SEMIBOLD)
        .text_color(if checked { rgb(0xFFFFFF) } else { col_text() })
        .hover(|s| {
            if checked {
                s.bg(col_accent_hover())
            } else {
                s.bg(col_bg_panel()).border_color(fg)
            }
        })
        .child(label)
}

fn export_option_card(
    id: &'static str,
    title: &'static str,
    desc: &'static str,
    selected: bool,
) -> gpui::Stateful<gpui::Div> {
    div()
        .id(id)
        .p_3()
        .rounded_lg()
        .bg(if selected {
            rgba(0xF2511B1C)
        } else {
            col_bg_log_area()
        })
        .border_1()
        .border_color(if selected { col_accent() } else { col_border() })
        .flex()
        .items_center()
        .gap_3()
        .cursor_pointer()
        .hover(|s| s.border_color(col_accent()))
        .child(
            div()
                .w(px(14.))
                .h(px(14.))
                .rounded_full()
                .border_2()
                .border_color(if selected { col_accent() } else { col_text_muted() })
                .bg(if selected { col_accent() } else { rgba(0x00000000) }),
        )
        .child(
            div()
                .flex()
                .flex_col()
                .gap_0p5()
                .child(
                    div()
                        .text_xs()
                        .font_weight(FontWeight::BOLD)
                        .text_color(col_text())
                        .child(title),
                )
                .child(div().text_xs().text_color(col_text_muted()).child(desc)),
        )
}

fn unix_timestamp_label() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
