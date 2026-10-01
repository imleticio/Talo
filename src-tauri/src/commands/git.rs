use crate::errors::{AppError, AppResult};
use std::path::Path;
use std::process::Command;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Repository {
    pub(crate) path: String,
    pub(crate) branch: Option<String>,
    pub(crate) revision: String,
    branches: Vec<String>,
}

pub(super) fn git(path: &str, args: &[&str]) -> Result<String, String> {
    git_raw(path, args).map(|output| output.trim().to_owned())
}

fn git_raw(path: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(path)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|error| format!("Could not run Git: {error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
    }
    String::from_utf8(output.stdout).map_err(|_| "Git returned a non-UTF-8 path or message.".into())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkingFile {
    path: String,
    original_path: Option<String>,
    index: char,
    worktree: char,
    conflicted: bool,
}

#[derive(serde::Serialize)]
pub struct GitCommit {
    hash: String,
    message: String,
    author: String,
    date: String,
    parents: Vec<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWorkspace {
    branch: Option<String>,
    files: Vec<WorkingFile>,
    commits: Vec<GitCommit>,
    ahead: Option<u64>,
    behind: Option<u64>,
    commit_block_reason: Option<String>,
}

fn git_error(message: String) -> AppError {
    AppError::new("git", message)
}

fn workspace_root(path: &str) -> AppResult<String> {
    if path.trim().is_empty() {
        return Err(AppError::new("validation", "Choose a repository first."));
    }
    if !Path::new(path).is_dir() {
        return Err(AppError::new(
            "validation",
            "The repository folder is no longer available.",
        ));
    }
    git(path, &["rev-parse", "--show-toplevel"]).map_err(|_| {
        AppError::new(
            "validation",
            "The selected folder is not a working Git repository.",
        )
    })
}

fn working_files(root: &str) -> AppResult<Vec<WorkingFile>> {
    let output = git_raw(
        root,
        &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    )
    .map_err(git_error)?;
    let mut records = output.split('\0').filter(|record| !record.is_empty());
    let mut files = Vec::new();
    while let Some(record) = records.next() {
        let status = record.as_bytes();
        if status.len() < 4 {
            return Err(AppError::new("git", "Git returned an invalid file status."));
        }
        let index = status[0] as char;
        let worktree = status[1] as char;
        let original_path = if matches!(index, 'R' | 'C') || matches!(worktree, 'R' | 'C') {
            Some(
                records
                    .next()
                    .ok_or_else(|| AppError::new("git", "Git returned an incomplete rename."))?
                    .to_owned(),
            )
        } else {
            None
        };
        files.push(WorkingFile {
            path: record[3..].to_owned(),
            original_path,
            index,
            worktree,
            conflicted: index == 'U' || worktree == 'U' || matches!(&record[..2], "AA" | "DD"),
        });
    }
    Ok(files)
}

pub(super) fn recent_commits(root: &str) -> AppResult<Vec<GitCommit>> {
    if git(root, &["rev-parse", "--verify", "HEAD"]).is_err() {
        return Ok(Vec::new());
    }
    let output = git_raw(
        root,
        &[
            "log",
            "-30",
            "-z",
            "--format=%H%x1f%s%x1f%an%x1f%cI%x1f%P",
            "HEAD",
        ],
    )
    .map_err(git_error)?;
    output
        .split('\0')
        .filter(|record| !record.is_empty())
        .map(|record| {
            let fields: Vec<_> = record.splitn(5, '\u{1f}').collect();
            if fields.len() != 5 {
                return Err(AppError::new("git", "Git returned an invalid commit."));
            }
            Ok(GitCommit {
                hash: fields[0].into(),
                message: fields[1].into(),
                author: fields[2].into(),
                date: fields[3].into(),
                parents: fields[4].split_whitespace().map(str::to_owned).collect(),
            })
        })
        .collect()
}

fn commit_block_reason(root: &str, files: &[WorkingFile]) -> Option<String> {
    if files.iter().any(|file| file.conflicted) {
        return Some("Resolve file conflicts before committing.".into());
    }
    for state in [
        "MERGE_HEAD",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
        "rebase-merge",
        "rebase-apply",
    ] {
        if let Ok(path) = git(root, &["rev-parse", "--git-path", state]) {
            if Path::new(root).join(path).exists() {
                return Some(
                    "Finish the current merge, rebase, or cherry-pick before committing in Talo."
                        .into(),
                );
            }
        }
    }
    None
}

fn workspace(path: &str) -> AppResult<GitWorkspace> {
    let root = workspace_root(path)?;
    let files = working_files(&root)?;
    let counts = git(
        &root,
        &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
    )
    .ok();
    let mut counts = counts.as_deref().unwrap_or("").split_whitespace();
    Ok(GitWorkspace {
        branch: git(&root, &["symbolic-ref", "--quiet", "--short", "HEAD"]).ok(),
        commits: recent_commits(&root)?,
        ahead: counts.next().and_then(|count| count.parse().ok()),
        behind: counts.next().and_then(|count| count.parse().ok()),
        commit_block_reason: commit_block_reason(&root, &files),
        files,
    })
}

fn selected_paths(root: &str, file: Option<&str>, stage: bool) -> AppResult<Vec<String>> {
    let Some(path) = file else {
        return Ok(vec![".".into()]);
    };
    let files = working_files(root)?;
    let file = files.iter().find(|file| file.path == path).ok_or_else(|| {
        AppError::new(
            "validation",
            "This file is no longer in the working tree changes. Refresh and try again.",
        )
    })?;
    let mut paths = vec![file.path.clone()];
    if let Some(original) = file
        .original_path
        .as_ref()
        .filter(|_| !stage || matches!(file.worktree, 'R' | 'C'))
    {
        paths.push(original.clone());
    }
    if paths.iter().any(|path| {
        Path::new(path).is_absolute()
            || Path::new(path)
                .components()
                .any(|part| matches!(part, std::path::Component::ParentDir))
    }) {
        return Err(AppError::new(
            "validation",
            "Choose a file inside the selected repository.",
        ));
    }
    Ok(paths
        .into_iter()
        .map(|path| format!(":(literal){path}"))
        .collect())
}

fn change_staging(path: &str, file: Option<&str>, stage: bool) -> AppResult<GitWorkspace> {
    let root = workspace_root(path)?;
    let paths = selected_paths(&root, file, stage)?;
    let has_head = git(&root, &["rev-parse", "--verify", "HEAD"]).is_ok();
    let mut args = if stage {
        vec!["add", "--all", "--"]
    } else if has_head {
        vec!["restore", "--staged", "--"]
    } else {
        vec!["rm", "--cached", "-r", "-f", "--ignore-unmatch", "--"]
    };
    args.extend(paths.iter().map(String::as_str));
    git(&root, &args).map_err(git_error)?;
    workspace(&root)
}

fn create_commit(path: &str, message: &str) -> AppResult<String> {
    let root = workspace_root(path)?;
    if message.trim().is_empty() || message.contains('\0') {
        return Err(AppError::new("validation", "Enter a commit message."));
    }
    let files = working_files(&root)?;
    if let Some(reason) = commit_block_reason(&root, &files) {
        return Err(AppError::new("validation", reason));
    }
    if !files
        .iter()
        .any(|file| file.index != ' ' && file.index != '?')
    {
        return Err(AppError::new(
            "validation",
            "Stage at least one file before committing.",
        ));
    }
    git(&root, &["commit", "-m", message]).map_err(git_error)?;
    git(&root, &["rev-parse", "HEAD"]).map_err(git_error)
}

static GIT_MUTATION: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[tauri::command]
pub async fn git_workspace(path: String) -> AppResult<GitWorkspace> {
    tauri::async_runtime::spawn_blocking(move || workspace(&path))
        .await
        .map_err(|error| git_error(error.to_string()))?
}

#[tauri::command]
pub async fn git_stage(path: String, file: Option<String>) -> AppResult<GitWorkspace> {
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = GIT_MUTATION
            .lock()
            .map_err(|_| AppError::new("git", "Git operation lock unavailable."))?;
        change_staging(&path, file.as_deref(), true)
    })
    .await
    .map_err(|error| git_error(error.to_string()))?
}

#[tauri::command]
pub async fn git_unstage(path: String, file: Option<String>) -> AppResult<GitWorkspace> {
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = GIT_MUTATION
            .lock()
            .map_err(|_| AppError::new("git", "Git operation lock unavailable."))?;
        change_staging(&path, file.as_deref(), false)
    })
    .await
    .map_err(|error| git_error(error.to_string()))?
}

#[tauri::command]
pub async fn git_create_commit(path: String, message: String) -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = GIT_MUTATION
            .lock()
            .map_err(|_| AppError::new("git", "Git operation lock unavailable."))?;
        create_commit(&path, &message)
    })
    .await
    .map_err(|error| git_error(error.to_string()))?
}

fn repository(path: &str) -> Result<Repository, String> {
    if !Path::new(path).is_dir() {
        return Err("The repository folder is no longer available.".into());
    }
    let root = git(path, &["rev-parse", "--show-toplevel"])?;
    let branch = git(&root, &["symbolic-ref", "--quiet", "--short", "HEAD"]).ok();
    let revision = git(&root, &["rev-parse", "--short", "HEAD"]).unwrap_or_default();
    let branches = git(
        &root,
        &["for-each-ref", "--format=%(refname:short)", "refs/heads/"],
    )?
    .lines()
    .map(str::to_owned)
    .collect();
    Ok(Repository {
        path: root,
        branch,
        revision,
        branches,
    })
}

#[tauri::command]
pub async fn git_repository(path: String) -> Result<Repository, String> {
    tauri::async_runtime::spawn_blocking(move || repository(&path))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn git_switch_branch(path: String, branch: String) -> Result<Repository, String> {
    tauri::async_runtime::spawn_blocking(move || switch_branch(&path, &branch))
        .await
        .map_err(|error| error.to_string())?
}

fn switch_branch(path: &str, branch: &str) -> Result<Repository, String> {
    let current = repository(path)?;
    if !current.branches.iter().any(|name| name == branch) {
        return Err("Choose an existing local branch.".into());
    }
    git(&current.path, &["switch", "--no-guess", "--", branch])?;
    repository(&current.path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> tempfile::TempDir {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().to_str().unwrap();
        git(path, &["init", "-b", "main"]).unwrap();
        git(path, &["config", "user.name", "Talo Test"]).unwrap();
        git(path, &["config", "user.email", "test@example.com"]).unwrap();
        git(path, &["config", "commit.gpgsign", "false"]).unwrap();
        folder
    }

    #[test]
    fn stages_literal_paths_unstages_unborn_and_commits_only_the_index() {
        let folder = fixture();
        let path = folder.path().to_str().unwrap();
        let file = "-literal [file]\nname.txt";
        std::fs::write(folder.path().join(file), "first").unwrap();
        std::fs::write(folder.path().join("other.txt"), "leave unstaged").unwrap();
        assert_eq!(workspace(path).unwrap().files.len(), 2);
        assert!(create_commit(path, "nothing staged").is_err());
        assert!(change_staging(path, Some("../outside"), true).is_err());
        assert!(change_staging(path, Some(":(glob)*"), true).is_err());
        let staged = change_staging(path, Some(file), true).unwrap();
        assert_eq!(
            staged.files.iter().filter(|file| file.index == 'A').count(),
            1
        );
        std::fs::write(folder.path().join(file), "edited after staging").unwrap();
        change_staging(path, Some(file), false).unwrap();
        assert_eq!(
            std::fs::read_to_string(folder.path().join(file)).unwrap(),
            "edited after staging"
        );
        change_staging(path, Some(file), true).unwrap();
        let message = "fix PR merge; $(touch injected)";
        create_commit(path, message).unwrap();
        let current = workspace(path).unwrap();
        assert_eq!(current.commits[0].message, message);
        assert_eq!(current.commits[0].parents.len(), 0);
        assert_eq!(current.files.len(), 1);
        assert_eq!(current.files[0].path, "other.txt");
        assert!(!folder.path().join("injected").exists());
        std::fs::write(folder.path().join(file), "modified").unwrap();
        change_staging(path, None, true).unwrap();
        change_staging(path, None, false).unwrap();
        assert!(
            workspace(path)
                .unwrap()
                .files
                .iter()
                .all(|file| matches!(file.index, ' ' | '?'))
        );
    }

    #[test]
    fn tracks_partial_staging_and_renames_and_blocks_in_progress_operations() {
        let folder = fixture();
        let path = folder.path().to_str().unwrap();
        std::fs::write(folder.path().join("old.txt"), "initial").unwrap();
        change_staging(path, None, true).unwrap();
        create_commit(path, "initial").unwrap();
        std::fs::write(folder.path().join("old.txt"), "staged").unwrap();
        change_staging(path, Some("old.txt"), true).unwrap();
        std::fs::write(folder.path().join("old.txt"), "unstaged").unwrap();
        let partial = workspace(path).unwrap();
        assert_eq!(
            (partial.files[0].index, partial.files[0].worktree),
            ('M', 'M')
        );
        create_commit(path, "only staged contents").unwrap();
        assert_eq!(git(path, &["show", "HEAD:old.txt"]).unwrap(), "staged");
        git(path, &["restore", "--", "old.txt"]).unwrap();
        git(path, &["mv", "old.txt", "new.txt"]).unwrap();
        let renamed = workspace(path).unwrap();
        assert_eq!(renamed.files[0].original_path.as_deref(), Some("old.txt"));
        change_staging(path, Some("new.txt"), false).unwrap();
        assert!(folder.path().join("new.txt").exists());
        change_staging(path, None, true).unwrap();
        std::fs::write(folder.path().join("new.txt"), "edited renamed file").unwrap();
        change_staging(path, Some("new.txt"), true).unwrap();
        change_staging(path, None, true).unwrap();
        std::fs::write(folder.path().join(".git/MERGE_HEAD"), "pending").unwrap();
        assert!(workspace(path).unwrap().commit_block_reason.is_some());
        assert!(create_commit(path, "blocked").is_err());
        assert!(workspace("").is_err());
        assert!(workspace(folder.path().parent().unwrap().to_str().unwrap()).is_err());
    }

    #[test]
    fn merge_type_comes_from_parent_count_not_message() {
        let folder = fixture();
        let path = folder.path().to_str().unwrap();
        std::fs::write(folder.path().join("initial"), "initial").unwrap();
        change_staging(path, None, true).unwrap();
        create_commit(path, "Merge pull request (not actually a merge)").unwrap();
        git(path, &["switch", "-c", "feature"]).unwrap();
        std::fs::write(folder.path().join("feature"), "feature").unwrap();
        change_staging(path, None, true).unwrap();
        create_commit(path, "feature").unwrap();
        git(path, &["switch", "main"]).unwrap();
        git(path, &["merge", "--no-ff", "feature", "-m", "integration"]).unwrap();
        let history = recent_commits(path).unwrap();
        assert_eq!(history[0].parents.len(), 2);
        assert_eq!(history[0].message, "integration");
        assert_eq!(
            history
                .iter()
                .find(|commit| commit.message == "Merge pull request (not actually a merge)")
                .unwrap()
                .parents
                .len(),
            0
        );
    }

    #[test]
    fn reads_and_switches_branches_without_overwriting_changes() {
        let folder = std::env::temp_dir().join(format!("talo-git-test-{}", std::process::id()));
        std::fs::create_dir_all(&folder).unwrap();
        struct Cleanup(std::path::PathBuf);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
        let _cleanup = Cleanup(folder.clone());
        let path = folder.to_str().unwrap();
        assert!(repository(path).is_err());
        git(path, &["init", "-b", "main"]).unwrap();
        assert_eq!(repository(path).unwrap().branch.as_deref(), Some("main"));
        std::fs::write(folder.join("file.txt"), "main").unwrap();
        git(path, &["add", "file.txt"]).unwrap();
        let commit = [
            "-c",
            "user.name=Talo Test",
            "-c",
            "user.email=test@example.com",
            "-c",
            "commit.gpgsign=false",
            "commit",
            "-m",
            "fixture",
        ];
        git(path, &commit).unwrap();
        git(path, &["branch", "feature/test"]).unwrap();
        assert_eq!(
            switch_branch(path, "feature/test")
                .unwrap()
                .branch
                .as_deref(),
            Some("feature/test")
        );
        std::fs::write(folder.join("file.txt"), "feature").unwrap();
        git(path, &["add", "file.txt"]).unwrap();
        git(path, &commit).unwrap();
        switch_branch(path, "main").unwrap();
        std::fs::write(folder.join("file.txt"), "unsaved work").unwrap();
        assert!(switch_branch(path, "feature/test").is_err());
        assert_eq!(
            std::fs::read_to_string(folder.join("file.txt")).unwrap(),
            "unsaved work"
        );
        assert_eq!(repository(path).unwrap().branch.as_deref(), Some("main"));
        assert!(switch_branch(path, "--discard-changes").is_err());
        git(path, &["checkout", "--", "file.txt"]).unwrap();
        git(path, &["checkout", "--detach", "HEAD"]).unwrap();
        assert!(repository(path).unwrap().branch.is_none());
    }
}
