use super::*;
use std::fs;
use std::io::Write;
use tempfile::TempDir;

fn create_test_session_file(
    dir: &PathBuf,
    filename: &str,
    content: &str,
) -> Result<(), std::io::Error> {
    let file_path = dir.join(filename);
    let mut file = fs::File::create(file_path)?;
    file.write_all(content.as_bytes())?;
    Ok(())
}

#[test]
fn test_get_project_path_from_sessions_normal_case() {
    let temp_dir = TempDir::new().unwrap();
    let project_dir = temp_dir.path().to_path_buf();
    let content = r#"{"type":"system","cwd":"/Users/test/my-project"}"#;
    create_test_session_file(&project_dir, "session1.jsonl", content).unwrap();
    let result = project::get_project_path_from_sessions(&project_dir);
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "/Users/test/my-project");
}

#[test]
fn test_get_project_path_from_sessions_with_hyphen() {
    let temp_dir = TempDir::new().unwrap();
    let project_dir = temp_dir.path().to_path_buf();
    let content = r#"{"type":"system","cwd":"/Users/test/data-discovery"}"#;
    create_test_session_file(&project_dir, "session1.jsonl", content).unwrap();
    let result = project::get_project_path_from_sessions(&project_dir);
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "/Users/test/data-discovery");
}

#[test]
fn test_get_project_path_from_sessions_null_cwd_first_line() {
    let temp_dir = TempDir::new().unwrap();
    let project_dir = temp_dir.path().to_path_buf();
    let content = format!(
        "{}\n{}",
        r#"{"type":"system","cwd":null}"#,
        r#"{"type":"system","cwd":"/Users/test/valid-path"}"#
    );
    create_test_session_file(&project_dir, "session1.jsonl", &content).unwrap();
    let result = project::get_project_path_from_sessions(&project_dir);
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "/Users/test/valid-path");
}

#[test]
fn test_get_project_path_from_sessions_multiple_lines() {
    let temp_dir = TempDir::new().unwrap();
    let project_dir = temp_dir.path().to_path_buf();
    let content = format!(
        "{}\n{}\n{}\n{}\n{}",
        r#"{"type":"other"}"#,
        r#"{"type":"system","cwd":null}"#,
        r#"{"type":"message"}"#,
        r#"{"type":"system"}"#,
        r#"{"type":"system","cwd":"/Users/test/project"}"#
    );
    create_test_session_file(&project_dir, "session1.jsonl", &content).unwrap();
    let result = project::get_project_path_from_sessions(&project_dir);
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "/Users/test/project");
}

#[test]
fn test_get_project_path_from_sessions_empty_dir() {
    let temp_dir = TempDir::new().unwrap();
    let project_dir = temp_dir.path().to_path_buf();
    let result = project::get_project_path_from_sessions(&project_dir);
    assert!(result.is_err());
    assert_eq!(
        result.unwrap_err(),
        "Could not determine project path from session files"
    );
}

#[test]
fn test_get_project_path_from_sessions_no_jsonl_files() {
    let temp_dir = TempDir::new().unwrap();
    let project_dir = temp_dir.path().to_path_buf();
    create_test_session_file(&project_dir, "readme.txt", "Some text").unwrap();
    let result = project::get_project_path_from_sessions(&project_dir);
    assert!(result.is_err());
}

#[test]
fn test_get_project_path_from_sessions_no_cwd() {
    let temp_dir = TempDir::new().unwrap();
    let project_dir = temp_dir.path().to_path_buf();
    let content = format!(
        "{}\n{}\n{}",
        r#"{"type":"system"}"#,
        r#"{"type":"message"}"#,
        r#"{"type":"other"}"#
    );
    create_test_session_file(&project_dir, "session1.jsonl", &content).unwrap();
    let result = project::get_project_path_from_sessions(&project_dir);
    assert!(result.is_err());
}

#[test]
fn test_get_project_path_from_sessions_multiple_sessions() {
    let temp_dir = TempDir::new().unwrap();
    let project_dir = temp_dir.path().to_path_buf();
    create_test_session_file(
        &project_dir,
        "session1.jsonl",
        r#"{"type":"system","cwd":"/path1"}"#,
    )
    .unwrap();
    create_test_session_file(
        &project_dir,
        "session2.jsonl",
        r#"{"type":"system","cwd":"/path2"}"#,
    )
    .unwrap();
    let result = project::get_project_path_from_sessions(&project_dir);
    assert!(result.is_ok());
    let path = result.unwrap();
    assert!(path == "/path1" || path == "/path2");
}

#[test]
fn test_guard_path_within_home_allows_home_subdir() {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let path = PathBuf::from(&home);
    assert!(guard_path_within_home(&path).is_ok());
}

#[test]
fn test_guard_path_within_home_rejects_traversal() {
    let path2 = PathBuf::from("/etc/passwd");
    assert!(guard_path_within_home(&path2).is_err());
}

#[test]
fn test_guard_path_within_home_rejects_root() {
    let path = PathBuf::from("/");
    assert!(guard_path_within_home(&path).is_err());
}

#[test]
fn test_guard_path_within_home_rejects_empty() {
    let path = PathBuf::from("");
    assert!(guard_path_within_home(&path).is_err());
}

// ─── decode_project_path tests ───────────────────────────────────────────────

#[test]
fn test_decode_project_path() {
    assert_eq!(
        project::decode_project_path("-home-user-project"),
        "/home/user/project"
    );
    assert_eq!(
        project::decode_project_path("-home-user-GitHub-runecode"),
        "/home/user/GitHub/runecode"
    );
}

#[test]
fn test_decode_project_path_empty() {
    assert_eq!(project::decode_project_path(""), "");
}

#[test]
fn test_decode_project_path_no_hyphens() {
    assert_eq!(project::decode_project_path("simple"), "simple");
}

// ─── validate_path_component tests ───────────────────────────────────────────

#[test]
fn test_validate_path_component_valid() {
    assert!(validate_path_component("valid-name", "test").is_ok());
    assert!(validate_path_component("abc123", "test").is_ok());
    assert!(validate_path_component("a", "test").is_ok());
}

#[test]
fn test_validate_path_component_empty() {
    assert!(validate_path_component("", "test").is_err());
}

#[test]
fn test_validate_path_component_traversal() {
    assert!(validate_path_component("../traversal", "test").is_err());
    assert!(validate_path_component("..%2f", "test").is_err());
    assert!(validate_path_component("..", "test").is_err());
}

#[test]
fn test_validate_path_component_slashes() {
    assert!(validate_path_component("path/slash", "test").is_err());
    assert!(validate_path_component("back\\slash", "test").is_err());
}

#[test]
fn test_validate_path_component_null_byte() {
    assert!(validate_path_component("null\0byte", "test").is_err());
}
