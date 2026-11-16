pub mod export;
pub mod filter;
pub mod model;
pub mod parser;
pub mod settings;

pub use export::{ExportFormat, build_export_bytes};
pub use filter::{
    FilterCriteria, FilteredResult, SearchSpec, SortOrder, compile_search_spec, filter_entries,
    find_highlight_ranges, matches_log_entry_spec, parse_time_filter_secs, text_matches_spec,
};
pub use model::{
    LogEntry, LogEntryKind, LogLevel, LogStats, ParseProgress, ParsedLogData, format_bytes,
    format_delta_badge, format_duration_ms, format_log_entry_as_text, format_pt_br_number,
    get_files_storage_key, get_log_signature, is_supported_log_path,
};
pub use parser::{
    CHUNK_SIZE, CONFIG_START_MARKER, LogParser, parse_files_streaming,
    parse_files_streaming_with_chunk_size, parse_log_timestamp_ms, parse_structured_header,
    parse_text, parse_time_seconds,
};
pub use settings::{FileSettings, SavedFilters, load_file_settings, save_file_settings};

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::Compression;
    use flate2::write::GzEncoder;
    use std::collections::HashSet;
    use std::io::Write;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::AtomicBool;

    fn temp_dir_for_test(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "fluig_log_core_test_{}_{}",
            name,
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp test dir");
        dir
    }

    #[test]
    fn streaming_multi_file_utf8_chunks_bom_dedup_and_config_blocks() {
        let dir = temp_dir_for_test("streaming");
        let rotated_path = dir.join("server.log.1");
        let current_path = dir.join("server.log");

        let rotated = [
            "\u{FEFF}2026-11-12 23:45:00,100 SEVERE [com.fluig.Auth] (task-1) - Autenticação falhou",
            "java.lang.RuntimeException: Token inválido",
            "\tat com.fluig.Auth.login(Auth.java:42)",
        ]
        .join("\n");

        let current = [
            "2026-11-13 00:10:00,250 INFOx3 [com.fluig.BPM] (task-2) - Processo iniciado com ação",
            "2026-11-13 00:15:00,500 WARN [com.fluig.DB] (task-3) - Conexão lenta",
            "2026-11-13 00:15:00,500 WARN [com.fluig.DB] (task-3) - Conexão lenta",
            "2026-11-13 00:16:00,000 INFO [com.fluig.Boot] (MSC-1) - =============LOG CONFIGS=========",
            "fluig.version=1.8.2",
            "==================================",
        ]
        .join("\n");

        std::fs::write(&rotated_path, rotated.as_bytes()).unwrap();
        std::fs::write(&current_path, current.as_bytes()).unwrap();

        let mut progress_events = Vec::new();
        let cancel = AtomicBool::new(false);
        let data = parse_files_streaming_with_chunk_size(
            &[rotated_path, current_path],
            13, // Força quebra no meio de linhas e de caracteres UTF-8 multibyte
            &cancel,
            |p| progress_events.push(p),
        )
        .expect("streaming parse succeeds");

        let _ = std::fs::remove_dir_all(&dir);

        assert!(progress_events.len() >= 2);
        assert_eq!(data.stats.total, 7);
        assert_eq!(data.stats.errors, 1);
        assert_eq!(data.stats.warnings, 2);

        let bpm = data
            .entries
            .iter()
            .find(|e| e.class_name.as_ref() == "com.fluig.BPM")
            .expect("BPM entry exists");
        assert_eq!(bpm.count, 3);
        assert!(bpm.stacktrace.is_empty());
        assert_eq!(bpm.message, "Processo iniciado com ação");

        let warn = data
            .entries
            .iter()
            .find(|e| e.level == Some(LogLevel::Warn))
            .expect("WARN entry exists");
        assert_eq!(warn.count, 2);
        assert_eq!(warn.file_name.as_deref(), Some("server.log"));

        let err = data
            .entries
            .iter()
            .find(|e| e.level == Some(LogLevel::Error))
            .expect("SEVERE normalized to ERROR");
        assert_eq!(err.file_name.as_deref(), Some("server.log.1"));
        assert_eq!(
            err.stacktrace,
            vec![
                "java.lang.RuntimeException: Token inválido".to_string(),
                "\tat com.fluig.Auth.login(Auth.java:42)".to_string(),
            ]
        );

        let cfg = data
            .entries
            .iter()
            .find(|e| e.is_stacktrace_only())
            .expect("LOG CONFIGS block parsed");
        assert!(cfg.is_config_mode());
        assert_eq!(
            cfg.stacktrace,
            vec![
                "fluig.version=1.8.2".to_string(),
                "==================================".to_string(),
            ]
        );
    }

    #[test]
    fn supported_paths_accept_rotated_and_gz_reject_binaries() {
        assert!(is_supported_log_path(Path::new("server.log")));
        assert!(is_supported_log_path(Path::new("server.log.1")));
        assert!(is_supported_log_path(Path::new("server.log.2026-11-12")));
        assert!(is_supported_log_path(Path::new("catalina.out")));
        assert!(is_supported_log_path(Path::new("server.log.gz")));
        assert!(is_supported_log_path(Path::new("server.log.1.gz")));
        assert!(!is_supported_log_path(Path::new("foto.png")));
        assert!(!is_supported_log_path(Path::new("fluig.jar")));
        assert!(!is_supported_log_path(Path::new("backup.tar.gz")));
        assert!(!is_supported_log_path(Path::new("bundle.zip")));
    }

    #[test]
    fn filter_midnight_wrap_stacktrace_negative_tokens_regex_and_sort() {
        let raw = [
            "2026-11-12 23:40:00,000 FATAL [com.fluig.Core] (t-1) - Queda crítica",
            "java.lang.OutOfMemoryError: heap",
            "2026-11-13 00:10:00,000 WARN [com.fluig.Pool] (t-2) - Pool cheio -ignorado",
            "2026-11-13 14:20:00,000 INFO [com.fluig.Job] (t-3) - Job concluído",
        ]
        .join("\n");

        let parsed = parse_text(&raw);
        assert_eq!(parsed.entries.len(), 3);

        let pins = HashSet::new();

        // Faixa cruzando meia-noite: 23:30:00 -> 01:00:00
        let mut criteria = FilterCriteria {
            time_start: "23:30:00".to_string(),
            time_end: "01:00:00".to_string(),
            ..Default::default()
        };
        let res = filter_entries(&parsed.entries, &criteria, &pins);
        assert_eq!(res.indices.len(), 2);

        // Somente com stacktrace
        criteria.with_stacktrace_only = true;
        let res = filter_entries(&parsed.entries, &criteria, &pins);
        assert_eq!(res.indices.len(), 1);
        assert_eq!(parsed.entries[res.indices[0]].level, Some(LogLevel::Fatal));

        // Reset + ordem cronológica vs mais recentes primeiro
        criteria = FilterCriteria::default();
        let desc = filter_entries(&parsed.entries, &criteria, &pins);
        assert_eq!(desc.indices.len(), 3);
        assert_eq!(parsed.entries[desc.indices[0]].level, Some(LogLevel::Info));

        criteria.sort_order = SortOrder::Asc;
        let asc = filter_entries(&parsed.entries, &criteria, &pins);
        assert_eq!(parsed.entries[asc.indices[0]].level, Some(LogLevel::Fatal));

        // Token negativo exclui "-ignorado" (ou "-cheio")
        criteria.sort_order = SortOrder::Desc;
        criteria.search_query = "pool -cheio".to_string();
        let neg = filter_entries(&parsed.entries, &criteria, &pins);
        assert_eq!(neg.indices.len(), 0);

        // Regex /.../ e highlight ranges
        criteria.search_query = "/OutOfMemory\\w+/".to_string();
        let regex_res = filter_entries(&parsed.entries, &criteria, &pins);
        assert_eq!(regex_res.indices.len(), 1);
        let line = "java.lang.OutOfMemoryError: heap";
        let ranges = find_highlight_ranges(line, &regex_res.search_spec);
        assert_eq!(ranges, vec![10..26]);
        assert_eq!(&line[ranges[0].clone()], "OutOfMemoryError");
    }

    #[test]
    fn export_csv_with_bom_json_without_time_secs_and_txt() {
        let raw = [
            "2026-11-13 10:00:00,000 INFO [com.fluig.A] (t-1) - Primeiro",
            "2026-11-13 10:01:00,000 ERROR [com.fluig.B] (t-2) - Segundo \"citado\"",
        ]
        .join("\n");

        let parsed = parse_text(&raw);
        let pins = HashSet::new();
        let criteria = FilterCriteria::default();
        let filtered = filter_entries(&parsed.entries, &criteria, &pins);

        let csv_bytes = build_export_bytes(
            &parsed.entries,
            &filtered.indices,
            criteria.sort_order,
            ExportFormat::Csv,
        );
        assert_eq!(&csv_bytes[..3], &[0xEF, 0xBB, 0xBF]);
        let csv_text = std::str::from_utf8(&csv_bytes[3..]).unwrap();
        assert!(csv_text.starts_with("Data;Hora;Level;Classe;Thread;Mensagem\n"));
        assert!(csv_text.contains("\"Segundo \"\"citado\"\"\""));

        let json_bytes = build_export_bytes(
            &parsed.entries,
            &filtered.indices,
            criteria.sort_order,
            ExportFormat::Json,
        );
        let json_val: serde_json::Value = serde_json::from_slice(&json_bytes).unwrap();
        let arr = json_val.as_array().unwrap();
        assert_eq!(arr.len(), 2);
        assert_eq!(arr[0]["message"], "Primeiro");
        assert!(arr[0].get("timeSecs").is_none());

        let txt_bytes = build_export_bytes(
            &parsed.entries,
            &filtered.indices,
            criteria.sort_order,
            ExportFormat::Txt,
        );
        let txt = String::from_utf8(txt_bytes).unwrap();
        assert!(txt.contains("2026-11-13 10:00:00,000 INFO [com.fluig.A] (t-1) - Primeiro"));
    }

    #[test]
    fn parses_gzipped_log_file() {
        let dir = temp_dir_for_test("gzip");
        let gz_path = dir.join("server.log.gz");
        let content = "2026-11-13 12:00:00,000 ERROR [com.fluig.Gz] (main) - Erro compactado\n";

        let file = std::fs::File::create(&gz_path).unwrap();
        let mut encoder = GzEncoder::new(file, Compression::default());
        encoder.write_all(content.as_bytes()).unwrap();
        encoder.finish().unwrap();

        let cancel = AtomicBool::new(false);
        let data = parse_files_streaming(&[gz_path], &cancel, |_| {}).expect("gz parses");
        let _ = std::fs::remove_dir_all(&dir);

        assert_eq!(data.entries.len(), 1);
        assert_eq!(data.entries[0].level, Some(LogLevel::Error));
        assert_eq!(data.entries[0].message, "Erro compactado");
    }

    #[test]
    fn parses_real_sample_fluig_log() {
        let sample = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("..")
            .join("tests")
            .join("sample-fluig.log");
        assert!(sample.exists(), "sample-fluig.log deve existir em {}", sample.display());

        let cancel = AtomicBool::new(false);
        let data = parse_files_streaming(&[sample], &cancel, |_| {}).expect("sample parses");
        assert!(data.stats.processed_lines >= 1600);
        assert!(data.stats.errors > 0);
        assert!(data.stats.warnings > 0);
        assert!(!data.entries.is_empty());
    }
}
