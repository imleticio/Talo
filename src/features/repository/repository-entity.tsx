import { useState, type ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { ExternalLink, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toAppError } from '@/services/errors'

export function EntityState({ state, draft = false }: { state: string; draft?: boolean }) {
  const label =
    state === 'MERGED' ? 'Merged' : state === 'CLOSED' ? 'Closed' : draft ? 'Draft' : 'Open'
  const color =
    state === 'MERGED'
      ? 'text-purple-400'
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
        <span>
          {kind} #{number}
        </span>
        <EntityState state={state} draft={draft} />
        <span className="break-all">{repository}</span>
      </div>
      <h2 className="mt-3 break-words text-lg font-medium leading-snug tracking-tight">{title}</h2>
      {children && (
        <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-xs leading-relaxed text-muted-foreground">
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
        <Button variant="secondary" className="h-8 text-xs" disabled={disabled} onClick={onAsk}>
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
