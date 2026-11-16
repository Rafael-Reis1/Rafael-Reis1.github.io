use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum LogLevel {
    Info,
    Warn,
    Error,
    Debug,
    Fatal,
    Trace,
}

impl LogLevel {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Info => "INFO",
            Self::Warn => "WARN",
            Self::Error => "ERROR",
            Self::Debug => "DEBUG",
            Self::Fatal => "FATAL",
            Self::Trace => "TRACE",
        }
    }

    pub fn from_raw(raw: &str) -> Option<(Self, usize)> {
        let trimmed = raw.trim();
        let (base_part, repeat_count) = split_multiplier(trimmed);
        let level = match base_part.to_ascii_uppercase().as_str() {
            "INFO" => Self::Info,
            "WARN" | "WARNING" => Self::Warn,
            "ERROR" | "SEVERE" => Self::Error,
            "DEBUG" => Self::Debug,
            "FATAL" => Self::Fatal,
            "TRACE" => Self::Trace,
            _ => return None,
        };
        Some((level, repeat_count))
    }

    pub fn is_error_like(self) -> bool {
        matches!(self, Self::Error | Self::Fatal)
    }
}

fn split_multiplier(raw: &str) -> (&str, usize) {
    if let Some(pos) = raw.rfind(['x', 'X']) {
        let digits = &raw[pos + 1..];
        if !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit()) {
            let parsed = digits.parse::<usize>().unwrap_or(1).max(1);
            return (raw[..pos].trim(), parsed);
        }
    }
    (raw, 1)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum LogEntryKind {
    Log { is_config_mode: bool },
    Raw { is_bold: bool },
    StacktraceOnly { label: String, is_config_mode: bool },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LogEntry {
    pub kind: LogEntryKind,
    pub date: String,
    pub timestamp_ms: i64,
    pub time_secs: i32,
    pub delta_ms: u64,
    pub level: Option<LogLevel>,
    pub class_name: Arc<str>,
    pub thread: Arc<str>,
    pub message: String,
    pub count: usize,
    pub stacktrace: Vec<String>,
    pub file_name: Option<Arc<str>>,
}

impl LogEntry {
    pub fn is_config_mode(&self) -> bool {
        match &self.kind {
            LogEntryKind::Log { is_config_mode } => *is_config_mode,
            LogEntryKind::StacktraceOnly { is_config_mode, .. } => *is_config_mode,
            LogEntryKind::Raw { .. } => false,
        }
    }

    pub fn is_structured_log(&self) -> bool {
        matches!(self.kind, LogEntryKind::Log { .. })
    }

    pub fn is_raw(&self) -> bool {
        matches!(self.kind, LogEntryKind::Raw { .. })
    }

    pub fn is_stacktrace_only(&self) -> bool {
        matches!(self.kind, LogEntryKind::StacktraceOnly { .. })
    }

    pub fn has_stacktrace(&self) -> bool {
        !self.stacktrace.is_empty()
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct LogStats {
    pub total: usize,
    pub errors: usize,
    pub warnings: usize,
    pub infos: usize,
    pub debugs: usize,
    pub traces: usize,
    pub processed_lines: usize,
    pub unique_entries: usize,
    pub oldest_date: i64,
    pub newest_date: i64,
    pub duration_ms: i64,
}

#[derive(Debug, Clone, Default)]
pub struct ParsedLogData {
    pub entries: Vec<LogEntry>,
    pub stats: LogStats,
}

#[derive(Debug, Clone)]
pub struct ParseProgress {
    pub progress_pct: u8,
    pub processed_bytes: u64,
    pub total_bytes: u64,
    pub processed_lines: usize,
    pub unique_entries: usize,
    pub file_name: String,
    pub file_index: usize,
    pub file_count: usize,
}

pub fn format_bytes(bytes: u64) -> String {
    if bytes == 0 {
        return "0 B".to_string();
    }
    const UNITS: [&str; 4] = ["B", "KB", "MB", "GB"];
    let mut exp = 0usize;
    let mut val = bytes as f64;
    while val >= 1024.0 && exp < UNITS.len() - 1 {
        val /= 1024.0;
        exp += 1;
    }
    if exp == 0 {
        format!("{bytes} B")
    } else {
        format!("{val:.1} {}", UNITS[exp])
    }
}

pub fn format_pt_br_number(value: usize) -> String {
    let digits = value.to_string();
    let len = digits.len();
    if len <= 3 {
        return digits;
    }
    let mut out = String::with_capacity(len + len / 3);
    for (idx, ch) in digits.chars().enumerate() {
        if idx > 0 && (len - idx).is_multiple_of(3) {
            out.push('.');
        }
        out.push(ch);
    }
    out
}

pub fn format_duration_ms(diff_ms: i64) -> String {
    if diff_ms <= 0 {
        return "--".to_string();
    }
    let diff_sec = diff_ms / 1000;
    let hours = diff_sec / 3600;
    let mins = (diff_sec % 3600) / 60;
    let secs = diff_sec % 60;
    format!("{hours:02}:{mins:02}:{secs:02}")
}

pub fn format_delta_badge(delta_ms: u64) -> Option<String> {
    if delta_ms == 0 {
        return None;
    }
    if delta_ms < 1000 {
        Some(format!("+{delta_ms}ms"))
    } else if delta_ms < 60_000 {
        Some(format!("+{:.2}s", delta_ms as f64 / 1000.0))
    } else {
        Some(format!("+{:.1}m", delta_ms as f64 / 60_000.0))
    }
}

pub fn get_log_signature(entry: &LogEntry) -> String {
    if entry.date.is_empty() {
        return String::new();
    }
    let level = entry.level.map(LogLevel::as_str).unwrap_or("");
    let trace = if entry.stacktrace.is_empty() {
        String::new()
    } else {
        entry.stacktrace.join("\n")
    };
    format!(
        "{}|{}|{}|{}|{}|{}",
        entry.date, level, entry.class_name, entry.thread, entry.message, trace
    )
}

pub fn format_log_entry_as_text(entry: &LogEntry, include_stacktrace: bool) -> String {
    match &entry.kind {
        LogEntryKind::Raw { .. } => entry.message.clone(),
        LogEntryKind::StacktraceOnly { .. } => entry.stacktrace.join("\n"),
        LogEntryKind::Log { .. } => {
            let level = entry.level.map(LogLevel::as_str).unwrap_or("");
            let header = format!(
                "{} {} [{}] ({}) - {}",
                entry.date, level, entry.class_name, entry.thread, entry.message
            );
            if !include_stacktrace || entry.stacktrace.is_empty() {
                header
            } else {
                format!("{header}\n{}", entry.stacktrace.join("\n"))
            }
        }
    }
}

pub fn get_files_storage_key(paths: &[std::path::PathBuf]) -> String {
    let parts: Vec<String> = paths
        .iter()
        .map(|path| {
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| path.to_string_lossy().into_owned());
            let meta = std::fs::metadata(path).ok();
            let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let modified = meta
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis())
                .unwrap_or(0);
            format!("{name}_{size}_{modified}")
        })
        .collect();
    format!("log_settings_{}", parts.join("|"))
}

pub fn is_supported_log_path(path: &Path) -> bool {
    let Some(file_name) = path.file_name().and_then(|n| n.to_str()) else {
        return false;
    };
    let trimmed = file_name.trim();
    if trimmed.is_empty() {
        return false;
    }

    let lower = trimmed.to_ascii_lowercase();
    let effective = lower.strip_suffix(".gz").unwrap_or(&lower);

    const BLOCKED_EXTENSIONS: [&str; 22] = [
        ".zip", ".rar", ".7z", ".tar", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico",
        ".pdf", ".exe", ".dll", ".jar", ".war", ".ear", ".class", ".mp3", ".mp4", ".avi", ".mov",
    ];
    if BLOCKED_EXTENSIONS.iter().any(|ext| effective.ends_with(ext)) {
        return false;
    }

    if lower.ends_with(".gz") {
        // Aceita .log.gz, .log.1.gz, .txt.gz, .out.gz, etc. (desde que não seja .tar.gz / binário)
        return true;
    }

    if effective.contains(".log.") || effective.ends_with(".log") {
        return true;
    }

    const ALLOWED_PREFIX_EXTS: [&str; 5] = [".log", ".txt", ".out", ".err", ".trace"];
    for ext in ALLOWED_PREFIX_EXTS {
        if effective.ends_with(ext) {
            return true;
        }
        if let Some(pos) = effective.rfind(ext) {
            let after = &effective[pos + ext.len()..];
            if after.starts_with('.') && after.len() > 1 && !after[1..].contains('.') {
                return true;
            }
        }
    }

    false
}
