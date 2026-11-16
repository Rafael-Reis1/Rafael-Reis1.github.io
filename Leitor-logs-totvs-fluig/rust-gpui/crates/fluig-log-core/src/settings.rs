use crate::filter::{FilterCriteria, SortOrder};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SavedFilters {
    pub pinned_only: bool,
    pub with_stacktrace_only: bool,
    pub levels: Vec<String>,
    pub search: String,
    pub regex_mode: bool,
    pub time_start: String,
    pub time_end: String,
    pub sort_order: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FileSettings {
    pub pinned_signatures: Vec<String>,
    pub filters: SavedFilters,
}

impl FileSettings {
    pub fn from_state(criteria: &FilterCriteria, pinned: &[String]) -> Self {
        let mut levels = Vec::new();
        if criteria.show_info {
            levels.push("INFO".to_string());
        }
        if criteria.show_warn {
            levels.push("WARN".to_string());
        }
        if criteria.show_error {
            levels.push("ERROR".to_string());
        }
        if criteria.show_debug {
            levels.push("DEBUG".to_string());
        }
        Self {
            pinned_signatures: pinned.to_vec(),
            filters: SavedFilters {
                pinned_only: criteria.pinned_only,
                with_stacktrace_only: criteria.with_stacktrace_only,
                levels,
                search: criteria.search_query.clone(),
                regex_mode: criteria.regex_mode,
                time_start: criteria.time_start.clone(),
                time_end: criteria.time_end.clone(),
                sort_order: match criteria.sort_order {
                    SortOrder::Asc => "asc".to_string(),
                    SortOrder::Desc => "desc".to_string(),
                },
            },
        }
    }

    pub fn apply_to_criteria(&self, criteria: &mut FilterCriteria) {
        criteria.pinned_only = self.filters.pinned_only;
        criteria.with_stacktrace_only = self.filters.with_stacktrace_only;
        criteria.search_query = self.filters.search.clone();
        criteria.regex_mode = self.filters.regex_mode;
        criteria.time_start = self.filters.time_start.clone();
        criteria.time_end = self.filters.time_end.clone();
        criteria.sort_order = if self.filters.sort_order == "asc" {
            SortOrder::Asc
        } else {
            SortOrder::Desc
        };
        criteria.show_info = self.filters.levels.iter().any(|l| l == "INFO");
        criteria.show_warn = self.filters.levels.iter().any(|l| l == "WARN");
        criteria.show_error = self.filters.levels.iter().any(|l| l == "ERROR");
        criteria.show_debug = self.filters.levels.iter().any(|l| l == "DEBUG");
    }
}

fn default_settings_path() -> PathBuf {
    std::env::temp_dir().join("leitor-logs-totvs-fluig-settings.json")
}

pub fn load_all_settings_from_path(path: &std::path::Path) -> HashMap<String, FileSettings> {
    let Ok(bytes) = std::fs::read(path) else {
        return HashMap::new();
    };
    serde_json::from_slice(&bytes).unwrap_or_default()
}

pub fn load_file_settings(file_key: &str) -> Option<FileSettings> {
    if file_key.is_empty() {
        return None;
    }
    let path = default_settings_path();
    let mut map = load_all_settings_from_path(&path);
    map.remove(file_key)
}

pub fn save_file_settings(file_key: &str, settings: &FileSettings) {
    if file_key.is_empty() {
        return;
    }
    let path = default_settings_path();
    let mut map = load_all_settings_from_path(&path);
    map.insert(file_key.to_string(), settings.clone());
    if let Ok(json) = serde_json::to_vec_pretty(&map) {
        let _ = std::fs::write(&path, json);
    }
}
