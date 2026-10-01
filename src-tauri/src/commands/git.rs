use std::path::Path;
use std::process::Command;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Repository {
    path: String,
    branch: Option<String>,
    revision: String,
    branches: Vec<String>,
}

fn git(path: &str, args: &[&str]) -> Result<String, String> {
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
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_owned())
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
