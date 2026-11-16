use crate::model::{LogEntry, LogEntryKind, LogLevel, LogStats, ParseProgress, ParsedLogData};
use anyhow::{Context, Result, anyhow};
use flate2::read::MultiGzDecoder;
use regex::Regex;
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::Instant;

pub const CHUNK_SIZE: usize = 4 * 1024 * 1024;
pub const CONFIG_START_MARKER: &str = "=============LOG CONFIGS=========";

static LOG_LINE_REGEX: OnceLock<Regex> = OnceLock::new();
static CONFIG_END_REGEX: OnceLock<Regex> = OnceLock::new();

fn log_line_regex() -> &'static Regex {
    LOG_LINE_REGEX.get_or_init(|| {
        Regex::new(
            r"(?i)^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}[.,]\d{3})\s+((?:INFO|WARN|ERROR|DEBUG|FATAL|TRACE|SEVERE|WARNING)(?:x\d+)?)\s+(\[.*?\])\s+(\(.*?\))\s+(.*)$",
        )
        .expect("LOG_LINE_REGEX must compile")
    })
}

fn config_end_regex() -> &'static Regex {
    CONFIG_END_REGEX
        .get_or_init(|| Regex::new(r"^={10,}$").expect("CONFIG_END_REGEX must compile"))
}

struct StringInterner {
    map: HashMap<String, Arc<str>>,
}

impl StringInterner {
    fn new() -> Self {
        Self {
            map: HashMap::new(),
        }
    }

    fn intern(&mut self, value: &str) -> Arc<str> {
        if let Some(existing) = self.map.get(value) {
            return Arc::clone(existing);
        }
        let arc: Arc<str> = Arc::from(value);
        self.map.insert(value.to_string(), Arc::clone(&arc));
        arc
    }
}

struct PendingHeader {
    date: String,
    level: LogLevel,
    repeat_count: usize,
    class_name: String,
    thread: String,
    message: String,
    file_name: Option<Arc<str>>,
}

pub struct LogParser {
    multi_file_mode: bool,
    all_logs: Vec<LogEntry>,
    class_pool: StringInterner,
    thread_pool: StringInterner,
    pending_header: Option<PendingHeader>,
    pending_buffer: Vec<String>,
    config_buffer: Vec<String>,
    in_config_block: bool,
    current_file_name: Option<Arc<str>>,
    last_log_eligible_for_merge: bool,
    count_total: usize,
    count_error: usize,
    count_warn: usize,
    count_info: usize,
    count_debug: usize,
    count_trace: usize,
    processed_lines: usize,
    oldest_date: Option<i64>,
    newest_date: Option<i64>,
    previous_unique_log_date: Option<i64>,
}

impl LogParser {
    pub fn new(multi_file_mode: bool) -> Self {
        Self {
            multi_file_mode,
            all_logs: Vec::new(),
            class_pool: StringInterner::new(),
            thread_pool: StringInterner::new(),
            pending_header: None,
            pending_buffer: Vec::new(),
            config_buffer: Vec::new(),
            in_config_block: false,
            current_file_name: None,
            last_log_eligible_for_merge: false,
            count_total: 0,
            count_error: 0,
            count_warn: 0,
            count_info: 0,
            count_debug: 0,
            count_trace: 0,
            processed_lines: 0,
            oldest_date: None,
            newest_date: None,
            previous_unique_log_date: None,
        }
    }

    pub fn processed_lines(&self) -> usize {
        self.processed_lines
    }

    pub fn unique_count(&self) -> usize {
        self.all_logs.len()
    }

    pub fn set_active_file(&mut self, file_name: &str) {
        if self.in_config_block {
            self.flush_config_block();
            self.in_config_block = false;
        }
        self.process_pending_log();
        self.last_log_eligible_for_merge = false;
        self.current_file_name = if file_name.is_empty() {
            None
        } else {
            Some(Arc::from(file_name))
        };
    }

    pub fn process_line(&mut self, raw_line: &str) {
        self.processed_lines += 1;
        let mut line = raw_line.strip_suffix('\r').unwrap_or(raw_line);
        if let Some(stripped) = line.strip_prefix('\u{FEFF}') {
            line = stripped;
        }

        if let Some(parsed) = parse_structured_header(line) {
            if parsed.message.contains(CONFIG_START_MARKER) {
                if self.in_config_block {
                    self.flush_config_block();
                }
                self.in_config_block = true;
                self.process_pending_log();
                self.pending_header = Some(PendingHeader {
                    date: parsed.date.to_string(),
                    level: parsed.level,
                    repeat_count: parsed.repeat_count,
                    class_name: parsed.class_name.to_string(),
                    thread: parsed.thread.to_string(),
                    message: parsed.message.to_string(),
                    file_name: self.current_file_name.clone(),
                });
                self.pending_buffer.clear();
                self.process_pending_log();
                return;
            }

            if self.in_config_block && config_end_regex().is_match(parsed.message) {
                self.config_buffer.push(line.to_string());
                self.flush_config_block();
                self.in_config_block = false;
                return;
            }

            if self.in_config_block {
                self.config_buffer.push(line.to_string());
            } else {
                self.process_pending_log();
                self.pending_header = Some(PendingHeader {
                    date: parsed.date.to_string(),
                    level: parsed.level,
                    repeat_count: parsed.repeat_count,
                    class_name: parsed.class_name.to_string(),
                    thread: parsed.thread.to_string(),
                    message: parsed.message.to_string(),
                    file_name: self.current_file_name.clone(),
                });
                self.pending_buffer.clear();
            }
            return;
        }

        if line.contains(CONFIG_START_MARKER) {
            if self.in_config_block {
                self.flush_config_block();
            }
            self.in_config_block = true;
            self.all_logs.push(LogEntry {
                kind: LogEntryKind::Raw { is_bold: true },
                date: String::new(),
                timestamp_ms: 0,
                time_secs: -1,
                delta_ms: 0,
                level: None,
                class_name: Arc::from(""),
                thread: Arc::from(""),
                message: line.to_string(),
                count: 1,
                stacktrace: Vec::new(),
                file_name: if self.multi_file_mode {
                    self.current_file_name.clone()
                } else {
                    None
                },
            });
            self.last_log_eligible_for_merge = false;
            return;
        }

        let trimmed = line.trim();
        if self.in_config_block && config_end_regex().is_match(trimmed) {
            self.config_buffer.push(line.to_string());
            self.flush_config_block();
            self.in_config_block = false;
            return;
        }

        if self.in_config_block {
            self.config_buffer.push(line.to_string());
        } else if self.pending_header.is_some() {
            if !trimmed.is_empty() {
                self.pending_buffer.push(line.to_string());
            }
        } else if !trimmed.is_empty() {
            self.all_logs.push(LogEntry {
                kind: LogEntryKind::Raw { is_bold: false },
                date: String::new(),
                timestamp_ms: 0,
                time_secs: -1,
                delta_ms: 0,
                level: None,
                class_name: Arc::from(""),
                thread: Arc::from(""),
                message: line.to_string(),
                count: 1,
                stacktrace: Vec::new(),
                file_name: if self.multi_file_mode {
                    self.current_file_name.clone()
                } else {
                    None
                },
            });
            self.last_log_eligible_for_merge = false;
        }
    }

    fn flush_config_block(&mut self) {
        if self.config_buffer.is_empty() {
            return;
        }
        let stacktrace = std::mem::take(&mut self.config_buffer);
        self.all_logs.push(LogEntry {
            kind: LogEntryKind::StacktraceOnly {
                label: "Show Configs".to_string(),
                is_config_mode: true,
            },
            date: String::new(),
            timestamp_ms: 0,
            time_secs: -1,
            delta_ms: 0,
            level: None,
            class_name: Arc::from(""),
            thread: Arc::from(""),
            message: String::new(),
            count: 1,
            stacktrace,
            file_name: if self.multi_file_mode {
                self.current_file_name.clone()
            } else {
                None
            },
        });
        self.last_log_eligible_for_merge = false;
    }

    fn process_pending_log(&mut self) {
        let Some(header) = self.pending_header.take() else {
            return;
        };

        self.count_total += header.repeat_count;
        match header.level {
            LogLevel::Error | LogLevel::Fatal => self.count_error += header.repeat_count,
            LogLevel::Warn => self.count_warn += header.repeat_count,
            LogLevel::Info => self.count_info += header.repeat_count,
            LogLevel::Debug => self.count_debug += header.repeat_count,
            LogLevel::Trace => self.count_trace += header.repeat_count,
        }

        let clean_class_raw = strip_wrapping_delimiters(&header.class_name, '[', ']');
        let clean_thread_raw = strip_wrapping_delimiters(&header.thread, '(', ')');
        let clean_class = self.class_pool.intern(clean_class_raw);
        let clean_thread = self.thread_pool.intern(clean_thread_raw);
        let clean_message = strip_leading_dash_space(&header.message);

        let timestamp_ms = parse_log_timestamp_ms(&header.date);
        let time_secs = parse_time_seconds(&header.date);
        if timestamp_ms > 0 {
            self.oldest_date = Some(match self.oldest_date {
                Some(prev) => prev.min(timestamp_ms),
                None => timestamp_ms,
            });
            self.newest_date = Some(match self.newest_date {
                Some(prev) => prev.max(timestamp_ms),
                None => timestamp_ms,
            });
        }

        let entry_file_name = if self.multi_file_mode {
            header.file_name
        } else {
            None
        };

        let is_same_as_last = if self.last_log_eligible_for_merge {
            if let Some(last) = self.all_logs.last() {
                last.is_structured_log()
                    && last.date == header.date
                    && last.level == Some(header.level)
                    && last.class_name == clean_class
                    && last.thread == clean_thread
                    && last.message == clean_message
                    && (!self.multi_file_mode || last.file_name == entry_file_name)
                    && last.stacktrace == self.pending_buffer
            } else {
                false
            }
        } else {
            false
        };

        if is_same_as_last {
            if let Some(last) = self.all_logs.last_mut() {
                last.count += header.repeat_count;
            }
            self.pending_buffer.clear();
            return;
        }

        let mut delta_ms = 0u64;
        if let Some(prev_ts) = self.previous_unique_log_date
            && timestamp_ms > prev_ts
        {
            delta_ms = (timestamp_ms - prev_ts) as u64;
        }
        if timestamp_ms > 0 {
            self.previous_unique_log_date = Some(timestamp_ms);
        }

        let is_config = clean_message.contains(CONFIG_START_MARKER);
        let stacktrace = std::mem::take(&mut self.pending_buffer);

        self.all_logs.push(LogEntry {
            kind: LogEntryKind::Log {
                is_config_mode: is_config,
            },
            date: header.date,
            timestamp_ms,
            time_secs,
            delta_ms,
            level: Some(header.level),
            class_name: clean_class,
            thread: clean_thread,
            message: clean_message,
            count: header.repeat_count,
            stacktrace,
            file_name: entry_file_name,
        });
        self.last_log_eligible_for_merge = true;
    }

    pub fn finish(mut self) -> ParsedLogData {
        if self.in_config_block {
            self.flush_config_block();
            self.in_config_block = false;
        }
        self.process_pending_log();
        self.all_logs.reverse();

        let oldest = self.oldest_date.unwrap_or(0);
        let newest = self.newest_date.unwrap_or(0);
        let duration_ms = match (self.oldest_date, self.newest_date) {
            (Some(o), Some(n)) if n >= o => n - o,
            _ => 0,
        };

        let unique_entries = self.all_logs.len();
        ParsedLogData {
            entries: self.all_logs,
            stats: LogStats {
                total: self.count_total,
                errors: self.count_error,
                warnings: self.count_warn,
                infos: self.count_info,
                debugs: self.count_debug,
                traces: self.count_trace,
                processed_lines: self.processed_lines,
                unique_entries,
                oldest_date: oldest,
                newest_date: newest,
                duration_ms,
            },
        }
    }
}

pub struct StructuredHeader<'a> {
    pub date: &'a str,
    pub level: LogLevel,
    pub repeat_count: usize,
    pub class_name: &'a str,
    pub thread: &'a str,
    pub message: &'a str,
}

pub fn parse_structured_header(line: &str) -> Option<StructuredHeader<'_>> {
    let bytes = line.as_bytes();
    // Precheck rápido: YYYY-MM-DD HH:MM:SS,mmm ...
    if bytes.len() < 26
        || !bytes[0].is_ascii_digit()
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || !bytes[10].is_ascii_whitespace()
    {
        return None;
    }

    let caps = log_line_regex().captures(line)?;
    let date = caps.get(1)?.as_str();
    let raw_level = caps.get(2)?.as_str();
    let (level, repeat_count) = LogLevel::from_raw(raw_level)?;
    let class_name = caps.get(3)?.as_str();
    let thread = caps.get(4)?.as_str();
    let message = caps.get(5)?.as_str();

    Some(StructuredHeader {
        date,
        level,
        repeat_count,
        class_name,
        thread,
        message,
    })
}

pub fn strip_wrapping_delimiters(s: &str, open: char, close: char) -> &str {
    let mut out = s;
    if let Some(rest) = out.strip_prefix(open) {
        out = rest;
    }
    if let Some(rest) = out.strip_suffix(close) {
        out = rest;
    }
    out
}

pub fn strip_leading_dash_space(message: &str) -> String {
    if let Some(rest) = message.strip_prefix('-') {
        let trimmed = rest.trim_start_matches(|c: char| c.is_whitespace());
        if trimmed.len() < rest.len() {
            return trimmed.to_string();
        }
    }
    message.to_string()
}

pub fn parse_log_timestamp_ms(date_str: &str) -> i64 {
    let bytes = date_str.as_bytes();
    if bytes.len() < 19 {
        return 0;
    }
    let Ok(y) = date_str[0..4].parse::<i64>() else {
        return 0;
    };
    let Ok(m) = date_str[5..7].parse::<i64>() else {
        return 0;
    };
    let Ok(d) = date_str[8..10].parse::<i64>() else {
        return 0;
    };
    let Ok(hh) = date_str[11..13].parse::<i64>() else {
        return 0;
    };
    let Ok(mm) = date_str[14..16].parse::<i64>() else {
        return 0;
    };
    let Ok(ss) = date_str[17..19].parse::<i64>() else {
        return 0;
    };
    let ms = if bytes.len() >= 23 {
        date_str[20..23].parse::<i64>().unwrap_or(0)
    } else {
        0
    };

    if !(1..=12).contains(&m) || !(1..=31).contains(&d) || hh >= 24 || mm >= 60 || ss >= 60 {
        return 0;
    }

    let days = days_from_civil(y, m, d);
    days * 86_400_000 + (hh * 3600 + mm * 60 + ss) * 1000 + ms
}

// Howard Hinnant's civil-from-days algorithm: 1970-01-01 -> 0
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = y - if m <= 2 { 1 } else { 0 };
    let era = y.div_euclid(400);
    let yoe = y - era * 400; // [0, 399]
    let doy = (153 * (m + if m > 2 { -3 } else { 9 }) + 2) / 5 + d - 1; // [0, 365]
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy; // [0, 146096]
    era * 146_097 + doe - 719_468
}

pub fn parse_time_seconds(date_str: &str) -> i32 {
    if date_str.len() < 19 {
        return -1;
    }
    let Ok(hh) = date_str[11..13].parse::<i32>() else {
        return -1;
    };
    let Ok(mm) = date_str[14..16].parse::<i32>() else {
        return -1;
    };
    let Ok(ss) = date_str[17..19].parse::<i32>() else {
        return -1;
    };
    if !(0..=23).contains(&hh) || !(0..=59).contains(&mm) || !(0..=59).contains(&ss) {
        return -1;
    }
    hh * 3600 + mm * 60 + ss
}

pub fn parse_text(content: &str) -> ParsedLogData {
    let mut parser = LogParser::new(false);
    for line in content.split('\n') {
        parser.process_line(line);
    }
    // Se a string termina em '\n', `split('\n')` gera uma linha vazia final,
    // que `process_line` ignora quando `trimmed.is_empty()` e `pending_header` está ativo ou não,
    // mas não inflamos `processed_lines` se vazio no final de um `\n` literal?
    // Na verdade `feedTextBuffer` em logWorker.js NÃO chama `processLine` após o último `\n`.
    // Vamos replicar exatamente `feedTextBuffer`:
    let _ = &mut parser;
    let mut exact_parser = LogParser::new(false);
    let mut start = 0usize;
    let bytes = content.as_bytes();
    while let Some(rel) = bytes[start..].iter().position(|&b| b == b'\n') {
        let end = start + rel;
        exact_parser.process_line(&content[start..end]);
        start = end + 1;
    }
    if start < content.len() {
        exact_parser.process_line(&content[start..]);
    }
    exact_parser.finish()
}

pub fn parse_files_streaming(
    paths: &[PathBuf],
    cancel: &AtomicBool,
    on_progress: impl FnMut(ParseProgress),
) -> Result<ParsedLogData> {
    parse_files_streaming_with_chunk_size(paths, CHUNK_SIZE, cancel, on_progress)
}

pub fn parse_files_streaming_with_chunk_size(
    paths: &[PathBuf],
    chunk_size: usize,
    cancel: &AtomicBool,
    mut on_progress: impl FnMut(ParseProgress),
) -> Result<ParsedLogData> {
    if paths.is_empty() {
        return Ok(ParsedLogData::default());
    }

    let chunk_size = chunk_size.max(1);
    let total_bytes: u64 = paths
        .iter()
        .map(|p| std::fs::metadata(p).map(|m| m.len()).unwrap_or(0))
        .sum();

    let mut parser = LogParser::new(paths.len() > 1);
    let mut processed_bytes_global: u64 = 0;
    let mut last_report = Instant::now();
    let mut buffer = vec![0u8; chunk_size];
    let mut line_carry: Vec<u8> = Vec::with_capacity(4096);

    for (idx, path) in paths.iter().enumerate() {
        if cancel.load(Ordering::Relaxed) {
            return Err(anyhow!("Leitura cancelada pelo usuário."));
        }

        let file_name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| format!("arquivo-{}.log", idx + 1));

        let file =
            File::open(path).with_context(|| format!("Falha ao abrir {}", path.display()))?;
        let file_size = file.metadata().map(|m| m.len()).unwrap_or(0);
        let is_gz = path
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| e.eq_ignore_ascii_case("gz"));

        parser.set_active_file(&file_name);
        line_carry.clear();

        if is_gz {
            let mut decoder = MultiGzDecoder::new(BufReader::new(file));
            loop {
                if cancel.load(Ordering::Relaxed) {
                    return Err(anyhow!("Leitura cancelada pelo usuário."));
                }
                let n = decoder
                    .read(&mut buffer)
                    .with_context(|| format!("Erro ao descomprimir {}", path.display()))?;
                if n == 0 {
                    break;
                }
                feed_byte_chunk(&mut parser, &mut line_carry, &buffer[..n], false);

                if last_report.elapsed().as_millis() >= 80 {
                    last_report = Instant::now();
                    let pct = if total_bytes > 0 {
                        ((processed_bytes_global + file_size / 2) * 100 / total_bytes).min(99) as u8
                    } else {
                        50
                    };
                    on_progress(ParseProgress {
                        progress_pct: pct,
                        processed_bytes: processed_bytes_global,
                        total_bytes,
                        processed_lines: parser.processed_lines(),
                        unique_entries: parser.unique_count(),
                        file_name: file_name.clone(),
                        file_index: idx + 1,
                        file_count: paths.len(),
                    });
                }
            }
            processed_bytes_global = processed_bytes_global.saturating_add(file_size);
        } else {
            let mut reader = BufReader::new(file);
            let mut file_bytes_read: u64 = 0;
            loop {
                if cancel.load(Ordering::Relaxed) {
                    return Err(anyhow!("Leitura cancelada pelo usuário."));
                }
                let n = reader
                    .read(&mut buffer)
                    .with_context(|| format!("Erro ao ler {}", path.display()))?;
                if n == 0 {
                    break;
                }
                feed_byte_chunk(&mut parser, &mut line_carry, &buffer[..n], false);
                file_bytes_read += n as u64;
                processed_bytes_global += n as u64;

                let is_file_end = file_size > 0 && file_bytes_read >= file_size;
                if is_file_end || last_report.elapsed().as_millis() >= 80 {
                    last_report = Instant::now();
                    let pct = if total_bytes > 0 {
                        ((processed_bytes_global * 100) / total_bytes).min(99) as u8
                    } else {
                        100
                    };
                    on_progress(ParseProgress {
                        progress_pct: pct,
                        processed_bytes: processed_bytes_global,
                        total_bytes,
                        processed_lines: parser.processed_lines(),
                        unique_entries: parser.unique_count(),
                        file_name: file_name.clone(),
                        file_index: idx + 1,
                        file_count: paths.len(),
                    });
                }
            }
        }

        if !line_carry.is_empty() {
            feed_byte_chunk(&mut parser, &mut line_carry, &[], true);
        }

        let pct = if total_bytes > 0 {
            ((processed_bytes_global * 100) / total_bytes).min(99) as u8
        } else {
            100
        };
        on_progress(ParseProgress {
            progress_pct: pct,
            processed_bytes: processed_bytes_global,
            total_bytes,
            processed_lines: parser.processed_lines(),
            unique_entries: parser.unique_count(),
            file_name,
            file_index: idx + 1,
            file_count: paths.len(),
        });
    }

    Ok(parser.finish())
}

fn feed_byte_chunk(parser: &mut LogParser, carry: &mut Vec<u8>, chunk: &[u8], flush_all: bool) {
    if !chunk.is_empty() {
        let mut start = 0usize;
        for (idx, &byte) in chunk.iter().enumerate() {
            if byte == b'\n' {
                if carry.is_empty() {
                    let line = String::from_utf8_lossy(&chunk[start..idx]);
                    parser.process_line(&line);
                } else {
                    carry.extend_from_slice(&chunk[start..idx]);
                    let line = String::from_utf8_lossy(carry);
                    parser.process_line(&line);
                    carry.clear();
                }
                start = idx + 1;
            }
        }
        if start < chunk.len() {
            carry.extend_from_slice(&chunk[start..]);
        }
    }

    if flush_all && !carry.is_empty() {
        let line = String::from_utf8_lossy(carry);
        parser.process_line(&line);
        carry.clear();
    }
}
