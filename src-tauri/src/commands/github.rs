use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::process::Command;

use super::git::{git, recent_commits};
use crate::errors::{AppError, AppResult};

const PR_FIELDS: &str = "number,title,state,isDraft,baseRefName,headRefName,headRefOid,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,isCrossRepository";
const ACTIVITY_PR_FIELDS: &str = "number,title,isDraft,headRefName,baseRefName,reviewDecision,state,createdAt,closedAt,mergedAt,mergeCommit,author,mergedBy";

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequest {
    number: u64,
    title: String,
    state: String,
    is_draft: bool,
    base_ref_name: String,
    head_ref_name: String,
    head_ref_oid: String,
    mergeable: String,
    merge_state_status: String,
    review_decision: String,
    status_check_rollup: Option<Vec<Value>>,
    is_cross_repository: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryInfo {
    name_with_owner: String,
    merge_commit_allowed: bool,
    squash_merge_allowed: bool,
    rebase_merge_allowed: bool,
    viewer_permission: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubStatus {
    repository: String,
    branch: String,
    pull_request: Option<PullRequest>,
    merge_methods: Vec<String>,
    can_merge: bool,
    merge_block_reason: Option<String>,
}

async fn gh(args: &[&str]) -> AppResult<Value> {
    run_gh(std::ffi::OsStr::new("gh"), args).await
}

async fn run_gh(executable: &std::ffi::OsStr, args: &[&str]) -> AppResult<Value> {
    let output = run_gh_output(executable, args, None).await?;
    if output.is_empty() {
        return Ok(Value::Null);
    }
    serde_json::from_slice(&output)
        .map_err(|_| AppError::new("github", "GitHub returned an unexpected response."))
}

async fn run_gh_output(
    executable: &std::ffi::OsStr,
    args: &[&str],
    path: Option<&str>,
) -> AppResult<Vec<u8>> {
    let mut command = Command::new(executable);
    if let Some(path) = path {
        command.current_dir(path);
    }
    command
        .args(args)
        .env("GH_HOST", "github.com")
        .env("GH_PROMPT_DISABLED", "1")
        .env("GH_PAGER", "cat")
        .kill_on_drop(true);
    let output = tokio::time::timeout(Duration::from_secs(30), command.output())
        .await
        .map_err(|_| {
            AppError::new(
                "timeout",
                "GitHub did not respond in time. Refresh the panel to check the current PR state.",
            )
        })?
        .map_err(|error| {
            AppError::new(
                "not_installed",
                format!("GitHub CLI is unavailable. Install gh and run gh auth login. {error}"),
            )
        })?;
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        return Err(AppError::new(
            if output.status.code() == Some(4) {
                "authentication"
            } else {
                "github"
            },
            if message.is_empty() {
                "GitHub request failed.".into()
            } else {
                message
            },
        ));
    }
    Ok(output.stdout)
}

fn github_remote(url: &str) -> AppResult<String> {
    let path = url
        .trim()
        .strip_prefix("https://github.com/")
        .or_else(|| url.trim().strip_prefix("git@github.com:"))
        .or_else(|| url.trim().strip_prefix("ssh://git@github.com/"))
        .ok_or_else(|| {
            AppError::new(
                "validation",
                "The origin remote is not a github.com repository.",
            )
        })?;
    let name = path.trim_end_matches('/').trim_end_matches(".git");
    let parts: Vec<_> = name.split('/').collect();
    if parts.len() != 2
        || parts.iter().any(|part| {
            part.is_empty()
                || *part == "."
                || *part == ".."
                || !part
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || b"-_.".contains(&c))
        })
    {
        return Err(AppError::new(
            "validation",
            "The GitHub remote address is invalid.",
        ));
    }
    Ok(name.to_owned())
}

async fn context(path: String) -> AppResult<(String, String)> {
    tauri::async_runtime::spawn_blocking(move || {
        let remote = git(&path, &["remote", "get-url", "origin"]).map_err(|_| {
            AppError::new(
                "validation",
                "Choose a Git repository with a GitHub origin remote.",
            )
        })?;
        let branch = git(&path, &["symbolic-ref", "--quiet", "--short", "HEAD"]).map_err(|_| {
            AppError::new("validation", "Check out a branch to see its pull request.")
        })?;
        Ok((github_remote(&remote)?, branch))
    })
    .await
    .map_err(|error| AppError::new("github", error.to_string()))?
}

fn decode<T: serde::de::DeserializeOwned>(value: Value) -> AppResult<T> {
    serde_json::from_value(value)
        .map_err(|_| AppError::new("github", "GitHub returned incomplete pull request data."))
}

fn methods(info: &RepositoryInfo) -> Vec<String> {
    [
        ("squash", info.squash_merge_allowed),
        ("merge", info.merge_commit_allowed),
        ("rebase", info.rebase_merge_allowed),
    ]
    .into_iter()
    .filter(|(_, allowed)| *allowed)
    .map(|(method, _)| method.to_owned())
    .collect()
}

fn block_reason(pr: &PullRequest, permission: &str) -> Option<String> {
    let reason = if pr.state != "OPEN" {
        "This pull request is no longer open."
    } else if pr.is_draft {
        "This pull request is a draft."
    } else if !matches!(permission, "WRITE" | "MAINTAIN" | "ADMIN") {
        "Your GitHub account does not have merge permission."
    } else if pr.review_decision == "CHANGES_REQUESTED" {
        "A reviewer has requested changes."
    } else if pr.review_decision == "REVIEW_REQUIRED" {
        "Required reviews are still pending."
    } else if pr.mergeable != "MERGEABLE" || pr.merge_state_status != "CLEAN" {
        "GitHub is checking mergeability, or checks, conflicts or branch rules are blocking the merge."
    } else {
        return None;
    };
    Some(reason.into())
}

fn matches_target(pr: &PullRequest, branch: &str, number: Option<u64>) -> bool {
    number.map_or(
        !pr.is_cross_repository && pr.head_ref_name == branch,
        |number| pr.number == number,
    )
}

async fn status(path: String, number: Option<u64>) -> AppResult<GitHubStatus> {
    let (repository, branch) = context(path).await?;
    let info: RepositoryInfo = decode(gh(&["repo", "view", &format!("github.com/{repository}"), "--json", "nameWithOwner,mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed,viewerPermission"]).await?)?;
    let prs: Vec<PullRequest> = if let Some(number) = number {
        vec![decode(
            gh(&[
                "pr",
                "view",
                &number.to_string(),
                "--repo",
                &format!("github.com/{repository}"),
                "--json",
                PR_FIELDS,
            ])
            .await?,
        )?]
    } else {
        decode(
            gh(&[
                "pr",
                "list",
                "--repo",
                &format!("github.com/{repository}"),
                "--head",
                &branch,
                "--state",
                "all",
                "--limit",
                "30",
                "--json",
                PR_FIELDS,
            ])
            .await?,
        )?
    };
    // Branch lookup excludes forks; an explicitly selected PR is identified by number.
    let mut matching: Vec<_> = prs
        .into_iter()
        .filter(|pr| matches_target(pr, &branch, number))
        .collect();
    matching.sort_by_key(|pr| pr.state != "OPEN");
    let pull_request = matching.into_iter().next();
    let merge_methods = methods(&info);
    let merge_block_reason = pull_request
        .as_ref()
        .and_then(|pr| block_reason(pr, &info.viewer_permission));
    let can_merge =
        pull_request.is_some() && merge_block_reason.is_none() && !merge_methods.is_empty();
    Ok(GitHubStatus {
        repository: info.name_with_owner,
        branch,
        pull_request,
        merge_methods,
        can_merge,
        merge_block_reason,
    })
}

#[tauri::command]
pub async fn github_pr_status(path: String, number: Option<u64>) -> AppResult<GitHubStatus> {
    status(path, number).await
}

#[tauri::command]
pub async fn github_repository(path: String) -> AppResult<Value> {
    let (repository, branch) = context(path.clone()).await?;
    let repo = format!("github.com/{repository}");
    let (info, prs, issues, recent_prs) = tokio::try_join!(
        async {
            gh(&[
                "repo",
                "view",
                &repo,
                "--json",
                "nameWithOwner,description,defaultBranchRef,isPrivate",
            ])
            .await
        },
        async {
            gh(&[
                "pr",
                "list",
                "--repo",
                &repo,
                "--state",
                "open",
                "--limit",
                "100",
                "--json",
                ACTIVITY_PR_FIELDS,
            ])
            .await
        },
        async {
            gh(&[
                "issue",
                "list",
                "--repo",
                &repo,
                "--state",
                "open",
                "--limit",
                "100",
                "--json",
                "number,title,body,labels,author",
            ])
            .await
        },
        async {
            Ok::<_, AppError>(
                gh(&[
                    "pr",
                    "list",
                    "--repo",
                    &repo,
                    "--state",
                    "all",
                    "--search",
                    "is:closed sort:updated-desc",
                    "--limit",
                    "30",
                    "--json",
                    ACTIVITY_PR_FIELDS,
                ])
                .await,
            )
        }
    )?;
    let base = info["defaultBranchRef"]["name"]
        .as_str()
        .unwrap_or("")
        .to_owned();
    let branch_for_git = branch.clone();
    let (commits, published, activity) = tauri::async_runtime::spawn_blocking(move || {
        let activity = branch_activity(&path, if base.is_empty() { None } else { Some(&base) });
        if base.is_empty() || base == branch_for_git {
            return (Vec::new(), false, activity);
        }
        let published = git(
            &path,
            &[
                "rev-parse",
                "--verify",
                &format!("refs/remotes/origin/{branch_for_git}"),
            ],
        )
        .ok()
            == git(&path, &["rev-parse", "HEAD"]).ok();
        let log = git(
            &path,
            &[
                "log",
                "--format=%h%x09%s",
                "--max-count=30",
                &format!("refs/remotes/origin/{base}..HEAD"),
            ],
        );
        let commits: Vec<Value> = log
            .unwrap_or_default()
            .lines()
            .filter_map(|line| {
                let (sha, title) = line.split_once('\t')?;
                Some(serde_json::json!({"sha": sha, "title": title}))
            })
            .collect();
        (commits, published, activity)
    })
    .await
    .map_err(|error| AppError::new("github", error.to_string()))?;
    let (recent_prs, activity_error) = match recent_prs {
        Ok(prs) => (prs, None),
        Err(error) => (Value::Array(Vec::new()), Some(error.message)),
    };
    let mut activity_prs: Vec<Value> = prs
        .as_array()
        .into_iter()
        .flatten()
        .take(30)
        .cloned()
        .collect();
    activity_prs.extend(recent_prs.as_array().cloned().unwrap_or_default());
    Ok(
        serde_json::json!({"info": info, "branch": branch, "pullRequests": prs, "issues": issues, "commits": commits, "published": published, "activity": activity, "activityPullRequests": activity_prs, "activityError": activity_error}),
    )
}

#[tauri::command]
pub async fn github_create_pr(path: String, title: String, body: String) -> AppResult<Value> {
    let (repository, branch) = context(path.clone()).await?;
    let info = gh(&[
        "repo",
        "view",
        &format!("github.com/{repository}"),
        "--json",
        "defaultBranchRef",
    ])
    .await?;
    let base = info["defaultBranchRef"]["name"]
        .as_str()
        .ok_or_else(|| AppError::new("github", "The repository has no default branch."))?
        .to_owned();
    if title.trim().is_empty() || title.len() > 256 || body.len() > 65536 || branch == base {
        return Err(AppError::new(
            "validation",
            "Enter a title and select a feature branch.",
        ));
    }
    let head = branch.clone();
    let git_base = base.clone();
    let git_path = path.clone();
    let has_commits = tauri::async_runtime::spawn_blocking(move || -> AppResult<bool> {
        let local = git(&git_path, &["rev-parse", "HEAD"])
            .map_err(|message| AppError::new("git", message))?;
        let remote = git(
            &git_path,
            &[
                "rev-parse",
                "--verify",
                &format!("refs/remotes/origin/{head}"),
            ],
        )
        .map_err(|_| {
            AppError::new(
                "validation",
                "Push this branch to origin before creating a pull request.",
            )
        })?;
        if local != remote {
            return Err(AppError::new(
                "validation",
                "Push your latest commits to origin before creating a pull request.",
            ));
        }
        let count = git(
            &git_path,
            &[
                "rev-list",
                "--count",
                &format!("refs/remotes/origin/{git_base}..HEAD"),
            ],
        )
        .map_err(|_| {
            AppError::new(
                "validation",
                "Fetch origin to compare this branch with the default branch.",
            )
        })?;
        Ok(count.parse::<u64>().unwrap_or(0) > 0)
    })
    .await
    .map_err(|error| AppError::new("git", error.to_string()))??;
    if !has_commits {
        return Err(AppError::new(
            "validation",
            "There are no commits to propose against the default branch.",
        ));
    }
    if status(path, None)
        .await?
        .pull_request
        .as_ref()
        .is_some_and(|pr| pr.state == "OPEN")
    {
        return Err(AppError::new(
            "validation",
            "This branch already has a pull request.",
        ));
    }
    gh(&[
        "api",
        "--hostname",
        "github.com",
        "--method",
        "POST",
        &format!("repos/{repository}/pulls"),
        "--raw-field",
        &format!("title={}", title.trim()),
        "--raw-field",
        &format!("body={body}"),
        "--raw-field",
        &format!("head={branch}"),
        "--raw-field",
        &format!("base={base}"),
    ])
    .await
}

fn branch_activity(path: &str, base: Option<&str>) -> Value {
    let base_ref = base.and_then(|name| {
        [
            format!("refs/remotes/origin/{name}"),
            format!("refs/heads/{name}"),
        ]
        .into_iter()
        .find(|reference| git(path, &["rev-parse", "--verify", reference]).is_ok())
    });
    let range = base_ref
        .as_ref()
        .map(|reference| format!("{reference}..HEAD"));
    let ahead = range.as_ref().and_then(|range| {
        git(path, &["rev-list", "--count", range])
            .ok()?
            .parse::<u64>()
            .ok()
    });
    let history = recent_commits(path);
    let error = history.as_ref().err().map(|error| error.message.clone());
    serde_json::json!({"ahead": ahead, "commits": history.unwrap_or_default(), "error": error})
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeResult {
    merged: bool,
    message: String,
}

fn validate_merge(
    current: &GitHubStatus,
    repository: &str,
    number: u64,
    head_oid: &str,
    method: &str,
) -> AppResult<()> {
    let pr = current
        .pull_request
        .as_ref()
        .ok_or_else(|| AppError::new("validation", "This branch has no pull request."))?;
    if current.repository != repository || pr.number != number || pr.head_ref_oid != head_oid {
        return Err(AppError::new(
            "validation",
            "The repository or PR changed. Refresh before merging.",
        ));
    }
    if !current.can_merge
        || !current
            .merge_methods
            .iter()
            .any(|allowed| allowed == method)
    {
        return Err(AppError::new(
            "validation",
            current
                .merge_block_reason
                .as_deref()
                .unwrap_or("This merge method is not available."),
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn github_merge_pr(
    path: String,
    repository: String,
    number: u64,
    head_oid: String,
    method: String,
) -> AppResult<MergeResult> {
    let current = status(path, Some(number)).await?;
    validate_merge(&current, &repository, number, &head_oid, &method)?;
    let value = gh(&[
        "api",
        "--hostname",
        "github.com",
        "--method",
        "PUT",
        &format!("repos/{repository}/pulls/{number}/merge"),
        "--raw-field",
        &format!("sha={head_oid}"),
        "--raw-field",
        &format!("merge_method={method}"),
    ])
    .await?;
    let merged = value
        .get("merged")
        .and_then(Value::as_bool)
        .ok_or_else(|| {
            AppError::new(
                "github",
                "The merge result is unknown. Refresh before retrying.",
            )
        })?;
    Ok(MergeResult {
        merged,
        message: value
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("Refresh to see the current PR state.")
            .into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ready() -> GitHubStatus {
        let pr = decode(serde_json::json!({"number": 7, "title": "Feature", "state": "OPEN", "isDraft": false, "baseRefName": "main", "headRefName": "feature", "headRefOid": "abc123", "mergeable": "MERGEABLE", "mergeStateStatus": "CLEAN", "reviewDecision": "APPROVED", "statusCheckRollup": [], "isCrossRepository": false})).unwrap();
        GitHubStatus {
            repository: "owner/repo".into(),
            branch: "feature".into(),
            pull_request: Some(pr),
            merge_methods: vec!["squash".into()],
            can_merge: true,
            merge_block_reason: None,
        }
    }

    #[test]
    fn explicit_selection_supports_other_branches_and_forks_without_ambiguous_branch_lookup() {
        let mut current = ready();
        let pr = current.pull_request.as_mut().unwrap();
        assert!(matches_target(pr, "feature", None));
        assert!(!matches_target(pr, "main", None));
        assert!(matches_target(pr, "main", Some(7)));
        assert!(!matches_target(pr, "main", Some(8)));
        pr.is_cross_repository = true;
        assert!(!matches_target(pr, "feature", None));
        assert!(matches_target(pr, "main", Some(7)));
    }

    #[test]
    fn accepts_github_remotes_and_rejects_other_hosts_and_paths() {
        for url in [
            "https://github.com/owner/repo.git",
            "git@github.com:owner/repo.git",
            "ssh://git@github.com/owner/repo",
        ] {
            assert_eq!(github_remote(url).unwrap(), "owner/repo");
        }
        for url in [
            "https://github.com.evil.test/owner/repo",
            "https://gitlab.com/owner/repo",
            "https://github.com/owner/repo/extra",
            "git@github.com:../repo",
            "https://github.com/owner/repo?x=1",
        ] {
            assert!(github_remote(url).is_err());
        }
    }

    #[test]
    fn activity_reads_real_history_and_handles_missing_base() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().to_str().unwrap();
        git(path, &["init", "-b", "main"]).unwrap();
        let commit = [
            "-c",
            "user.name=Activity Author",
            "-c",
            "user.email=activity@example.com",
            "-c",
            "commit.gpgsign=false",
            "commit",
            "--allow-empty",
            "-m",
            "Initial commit",
        ];
        git(path, &commit).unwrap();
        git(path, &["switch", "-c", "feature/activity"]).unwrap();
        git(path, &commit).unwrap();
        let activity = branch_activity(path, Some("main"));
        assert_eq!(activity["ahead"], 1);
        assert_eq!(activity["commits"].as_array().unwrap().len(), 2);
        assert_eq!(activity["commits"][0]["author"], "Activity Author");
        assert_eq!(activity["commits"][0]["message"], "Initial commit");
        assert_eq!(activity["commits"][0]["hash"].as_str().unwrap().len(), 40);
        assert!(activity["error"].is_null());
        assert!(branch_activity(path, Some("missing"))["ahead"].is_null());
        git(path, &["update-ref", "refs/remotes/origin/main", "HEAD"]).unwrap();
        assert_eq!(branch_activity(path, Some("main"))["ahead"], 0);
    }

    #[test]
    fn merge_is_bound_to_the_displayed_repository_pr_commit_and_method() {
        let current = ready();
        assert!(validate_merge(&current, "owner/repo", 7, "abc123", "squash").is_ok());
        for (repo, number, sha, method) in [
            ("other/repo", 7, "abc123", "squash"),
            ("owner/repo", 8, "abc123", "squash"),
            ("owner/repo", 7, "new-commit", "squash"),
            ("owner/repo", 7, "abc123", "rebase"),
        ] {
            assert!(validate_merge(&current, repo, number, sha, method).is_err());
        }
    }

    #[test]
    fn drafts_closed_prs_conflicts_reviews_and_permissions_block_merge() {
        let mut current = ready();
        let pr = current.pull_request.as_mut().unwrap();
        assert!(block_reason(pr, "WRITE").is_none());
        assert!(block_reason(pr, "READ").is_some());
        pr.is_draft = true;
        assert!(block_reason(pr, "ADMIN").is_some());
        pr.is_draft = false;
        for state in ["BLOCKED", "DIRTY", "UNKNOWN", "UNSTABLE", "BEHIND"] {
            pr.merge_state_status = state.into();
            assert!(block_reason(pr, "ADMIN").is_some());
        }
        pr.merge_state_status = "CLEAN".into();
        for review in ["CHANGES_REQUESTED", "REVIEW_REQUIRED"] {
            pr.review_decision = review.into();
            assert!(block_reason(pr, "WRITE").is_some());
        }
        pr.state = "MERGED".into();
        assert!(block_reason(pr, "WRITE").is_some());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn cli_boundary_parses_json_and_reports_auth_and_invalid_responses() {
        use std::os::unix::fs::PermissionsExt;
        let directory = tempfile::tempdir().unwrap();
        let executable = directory.path().join("fake-gh");
        std::fs::write(
            &executable,
            r#"#!/bin/sh
if [ "$GH_HOST" != "github.com" ] || [ "$GH_PROMPT_DISABLED" != "1" ]; then exit 1; fi
case "$1" in
  status) printf '%s' '{"state":"OPEN"}' ;;
  auth) printf '%s' 'Run gh auth login' >&2; exit 4 ;;
  invalid) printf '%s' 'not json' ;;
  web) printf '%s' 'Opening pull request in your browser.' ;;
esac
"#,
        )
        .unwrap();
        std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o700)).unwrap();
        assert_eq!(
            run_gh(executable.as_os_str(), &["status"]).await.unwrap()["state"],
            "OPEN"
        );
        let error = run_gh(executable.as_os_str(), &["auth"]).await.unwrap_err();
        assert_eq!(error.kind, "authentication");
        assert!(error.message.contains("gh auth login"));
        assert!(run_gh(executable.as_os_str(), &["invalid"]).await.is_err());
        assert_eq!(
            run_gh_output(executable.as_os_str(), &["web"], directory.path().to_str())
                .await
                .unwrap(),
            b"Opening pull request in your browser."
        );
        assert_eq!(
            run_gh(directory.path().join("missing-gh").as_os_str(), &[])
                .await
                .unwrap_err()
                .kind,
            "not_installed"
        );
    }
}
