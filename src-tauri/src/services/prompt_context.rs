use std::path::{Component, Path};

use crate::agents::{AgentSkill, PromptAttachments, PromptContext};
use crate::errors::{AppError, AppResult};

pub fn workspace_directory(directory: &str) -> AppResult<String> {
    let path = Path::new(directory);
    if !path.is_absolute() || !path.is_dir() {
        return Err(AppError::new(
            "validation",
            "Choose an available project folder.",
        ));
    }
    path.canonicalize()
        .ok()
        .and_then(|path| path.to_str().map(str::to_owned))
        .ok_or_else(|| AppError::new("validation", "The project folder is unavailable."))
}

fn file_url(directory: &str, file: &str) -> AppResult<String> {
    let relative = Path::new(file);
    if file.is_empty()
        || relative.is_absolute()
        || relative
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err(AppError::new(
            "validation",
            "File references must be project-relative paths.",
        ));
    }
    let root = Path::new(directory);
    let path = root.join(relative).canonicalize().map_err(|_| {
        AppError::new(
            "validation",
            format!("Referenced file is unavailable: {file}"),
        )
    })?;
    if !path.starts_with(root) || !path.is_file() {
        return Err(AppError::new(
            "validation",
            "Referenced file must be inside the project folder.",
        ));
    }
    reqwest::Url::from_file_path(path)
        .map(String::from)
        .map_err(|_| AppError::new("validation", "Could not reference this file."))
}

pub fn available_files(directory: &str, files: Vec<String>) -> Vec<String> {
    files
        .into_iter()
        .filter(|file| file_url(directory, file).is_ok())
        .collect()
}

pub fn prepare(context: PromptContext, skills: Vec<AgentSkill>) -> AppResult<PromptAttachments> {
    if context.files.len() > 32 || context.skills.len() > 16 {
        return Err(AppError::new(
            "validation",
            "Too many references in one message.",
        ));
    }
    let mut attachments = PromptAttachments::default();
    if let Some(directory) = &context.directory {
        attachments.instructions.push(format!(
            "The user's project directory is {directory}. Resolve project-relative paths and run project commands in this directory."
        ));
    }
    for file in context.files {
        if attachments.files.iter().any(|(name, _)| name == &file) {
            continue;
        }
        let directory = context.directory.as_deref().ok_or_else(|| {
            AppError::new(
                "validation",
                "Choose a project folder before referencing files.",
            )
        })?;
        attachments
            .files
            .push((file.clone(), file_url(directory, &file)?));
    }
    let mut included = std::collections::HashSet::new();
    for name in context.skills {
        if !included.insert(name.clone()) {
            continue;
        }
        let skill = skills
            .iter()
            .find(|skill| skill.name == name)
            .ok_or_else(|| {
                AppError::new(
                    "validation",
                    format!("Skill is no longer available: {name}"),
                )
            })?;
        if skill.content.trim().is_empty() {
            return Err(AppError::new(
                "validation",
                format!("Skill has no instructions: {name}"),
            ));
        }
        attachments.instructions.push(format!(
            "The user selected the ${name} skill. Apply its instructions below. Skill location: {}\n\n{}",
            skill.location, skill.content
        ));
    }
    Ok(attachments)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn references_real_files_with_spaces_and_deduplicates_skills() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("chat view.ts"), "const value = 1").unwrap();
        let root = workspace_directory(dir.path().to_str().unwrap()).unwrap();
        let context = PromptContext {
            directory: Some(root),
            files: vec!["chat view.ts".into(), "chat view.ts".into()],
            skills: vec!["review".into(), "review".into()],
        };
        let attachments = prepare(
            context,
            vec![AgentSkill {
                name: "review".into(),
                description: "Review code".into(),
                location: "<built-in>".into(),
                content: "Inspect the actual code.".into(),
            }],
        )
        .unwrap();
        assert_eq!(attachments.files.len(), 1);
        assert!(attachments.files[0].1.ends_with("chat%20view.ts"));
        assert_eq!(attachments.instructions.len(), 2);
        assert!(attachments.instructions[1].contains("Inspect the actual code."));
    }

    #[test]
    fn rejects_missing_files_parent_paths_and_missing_skills() {
        let dir = tempfile::tempdir().unwrap();
        let root = workspace_directory(dir.path().to_str().unwrap()).unwrap();
        for file in ["../outside.ts", "/outside.ts", "missing.ts", "."] {
            assert!(file_url(&root, file).is_err(), "{file}");
        }
        assert!(
            prepare(
                PromptContext {
                    skills: vec!["missing".into()],
                    ..Default::default()
                },
                vec![]
            )
            .is_err()
        );
    }

    #[cfg(unix)]
    #[test]
    fn excludes_symlinks_outside_the_project() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::NamedTempFile::new().unwrap();
        std::os::unix::fs::symlink(outside.path(), dir.path().join("outside.ts")).unwrap();
        let root = workspace_directory(dir.path().to_str().unwrap()).unwrap();
        assert!(file_url(&root, "outside.ts").is_err());
        assert!(available_files(&root, vec!["outside.ts".into()]).is_empty());
    }
}
