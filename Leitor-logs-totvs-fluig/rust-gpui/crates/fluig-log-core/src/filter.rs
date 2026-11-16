use crate::model::{LogEntry, LogLevel, format_duration_ms, get_log_signature};
use regex::{Regex, RegexBuilder};
use std::collections::HashSet;
use std::ops::Range;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SortOrder {
    Desc,
    Asc,
}

#[derive(Debug, Clone)]
pub struct SearchSpec {
    pub has_query: bool,
    pub is_regex: bool,
    pub is_valid_regex: bool,
    pub regex: Option<Regex>,
    pub positive_tokens: Vec<String>,
    pub negative_tokens: Vec<String>,
}

impl Default for SearchSpec {
    fn default() -> Self {
        Self {
            has_query: false,
            is_regex: false,
            is_valid_regex: true,
            regex: None,
            positive_tokens: Vec::new(),
            negative_tokens: Vec::new(),
        }
    }
}

pub fn compile_search_spec(raw_term: &str, force_regex: bool) -> SearchSpec {
    let trimmed = raw_term.trim();
    if trimmed.is_empty() {
        return SearchSpec::default();
    }

    let wrapped_as_regex =
        trimmed.len() > 2 && trimmed.starts_with('/') && trimmed.ends_with('/');
    if wrapped_as_regex || force_regex {
        let pattern = if wrapped_as_regex {
            &trimmed[1..trimmed.len() - 1]
        } else {
            trimmed
        };
        if pattern.is_empty() {
            return SearchSpec {
                is_regex: true,
                ..SearchSpec::default()
            };
        }
        match RegexBuilder::new(pattern).case_insensitive(true).build() {
            Ok(re) => {
                return SearchSpec {
                    has_query: true,
                    is_regex: true,
                    is_valid_regex: true,
                    regex: Some(re),
                    positive_tokens: Vec::new(),
                    negative_tokens: Vec::new(),
                };
            }
            Err(_) => {
                return SearchSpec {
                    has_query: true,
                    is_regex: true,
                    is_valid_regex: false,
                    regex: None,
                    positive_tokens: Vec::new(),
                    negative_tokens: Vec::new(),
                };
            }
        }
    }

    let mut positive_tokens = Vec::new();
    let mut negative_tokens = Vec::new();
    for token in trimmed.split_whitespace() {
        let lower = token.to_lowercase();
        if let Some(neg) = lower.strip_prefix('-')
            && !neg.is_empty()
        {
            negative_tokens.push(neg.to_string());
        } else {
            positive_tokens.push(lower);
        }
    }

    SearchSpec {
        has_query: !positive_tokens.is_empty() || !negative_tokens.is_empty(),
        is_regex: false,
        is_valid_regex: true,
        regex: None,
        positive_tokens,
        negative_tokens,
    }
}

pub fn text_matches_spec(text: &str, spec: &SearchSpec) -> bool {
    if !spec.has_query || text.is_empty() {
        return false;
    }
    if spec.is_regex {
        return spec.regex.as_ref().is_some_and(|re| re.is_match(text));
    }
    let lower = text.to_lowercase();
    if spec.negative_tokens.iter().any(|neg| lower.contains(neg)) {
        return false;
    }
    if spec.positive_tokens.is_empty() {
        return true;
    }
    spec.positive_tokens.iter().any(|pos| lower.contains(pos))
}

pub fn matches_log_entry_spec(entry: &LogEntry, spec: &SearchSpec) -> bool {
    if !spec.has_query {
        return true;
    }
    if spec.is_regex && !spec.is_valid_regex {
        return false;
    }

    if entry.is_raw() {
        if spec.is_regex {
            return spec
                .regex
                .as_ref()
                .is_some_and(|re| re.is_match(&entry.message));
        }
        let lower = entry.message.to_lowercase();
        return spec.negative_tokens.iter().all(|n| !lower.contains(n))
            && spec.positive_tokens.iter().all(|p| lower.contains(p));
    }

    if entry.is_stacktrace_only() {
        if spec.is_regex {
            return spec
                .regex
                .as_ref()
                .is_some_and(|re| entry.stacktrace.iter().any(|line| re.is_match(line)));
        }
        let joined_lower = entry.stacktrace.join("\n").to_lowercase();
        return spec
            .negative_tokens
            .iter()
            .all(|n| !joined_lower.contains(n))
            && spec
                .positive_tokens
                .iter()
                .all(|p| joined_lower.contains(p));
    }

    let level_str = entry.level.map(LogLevel::as_str).unwrap_or("");
    let header_raw = format!(
        "{} {} {} {} {}",
        entry.date, level_str, entry.class_name, entry.thread, entry.message
    );

    if spec.is_regex {
        let Some(re) = spec.regex.as_ref() else {
            return false;
        };
        if re.is_match(&header_raw) {
            return true;
        }
        return entry.stacktrace.iter().any(|line| re.is_match(line));
    }

    let header_lower = header_raw.to_lowercase();
    let trace_lowers: Vec<String> = entry.stacktrace.iter().map(|l| l.to_lowercase()).collect();

    for neg in &spec.negative_tokens {
        if header_lower.contains(neg) || trace_lowers.iter().any(|l| l.contains(neg)) {
            return false;
        }
    }

    for pos in &spec.positive_tokens {
        if header_lower.contains(pos) || trace_lowers.iter().any(|l| l.contains(pos)) {
            continue;
        }
        return false;
    }

    true
}

/// Retorna ranges de bytes válidos para highlight (ex: `StyledText::with_highlights`).
pub fn find_highlight_ranges(text: &str, spec: &SearchSpec) -> Vec<Range<usize>> {
    if !spec.has_query || text.is_empty() || text.len() > 60_000 {
        return Vec::new();
    }

    let mut ranges: Vec<Range<usize>> = Vec::new();

    if spec.is_regex {
        let Some(re) = spec.regex.as_ref() else {
            return Vec::new();
        };
        for mat in re.find_iter(text) {
            if mat.start() < mat.end()
                && text.is_char_boundary(mat.start())
                && text.is_char_boundary(mat.end())
            {
                ranges.push(mat.start()..mat.end());
            }
        }
        return ranges;
    }

    if spec.positive_tokens.is_empty() {
        return Vec::new();
    }

    // `to_lowercase()` pode alterar o tamanho de bytes de alguns caracteres Unicode raros,
    // por isso mapeamos ocorrências ASCII/UTF-8 mantendo sempre validação com `is_char_boundary`
    // ou usamos regex escapado case-insensitive que garante offsets exatos no `text` original.
    let pattern = spec
        .positive_tokens
        .iter()
        .map(|t| regex::escape(t))
        .collect::<Vec<_>>()
        .join("|");
    if let Ok(re) = RegexBuilder::new(&pattern).case_insensitive(true).build() {
        for mat in re.find_iter(text) {
            if mat.start() < mat.end()
                && text.is_char_boundary(mat.start())
                && text.is_char_boundary(mat.end())
            {
                ranges.push(mat.start()..mat.end());
            }
        }
    }

    ranges
}

pub fn parse_time_filter_secs(value: &str, is_end: bool) -> i32 {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return -1;
    }
    let parts: Vec<&str> = trimmed.split(':').collect();
    if parts.len() < 2 {
        return -1;
    }
    let Ok(hh) = parts[0].parse::<i32>() else {
        return -1;
    };
    let Ok(mm) = parts[1].parse::<i32>() else {
        return -1;
    };
    let ss = if parts.len() >= 3 && !parts[2].is_empty() {
        match parts[2].parse::<i32>() {
            Ok(v) => v,
            Err(_) => return -1,
        }
    } else if is_end {
        59
    } else {
        0
    };

    if !(0..=23).contains(&hh) || !(0..=59).contains(&mm) || !(0..=59).contains(&ss) {
        return -1;
    }
    hh * 3600 + mm * 60 + ss
}

#[derive(Debug, Clone)]
pub struct FilterCriteria {
    pub search_query: String,
    pub regex_mode: bool,
    pub time_start: String,
    pub time_end: String,
    pub show_info: bool,
    pub show_warn: bool,
    pub show_error: bool,
    pub show_debug: bool,
    pub pinned_only: bool,
    pub with_stacktrace_only: bool,
    pub sort_order: SortOrder,
}

impl Default for FilterCriteria {
    fn default() -> Self {
        Self {
            search_query: String::new(),
            regex_mode: false,
            time_start: String::new(),
            time_end: String::new(),
            show_info: false,
            show_warn: false,
            show_error: false,
            show_debug: false,
            pinned_only: false,
            with_stacktrace_only: false,
            sort_order: SortOrder::Desc,
        }
    }
}

impl FilterCriteria {
    pub fn has_any_level(&self) -> bool {
        self.show_info || self.show_warn || self.show_error || self.show_debug
    }

    pub fn has_any_filter(&self) -> bool {
        !self.search_query.trim().is_empty()
            || !self.time_start.trim().is_empty()
            || !self.time_end.trim().is_empty()
            || self.has_any_level()
            || self.pinned_only
            || self.with_stacktrace_only
    }

    pub fn matches_level(&self, level: Option<LogLevel>) -> bool {
        if !self.has_any_level() {
            return true;
        }
        let Some(level) = level else {
            return false;
        };
        match level {
            LogLevel::Info => self.show_info,
            LogLevel::Warn => self.show_warn,
            LogLevel::Error | LogLevel::Fatal => self.show_error,
            LogLevel::Debug => self.show_debug,
            LogLevel::Trace => false,
        }
    }
}

#[derive(Debug, Clone)]
pub struct FilteredResult {
    pub indices: Vec<usize>,
    pub search_spec: SearchSpec,
    pub visible_occurrences: usize,
    pub visible_errors: usize,
    pub visible_warnings: usize,
    pub visible_entries: usize,
    pub visible_duration_text: String,
}

pub fn filter_entries(
    entries: &[LogEntry],
    criteria: &FilterCriteria,
    pinned_signatures: &HashSet<String>,
) -> FilteredResult {
    let spec = compile_search_spec(&criteria.search_query, criteria.regex_mode);
    let start_secs = parse_time_filter_secs(&criteria.time_start, false);
    let end_secs = parse_time_filter_secs(&criteria.time_end, true);
    let has_time_filter = start_secs >= 0 || end_secs >= 0;
    let has_level_filter = criteria.has_any_level();

    let mut matched_indices = Vec::new();
    let mut visible_occurrences = 0usize;
    let mut visible_errors = 0usize;
    let mut visible_warnings = 0usize;
    let mut oldest_visible: Option<i64> = None;
    let mut newest_visible: Option<i64> = None;

    for (idx, entry) in entries.iter().enumerate() {
        if has_level_filter && !criteria.matches_level(entry.level) {
            continue;
        }

        if has_time_filter {
            if entry.time_secs < 0 {
                continue;
            }
            let s = entry.time_secs;
            if start_secs >= 0 && end_secs >= 0 {
                if start_secs <= end_secs {
                    if s < start_secs || s > end_secs {
                        continue;
                    }
                } else {
                    // Faixa cruzando meia-noite (ex: 23:30 - 01:15)
                    if s < start_secs && s > end_secs {
                        continue;
                    }
                }
            } else if start_secs >= 0 && s < start_secs {
                continue;
            } else if end_secs >= 0 && s > end_secs {
                continue;
            }
        }

        if criteria.with_stacktrace_only && entry.stacktrace.is_empty() {
            continue;
        }

        if criteria.pinned_only {
            let sig = get_log_signature(entry);
            if sig.is_empty() || !pinned_signatures.contains(&sig) {
                continue;
            }
        }

        if spec.has_query && !matches_log_entry_spec(entry, &spec) {
            continue;
        }

        if entry.timestamp_ms > 0 {
            oldest_visible = Some(match oldest_visible {
                Some(prev) => prev.min(entry.timestamp_ms),
                None => entry.timestamp_ms,
            });
            newest_visible = Some(match newest_visible {
                Some(prev) => prev.max(entry.timestamp_ms),
                None => entry.timestamp_ms,
            });
        }

        if entry.is_structured_log() {
            let weight = entry.count.max(1);
            visible_occurrences += weight;
            if let Some(level) = entry.level {
                if level.is_error_like() {
                    visible_errors += weight;
                } else if level == LogLevel::Warn {
                    visible_warnings += weight;
                }
            }
        }

        matched_indices.push(idx);
    }

    if criteria.sort_order == SortOrder::Asc {
        matched_indices.reverse();
    }

    let visible_entries = matched_indices.len();
    let visible_duration_text = match (oldest_visible, newest_visible) {
        (Some(o), Some(n)) if n > o => format_duration_ms(n - o),
        _ => "--".to_string(),
    };

    FilteredResult {
        indices: matched_indices,
        search_spec: spec,
        visible_occurrences,
        visible_errors,
        visible_warnings,
        visible_entries,
        visible_duration_text,
    }
}
