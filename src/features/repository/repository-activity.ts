export type GitCommit = {
  hash: string
  message: string
  author: string
  date: string
  parents: string[]
}

export type WorkingFile = {
  path: string
  originalPath: string | null
  index: string
  worktree: string
  conflicted: boolean
}

export type GitWorkspace = {
  branch: string | null
  files: WorkingFile[]
  commits: GitCommit[]
  ahead: number | null
  behind: number | null
  commitBlockReason: string | null
}

export type ActivityPullRequest = {
  number: number
  title: string
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  createdAt: string
  closedAt: string | null
  mergedAt: string | null
  headRefName: string
  baseRefName: string
  author: { login: string } | null
  mergedBy: { login: string } | null
  mergeCommit: { oid: string } | null
}

type ActivityBase = { id: string; title: string; timestamp: string; author: string | null }
type PrMetadata = {
  number: number
  source: string
  target: string
  state: ActivityPullRequest['state']
}
export type RepositoryActivity =
  | (ActivityBase & { type: 'commit'; metadata: { hash: string; branch: string | null } })
  | (ActivityBase & { type: 'pr'; metadata: PrMetadata & { action: 'opened' | 'closed' } })
  | (ActivityBase & {
      type: 'merge'
      metadata: Partial<PrMetadata> & { hash?: string; commit?: GitCommit }
    })

export function repositoryActivities(
  commits: GitCommit[],
  prs: ActivityPullRequest[],
  branch: string | null,
): RepositoryActivity[] {
  const events: RepositoryActivity[] = []
  const uniquePrs = [...new Map(prs.map((pr) => [pr.number, pr])).values()]
  const mergedHashes = new Set(
    uniquePrs
      .filter((pr) => pr.mergedAt && Number.isFinite(Date.parse(pr.mergedAt)))
      .map((pr) => pr.mergeCommit?.oid)
      .filter(Boolean),
  )
  for (const commit of commits) {
    if (mergedHashes.has(commit.hash)) continue
    const base = {
      id: `git:${commit.hash}`,
      title: commit.message,
      timestamp: commit.date,
      author: commit.author,
    }
    events.push(
      commit.parents.length > 1
        ? { ...base, type: 'merge', metadata: { hash: commit.hash } }
        : { ...base, type: 'commit', metadata: { hash: commit.hash, branch } },
    )
  }
  for (const pr of uniquePrs) {
    const metadata: PrMetadata = {
      number: pr.number,
      source: pr.headRefName,
      target: pr.baseRefName,
      state: pr.state,
    }
    events.push({
      id: `pr:${pr.number}:opened`,
      type: 'pr',
      title: pr.title,
      timestamp: pr.createdAt,
      author: pr.author?.login ?? null,
      metadata: { ...metadata, action: 'opened' },
    })
    if (pr.mergedAt) {
      const commit = commits.find((commit) => commit.hash === pr.mergeCommit?.oid)
      events.push({
        id: `pr:${pr.number}:merged`,
        type: 'merge',
        title: pr.title,
        timestamp: pr.mergedAt,
        author: pr.mergedBy?.login ?? null,
        metadata: { ...metadata, hash: pr.mergeCommit?.oid, commit },
      })
    } else if (pr.closedAt) {
      events.push({
        id: `pr:${pr.number}:closed`,
        type: 'pr',
        title: pr.title,
        timestamp: pr.closedAt,
        author: null,
        metadata: { ...metadata, action: 'closed' },
      })
    }
  }
  return events
    .filter((event) => Number.isFinite(Date.parse(event.timestamp)))
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp) || a.id.localeCompare(b.id))
}
