import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { FolderOpen, GitPullRequest, RefreshCw } from 'lucide-react'
import { BranchIcon } from '@/components/ui/branch-icon'
import { Button } from '@/components/ui/button'
import { GitHubPanel } from '@/features/chat/github-panel'
import type { ChatConversation } from '@/features/chat/use-chat-conversation'
import { toAppError, type AppError } from '@/services/errors'

type Issue = {
  number: number
  title: string
  body: string
  labels: { name: string }[]
  author: { login: string } | null
}
type PullRequest = {
  number: number
  title: string
  isDraft: boolean
  headRefName: string
  baseRefName: string
  reviewDecision: string
}
type RepositoryData = {
  info: {
    nameWithOwner: string
    description: string
    isPrivate: boolean
    defaultBranchRef: { name: string } | null
  }
  branch: string
  pullRequests: PullRequest[]
  issues: Issue[]
  commits: { sha: string; title: string }[]
  published: boolean
  activity: {
    ahead: number | null
    commits: { hash: string; message: string; author: string; date: string }[]
    error: string | null
  }
}
const storageKey = 'talo.git-repository'
function savedPath() {
  try {
    return localStorage.getItem(storageKey)
  } catch {
    return null
  }
}

export function RepositoryPage({
  chat,
  onShowChat,
}: {
  chat: ChatConversation
  onShowChat: () => void
}) {
  const [path, setPath] = useState(savedPath)
  const [data, setData] = useState<RepositoryData | null>(null)
  const [error, setError] = useState<AppError | null>(null)
  const [loading, setLoading] = useState(() => Boolean(savedPath()) && isTauri())
  const [choosing, setChoosing] = useState(false)
  const [merging, setMerging] = useState(false)
  const [creatingPr, setCreatingPr] = useState(false)
  const [showCreatePr, setShowCreatePr] = useState(false)
  const [createError, setCreateError] = useState<AppError | null>(null)
  const [prTitle, setPrTitle] = useState('')
  const [prBody, setPrBody] = useState('')
  const [view, setView] = useState<'Overview' | 'Pull requests' | 'Issues'>('Overview')
  const [selectedPr, setSelectedPr] = useState<number | null>(null)
  const [selectedIssue, setSelectedIssue] = useState<number | null>(null)
  const request = useRef(0)
  const load = useCallback(async () => {
    if (!path || !isTauri()) return
    const id = ++request.current
    setLoading(true)
    setError(null)
    try {
      const next = await invoke<RepositoryData>('github_repository', { path })
      if (id === request.current) setData(next)
    } catch (reason) {
      if (id === request.current) {
        setError(toAppError(reason))
        setData(null)
      }
    } finally {
      if (id === request.current) setLoading(false)
    }
  }, [path])
  useEffect(() => {
    const generation = request
    const timer = window.setTimeout(() => void load(), 0)
    return () => {
      window.clearTimeout(timer)
      generation.current++
    }
  }, [load])
  useEffect(() => {
    if (merging) return
    const refresh = () => void load()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [load, merging])

  async function chooseRepository() {
    setChoosing(true)
    try {
      const next = await open({ directory: true, multiple: false })
      if (typeof next !== 'string') return
      request.current++
      setData(null)
      setLoading(true)
      setSelectedPr(null)
      setSelectedIssue(null)
      setShowCreatePr(false)
      setCreateError(null)
      setPrTitle('')
      setPrBody('')
      setPath(next)
      try {
        localStorage.setItem(storageKey, next)
      } catch {
        /* Selection still works without persistence. */
      }
      if (next === path) void load()
    } catch (reason) {
      setError(toAppError(reason))
    } finally {
      setChoosing(false)
    }
  }
  const issue = data?.issues.find((item) => item.number === selectedIssue)
  const branchPr = data?.pullRequests.find((item) => item.headRefName === data.branch)
  const repositoryName = data?.info.nameWithOwner.split('/')

  async function createPullRequest() {
    if (!path) return
    setCreatingPr(true)
    try {
      setCreateError(null)
      const created = await invoke<{ number: number }>('github_create_pr', {
        path,
        title: prTitle,
        body: prBody,
      })
      setPrTitle('')
      setPrBody('')
      setShowCreatePr(false)
      setSelectedPr(created.number)
      setView('Pull requests')
      await load()
    } catch (reason) {
      setCreateError(toAppError(reason))
    } finally {
      setCreatingPr(false)
    }
  }
  return (
    <div className="repository-page mx-auto w-full max-w-5xl px-6 py-6 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-lg font-medium tracking-tight">
            {repositoryName ? (
              <>
                <span className="font-normal text-muted-foreground">
                  {repositoryName[0]} <span className="mx-1 opacity-50">/</span>{' '}
                </span>
                {repositoryName[1]}
              </>
            ) : loading ? (
              <span className="block h-6 w-56 max-w-full rounded-md bg-muted" aria-hidden="true" />
            ) : (
              'Your repository'
            )}
          </h1>
          <p className="mt-1 flex min-h-4 flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {data ? (
              <>
                <BranchIcon className="size-3.5" />
                {data.branch}
                <span>· {data.info.isPrivate ? 'Private' : 'Public'}</span>
                <span aria-live="polite">
                  · {loading ? 'Syncing…' : error ? 'Sync failed' : 'Synced'}
                </span>
              </>
            ) : loading ? (
              <span className="h-4 w-36 rounded bg-muted" aria-hidden="true" />
            ) : null}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh repository"
            disabled={loading || merging || creatingPr || !path}
            onClick={() => void load()}
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            className="h-8 px-2 text-xs text-muted-foreground"
            disabled={!isTauri() || choosing || merging || creatingPr}
            onClick={() => void chooseRepository()}
          >
            <FolderOpen className="size-4" />
            {choosing ? 'Choosing…' : 'Choose repository'}
          </Button>
        </div>
      </header>
      <nav
        aria-label="Repository views"
        className="mt-6 flex gap-6 overflow-x-auto border-b border-border/60"
      >
        {(['Overview', 'Pull requests', 'Issues'] as const).map((item) => (
          <button
            type="button"
            key={item}
            className={`flex shrink-0 items-center gap-2 border-b py-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring ${view === item ? 'border-foreground/70 font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            aria-current={view === item ? 'page' : undefined}
            disabled={merging || creatingPr}
            onClick={() => setView(item)}
          >
            {item}
            {data && item !== 'Overview' && (
              <span className="text-xs font-normal tabular-nums text-muted-foreground">
                {(item === 'Issues' ? data.issues.length : data.pullRequests.length) === 100
                  ? '100+'
                  : item === 'Issues'
                    ? data.issues.length
                    : data.pullRequests.length}
              </span>
            )}
          </button>
        ))}
      </nav>
      {!isTauri() && (
        <p className="py-8 text-sm text-muted-foreground">
          Open Talo on the desktop to connect your GitHub repository.
        </p>
      )}
      {isTauri() && !path && (
        <p className="py-8 text-sm text-muted-foreground">
          Choose a local repository with a GitHub origin to get started.
        </p>
      )}
      {loading && (
        <p role="status" className="sr-only">
          Refreshing repository…
        </p>
      )}
      {loading && !data && (
        <div className="mt-6" aria-hidden="true">
          <section>
            <h2 className="text-sm font-medium">Current branch</h2>
            <div className="mt-2 h-5 w-44 rounded bg-muted" />
            <div className="mt-6 border-t border-border/60 pt-6">
              {[0, 1, 2].map((item) => (
                <div key={item} className="mb-6">
                  <div className="h-4 w-48 rounded bg-muted" />
                  <div className="mt-2 h-3 w-32 rounded bg-muted" />
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm"
        >
          <p className="whitespace-pre-wrap">{error.message}</p>
          {['authentication', 'not_installed'].includes(error.kind ?? '') && (
            <p className="mt-2 text-muted-foreground">
              Install GitHub CLI and run <code>gh auth login</code>, then refresh.
            </p>
          )}
        </div>
      )}
      {data && (
        <div className="mt-6">
          {view === 'Overview' && (
            <>
              <section aria-labelledby="current-branch-heading" className="pb-6">
                <h2 id="current-branch-heading" className="text-xs text-muted-foreground">
                  Current branch
                </h2>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-base font-medium">
                      <BranchIcon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="break-all">{data.branch}</span>
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {data.info.defaultBranchRef
                        ? data.branch === data.info.defaultBranchRef.name
                          ? 'You’re on the default branch'
                          : data.activity.ahead === null
                            ? `Comparison with ${data.info.defaultBranchRef.name} unavailable locally`
                            : `${data.activity.ahead} ${data.activity.ahead === 1 ? 'commit' : 'commits'} ahead of ${data.info.defaultBranchRef.name}`
                        : 'No default branch'}
                    </p>
                  </div>
                  {branchPr ? (
                    <Button
                      variant="secondary"
                      className="h-8 text-xs"
                      disabled={merging}
                      onClick={() => {
                        setSelectedPr(branchPr.number)
                        setView('Pull requests')
                      }}
                    >
                      <GitPullRequest className="size-3.5" />
                      View pull request{' '}
                      <span className="text-muted-foreground">#{branchPr.number}</span>
                    </Button>
                  ) : (
                    data.info.defaultBranchRef &&
                    data.branch !== data.info.defaultBranchRef.name && (
                      <Button
                        variant="secondary"
                        className="h-8 text-xs"
                        disabled={
                          creatingPr ||
                          loading ||
                          merging ||
                          chat.activity !== 'idle' ||
                          data.activity.ahead === 0
                        }
                        onClick={() => setShowCreatePr((previous) => !previous)}
                      >
                        <GitPullRequest className="size-3.5" />
                        Create pull request
                      </Button>
                    )
                  )}
                </div>
                {data.info.defaultBranchRef && data.branch !== data.info.defaultBranchRef.name && (
                  <div
                    className="repository-branch-track mt-4 flex items-center gap-3 text-xs text-muted-foreground"
                    aria-label={`${data.info.defaultBranchRef.name} to ${data.branch}`}
                  >
                    <span className="shrink-0">{data.info.defaultBranchRef.name}</span>
                    <div className="relative h-4 max-w-64 flex-1" aria-hidden="true">
                      <span className="absolute inset-x-0 top-2 border-t border-border" />
                      <span className="absolute top-1 left-0 size-2 rounded-full border border-muted-foreground bg-background" />
                      <span className="absolute top-1 right-0 size-2 rounded-full bg-foreground/70" />
                    </div>
                    <span className="truncate">{data.branch}</span>
                  </div>
                )}
                {showCreatePr && !branchPr && (
                  <form
                    className="mt-5 max-w-xl space-y-3 border-t border-border/60 pt-4"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void createPullRequest()
                    }}
                  >
                    <p className="text-xs text-muted-foreground">
                      {data.branch} → {data.info.defaultBranchRef?.name}. All published commits on
                      this branch will be included.
                    </p>
                    <label className="block text-sm">
                      Title
                      <input
                        required
                        maxLength={256}
                        disabled={creatingPr}
                        value={prTitle}
                        onChange={(event) => setPrTitle(event.target.value)}
                        placeholder={data.commits[0]?.title}
                        className="mt-1 w-full rounded-md border border-border bg-background/50 p-2"
                      />
                    </label>
                    <label className="block text-sm">
                      Description
                      <textarea
                        maxLength={65536}
                        rows={4}
                        disabled={creatingPr}
                        value={prBody}
                        onChange={(event) => setPrBody(event.target.value)}
                        className="mt-1 w-full rounded-md border border-border bg-background/50 p-2"
                      />
                    </label>
                    {!data.published && (
                      <p className="text-xs text-muted-foreground">
                        Push this branch to origin, then refresh to create a pull request.
                      </p>
                    )}
                    {createError && (
                      <p role="alert" className="text-sm text-destructive">
                        {createError.message}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        disabled={
                          !data.published ||
                          creatingPr ||
                          merging ||
                          loading ||
                          chat.activity !== 'idle'
                        }
                      >
                        {creatingPr ? 'Creating…' : 'Create pull request'}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={creatingPr}
                        onClick={() => setShowCreatePr(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                )}
              </section>
              <section
                aria-labelledby="recent-activity-heading"
                className="border-t border-border/60 pt-5"
              >
                <div className="mb-4 flex items-center justify-between gap-4">
                  <h2 id="recent-activity-heading" className="text-sm font-medium">
                    Recent activity
                  </h2>
                  <span className="text-xs text-muted-foreground">Latest commits</span>
                </div>
                {data.activity.error ? (
                  <p className="text-sm text-muted-foreground">
                    Commit history unavailable. Refresh to try again.
                  </p>
                ) : !data.activity.commits.length ? (
                  <p className="text-sm text-muted-foreground">No commits yet.</p>
                ) : (
                  <ol className="repository-activity">
                    {data.activity.commits.map((commit) => (
                      <li key={commit.hash} className="relative pb-5 pl-6 last:pb-0">
                        <span className="repository-commit-marker" aria-hidden="true" />
                        <p className="max-w-prose break-words text-sm font-medium">
                          {commit.message}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <code title={commit.hash}>{commit.hash.slice(0, 7)}</code>
                          {commit.author && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{commit.author}</span>
                            </>
                          )}
                          {commit.date && (
                            <>
                              <span aria-hidden="true">·</span>
                              <time
                                dateTime={commit.date}
                                title={new Date(commit.date).toLocaleString()}
                              >
                                {new Date(commit.date).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </time>
                            </>
                          )}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </>
          )}
          {view === 'Pull requests' && (
            <div className="grid items-start gap-6 lg:grid-cols-2">
              <section aria-label="Open pull requests" className="divide-y divide-border/60">
                {!data.pullRequests.length && (
                  <p className="p-6 text-sm text-muted-foreground">No open pull requests.</p>
                )}
                {data.pullRequests.map((pr) => (
                  <button
                    key={pr.number}
                    disabled={merging}
                    aria-pressed={selectedPr === pr.number}
                    onClick={() => setSelectedPr(pr.number)}
                    className="w-full rounded-lg px-3 py-4 text-left hover:bg-accent/30 aria-pressed:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <p className="text-sm font-medium">{pr.title}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      #{pr.number} · {pr.isDraft ? 'Draft' : 'Open'} · {pr.headRefName} →{' '}
                      {pr.baseRefName}
                    </p>
                  </button>
                ))}
              </section>
              {selectedPr && (
                <div className="repository-pr-detail">
                  <GitHubPanel
                    key={`${path}:${selectedPr}`}
                    path={path!}
                    number={selectedPr}
                    inline
                    disabled={chat.activity !== 'idle'}
                    onMergingChange={(value) => {
                      setMerging(value)
                      if (!value) void load()
                    }}
                  />
                </div>
              )}
            </div>
          )}
          {view === 'Issues' && (
            <div className="grid items-start gap-6 lg:grid-cols-2">
              <section aria-label="Open issues" className="divide-y divide-border/60">
                {!data.issues.length && (
                  <p className="p-6 text-sm text-muted-foreground">No open issues.</p>
                )}
                {data.issues.map((item) => (
                  <button
                    key={item.number}
                    aria-pressed={selectedIssue === item.number}
                    onClick={() => setSelectedIssue(item.number)}
                    className="w-full rounded-lg px-3 py-4 text-left hover:bg-accent/30 aria-pressed:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      #{item.number}
                      {item.author && ` · ${item.author.login}`}
                    </p>
                    {item.labels.length > 0 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {item.labels.map((label) => label.name).join(' · ')}
                      </p>
                    )}
                  </button>
                ))}
              </section>
              {issue && (
                <section className="border-t border-border/60 pt-4 lg:border-t-0 lg:border-l lg:pl-6">
                  <h2 className="text-base font-medium">{issue.title}</h2>
                  <p className="mt-4 max-h-80 overflow-y-auto whitespace-pre-wrap break-words text-sm text-muted-foreground">
                    {issue.body || 'No description provided.'}
                  </p>
                  <Button
                    className="mt-6"
                    disabled={Boolean(chat.deletingId)}
                    onClick={() => {
                      chat.startIssueChat(
                        `Help me work on GitHub issue ${data.info.nameWithOwner}#${issue.number}: ${issue.title}\n\nRepository: ${path}\n\n${issue.body}`,
                      )
                      onShowChat()
                    }}
                  >
                    Start chat from issue
                  </Button>
                </section>
              )}
            </div>
          )}
          {(view === 'Issues'
            ? data.issues.length
            : view === 'Pull requests'
              ? data.pullRequests.length
              : 0) === 100 && (
            <p className="mt-4 text-xs text-muted-foreground">Showing the first 100 open items.</p>
          )}
        </div>
      )}
    </div>
  )
}
