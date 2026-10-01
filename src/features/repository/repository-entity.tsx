import { useState, type ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  ArrowRight,
  CircleCheck,
  CircleDot,
  ExternalLink,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  MessageCircle,
} from 'lucide-react'
import { BranchIcon } from '@/components/ui/branch-icon'
import { Button } from '@/components/ui/button'
import { toAppError } from '@/services/errors'

export function GitHubLogo() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

export function EntityState({ state, draft = false }: { state: string; draft?: boolean }) {
  const label =
    state === 'MERGED' ? 'Merged' : state === 'CLOSED' ? 'Closed' : draft ? 'Draft' : 'Open'
  const color =
    state === 'MERGED'
      ? 'text-emerald-600 dark:text-emerald-400'
      : state === 'CLOSED'
        ? 'text-rose-400'
        : state === 'OPEN' && !draft
          ? 'text-emerald-500'
          : 'text-muted-foreground'
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${color}`}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}

export function EntityCategory({
  kind,
  number,
  state,
  draft = false,
}: {
  kind: 'Issue' | 'Pull request'
  number?: number
  state?: string
  draft?: boolean
}) {
  const Icon =
    kind === 'Issue'
      ? state === 'CLOSED'
        ? CircleCheck
        : CircleDot
      : state === 'MERGED'
        ? GitMerge
        : state === 'CLOSED'
          ? GitPullRequestClosed
          : draft
            ? GitPullRequestDraft
            : GitPullRequest
  const color = draft
    ? 'text-muted-foreground'
    : state === 'OPEN' || state === 'MERGED'
      ? 'text-emerald-600 dark:text-emerald-400'
      : state === 'CLOSED'
        ? kind === 'Issue'
          ? 'text-purple-600 dark:text-purple-400'
          : 'text-rose-600 dark:text-rose-400'
        : 'text-muted-foreground'
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className={`size-3.5 shrink-0 ${color}`} aria-hidden="true" />
      {kind}
      {number !== undefined && ` #${number}`}
      {state && (
        <span className="sr-only">
          {state === 'MERGED' ? 'Merged' : state === 'CLOSED' ? 'Closed' : draft ? 'Draft' : 'Open'}
        </span>
      )}
    </span>
  )
}

export function EntityBranches({ source, target }: { source: string; target: string }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
      {[source, target].map((branch, index) => (
        <span key={`${index}:${branch}`} className="contents">
          {index === 1 && <ArrowRight className="size-3 text-muted-foreground" aria-label="into" />}
          <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
            <BranchIcon className="size-3 shrink-0" />
            <span className="break-all">{branch}</span>
          </span>
        </span>
      ))}
    </div>
  )
}

export function EntityTime({ date, prefix = '' }: { date: string; prefix?: string }) {
  const [now] = useState(() => Date.now())
  const timestamp = Date.parse(date)
  if (!Number.isFinite(timestamp)) return null
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60000))
  const relative =
    minutes < 1
      ? 'just now'
      : minutes < 60
        ? `${minutes}m ago`
        : minutes < 1440
          ? `${Math.floor(minutes / 60)}h ago`
          : `${Math.floor(minutes / 1440)}d ago`
  return (
    <time dateTime={date} title={new Date(timestamp).toLocaleString()}>
      {prefix}
      {relative}
    </time>
  )
}

export function EntityHeader({
  kind,
  number,
  state,
  draft,
  repository,
  title,
  children,
}: {
  kind: 'Issue' | 'Pull request'
  number: number
  state: string
  draft?: boolean
  repository: string
  title: string
  children?: ReactNode
}) {
  return (
    <header>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
        <GitHubLogo />
        <EntityCategory kind={kind} number={number} state={state} draft={draft} />
        <EntityState state={state} draft={draft} />
        <span className="break-all">{repository}</span>
      </div>
      <h2 className="mt-3 break-words text-xl font-semibold leading-tight tracking-tight">
        {title}
      </h2>
      {children && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-relaxed text-muted-foreground">
          {children}
        </div>
      )}
    </header>
  )
}

export function EntityActions({
  path,
  kind,
  number,
  disabled,
  onAsk,
}: {
  path: string
  kind: 'pr' | 'issue'
  number: number
  disabled: boolean
  onAsk: () => void
}) {
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function openGithub() {
    setOpening(true)
    setError(null)
    try {
      await invoke('github_open_entity', { path, kind, number })
    } catch (reason) {
      setError(toAppError(reason).message)
    } finally {
      setOpening(false)
    }
  }
  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="h-8 bg-transparent text-xs"
          disabled={disabled}
          onClick={onAsk}
        >
          <MessageCircle className="size-3.5" />
          Ask
        </Button>
        <Button
          variant="ghost"
          className="h-8 text-xs text-muted-foreground"
          disabled={opening}
          onClick={() => void openGithub()}
        >
          <ExternalLink className="size-3.5" />
          {opening ? 'Opening…' : 'Open on GitHub'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
