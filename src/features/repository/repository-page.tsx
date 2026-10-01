import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { CircleDot, FolderOpen, GitBranch, GitFork, GitPullRequest, RefreshCw } from 'lucide-react'
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
  const [loading, setLoading] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [merging, setMerging] = useState(false)
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
      setSelectedPr(null)
      setSelectedIssue(null)
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
  return (
    <div className="mx-auto w-full max-w-5xl p-6 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <GitFork className="size-4" />
            Repository
          </p>
          <h1 className="break-words text-2xl font-medium">
            {data?.info.nameWithOwner ?? 'Your repository'}
          </h1>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            {data?.info.description ||
              'Pull requests, issues, and the context for your next change.'}
          </p>
          {data && (
            <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <GitBranch className="size-3.5" />
              {data.branch}
              <span>· {data.info.isPrivate ? 'Private' : 'Public'}</span>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh repository"
            disabled={loading || merging || !path}
            onClick={() => void load()}
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="outline"
            disabled={!isTauri() || choosing || merging}
            onClick={() => void chooseRepository()}
          >
            <FolderOpen className="size-4" />
            {choosing ? 'Choosing…' : 'Choose repository'}
          </Button>
        </div>
      </header>
      <nav aria-label="Repository views" className="mt-8 flex gap-2 border-b border-border pb-3">
        {(['Overview', 'Pull requests', 'Issues'] as const).map((item) => (
          <Button
            key={item}
            variant={view === item ? 'secondary' : 'ghost'}
            aria-current={view === item ? 'page' : undefined}
            disabled={merging}
            onClick={() => setView(item)}
          >
            {item}
          </Button>
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
        <p role="status" className="py-6 text-sm text-muted-foreground">
          Refreshing repository…
        </p>
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
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    {
                      label: 'Pull requests',
                      count: data.pullRequests.length,
                      icon: GitPullRequest,
                    },
                    { label: 'Issues', count: data.issues.length, icon: CircleDot },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.label}
                    onClick={() => setView(item.label)}
                    className="rounded-xl border border-border bg-background/40 p-6 text-left transition-colors hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <item.icon className="mb-4 size-5 text-muted-foreground" />
                    <p className="text-2xl font-medium">
                      {item.count === 100 ? '100+' : item.count}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Open {item.label.toLowerCase()}
                    </p>
                  </button>
                ))}
              </div>
              <section className="mt-8">
                <h2 className="text-sm font-medium">Current branch</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {data.branch} → {data.info.defaultBranchRef?.name ?? 'No default branch'}
                </p>
                <div className="mt-4">
                  <GitHubPanel
                    key={path}
                    path={path!}
                    inline
                    disabled={chat.activity !== 'idle'}
                    onMergingChange={setMerging}
                  />
                </div>
              </section>
            </>
          )}
          {view === 'Pull requests' && (
            <div className="grid items-start gap-6 lg:grid-cols-2">
              <section
                aria-label="Open pull requests"
                className="divide-y divide-border rounded-xl border border-border bg-background/40"
              >
                {!data.pullRequests.length && (
                  <p className="p-6 text-sm text-muted-foreground">No open pull requests.</p>
                )}
                {data.pullRequests.map((pr) => (
                  <button
                    key={pr.number}
                    disabled={merging}
                    aria-pressed={selectedPr === pr.number}
                    onClick={() => setSelectedPr(pr.number)}
                    className="w-full p-4 text-left hover:bg-accent/50 aria-pressed:bg-accent/50 focus-visible:outline-2 focus-visible:outline-ring"
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
              )}
            </div>
          )}
          {view === 'Issues' && (
            <div className="grid items-start gap-6 lg:grid-cols-2">
              <section
                aria-label="Open issues"
                className="divide-y divide-border rounded-xl border border-border bg-background/40"
              >
                {!data.issues.length && (
                  <p className="p-6 text-sm text-muted-foreground">No open issues.</p>
                )}
                {data.issues.map((item) => (
                  <button
                    key={item.number}
                    aria-pressed={selectedIssue === item.number}
                    onClick={() => setSelectedIssue(item.number)}
                    className="w-full p-4 text-left hover:bg-accent/50 aria-pressed:bg-accent/50 focus-visible:outline-2 focus-visible:outline-ring"
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
                <section className="rounded-xl border border-border bg-background/40 p-6">
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
