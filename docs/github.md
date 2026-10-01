# View and merge pull requests in Talo

Choose a local repository above the chat composer, then open the GitHub button on
the right to see the current branch's pull request, reviews and checks.

## Connect your account

1. Install [GitHub CLI](https://cli.github.com/) (`gh`) on your system PATH.
2. Run `gh auth login --hostname github.com` in the terminal.
3. Choose a repository whose `origin` remote points to github.com, and check out
   the PR branch.
4. Open the GitHub panel. Use Refresh after signing in or changing PR status.

Talo reuses GitHub CLI authentication. It does not store GitHub tokens in browser
storage or expose them to the chat. The panel refreshes when opened or when the
app regains focus while it is open.

## Merge a pull request

The panel offers the repository's enabled merge methods: squash, merge commit or
rebase. The action label names the method and the panel shows the target branch.
Clicking it merges the published PR on GitHub; it does not push local changes,
delete the local branch, switch branches or pull the resulting commit locally.

Merge is disabled for draft or closed PRs, missing write permission, required
reviews, conflicts, or a merge state other than GitHub's `CLEAN`. Before sending
the merge request, the backend reloads the PR and verifies its repository,
number, head commit and allowed merge method. The API request also includes the
expected head SHA. GitHub enforces its branch rules and account permissions.

## Current boundaries

- The panel uses the selected repository's `origin` and same-repository PRs.
  Cross-repository fork PRs and GitHub Enterprise hosts are not supported yet.
- Merge uses GitHub's direct merge API. Repositories requiring a merge queue or
  stacked PR operations may reject it; their workflows need a separate integration.
- Network failures and timeouts appear in the panel. If a merge response is
  uncertain, refresh to check the PR state before retrying.
- Repository selection is shared across chats. OpenCode and terminal working
  directories are not yet bound to the selected repository.
