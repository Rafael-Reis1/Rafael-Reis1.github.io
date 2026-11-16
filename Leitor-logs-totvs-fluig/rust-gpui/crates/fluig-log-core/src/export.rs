use crate::filter::SortOrder;
use crate::model::{LogEntry, LogEntryKind, LogLevel, format_log_entry_as_text};
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExportFormat {
    Txt,
    Csv,
    Json,
}

impl ExportFormat {
    pub fn extension(self) -> &'static str {
        match self {
            Self::Txt => "log",
            Self::Csv => "csv",
            Self::Json => "json",
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportJsonEntry<'a> {
    #[serde(rename = "type")]
    entry_type: &'a str,
    #[serde(skip_serializing_if = "str::is_empty")]
    date: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    timestamp: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    delta_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    level: Option<&'a str>,
    #[serde(skip_serializing_if = "str::is_empty")]
    class_name: &'a str,
    #[serde(skip_serializing_if = "str::is_empty")]
    thread: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    count: Option<usize>,
    stacktrace: Option<&'a [String]>,
    is_config_mode: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    file_name: Option<&'a str>,
}

pub fn build_export_bytes(
    entries: &[LogEntry],
    filtered_indices: &[usize],
    sort_order: SortOrder,
    format: ExportFormat,
) -> Vec<u8> {
    let chronological_indices: Box<dyn Iterator<Item = usize> + '_> = match sort_order {
        SortOrder::Desc => Box::new(filtered_indices.iter().copied().rev()),
        SortOrder::Asc => Box::new(filtered_indices.iter().copied()),
    };

    match format {
        ExportFormat::Csv => {
            let mut out = String::new();
            out.push('\u{FEFF}');
            out.push_str("Data;Hora;Level;Classe;Thread;Mensagem\n");

            for idx in chronological_indices {
                let Some(entry) = entries.get(idx) else {
                    continue;
                };
                if !entry.is_structured_log() {
                    continue;
                }
                let mut parts = entry.date.splitn(2, ' ');
                let date = parts.next().unwrap_or("");
                let time = parts.next().unwrap_or("");
                let level = entry.level.map(LogLevel::as_str).unwrap_or("");
                let class_name = entry.class_name.replace('"', "\"\"");
                let thread = entry.thread.replace('"', "\"\"");
                let message = entry
                    .message
                    .replace("\r\n", " ")
                    .replace(['\n', '\r'], " ")
                    .replace('"', "\"\"");

                out.push_str(&format!(
                    "\"{date}\";\"{time}\";\"{level}\";\"{class_name}\";\"{thread}\";\"{message}\"\n"
                ));
            }
            out.into_bytes()
        }
        ExportFormat::Json => {
            let mut list: Vec<ExportJsonEntry<'_>> = Vec::new();
            for idx in chronological_indices {
                let Some(entry) = entries.get(idx) else {
                    continue;
                };
                let (entry_type, is_config_mode, message, content) = match &entry.kind {
                    LogEntryKind::Log { is_config_mode } => (
                        if *is_config_mode { "config" } else { "log" },
                        *is_config_mode,
                        Some(entry.message.as_str()),
                        None,
                    ),
                    LogEntryKind::Raw { .. } => {
                        ("raw", false, None, Some(entry.message.as_str()))
                    }
                    LogEntryKind::StacktraceOnly { is_config_mode, .. } => {
                        ("stacktrace_only", *is_config_mode, None, None)
                    }
                };

                list.push(ExportJsonEntry {
                    entry_type,
                    date: &entry.date,
                    timestamp: entry.is_structured_log().then_some(entry.timestamp_ms),
                    delta_ms: entry.is_structured_log().then_some(entry.delta_ms),
                    level: entry.level.map(LogLevel::as_str),
                    class_name: &entry.class_name,
                    thread: &entry.thread,
                    message,
                    content,
                    count: entry.is_structured_log().then_some(entry.count),
                    stacktrace: if entry.stacktrace.is_empty() {
                        None
                    } else {
                        Some(entry.stacktrace.as_slice())
                    },
                    is_config_mode,
                    file_name: entry.file_name.as_deref(),
                });
            }
            serde_json::to_vec_pretty(&list).unwrap_or_else(|_| b"[]".to_vec())
        }
        ExportFormat::Txt => {
            let mut out = String::new();
            for idx in chronological_indices {
                let Some(entry) = entries.get(idx) else {
                    continue;
                };
                out.push_str(&format_log_entry_as_text(entry, true));
                out.push('\n');
            }
            out.into_bytes()
        }
    }
}
