import { useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Button } from '@/components/ui/button'
import { toAppError } from '@/services/errors'
import type { GitWorkspace, WorkingFile } from './repository-activity'

const statusLabels: Record<string, string> = {
  M: 'Modified',
  A: 'Added',
  D: 'Deleted',
  R: 'Renamed',
  C: 'Copied',
  '?': 'Untracked',
  U: 'Conflict',
  T: 'Type changed',
}

export function RepositoryChanges({
  path,
  workspace,
  loading,
  error,
  disabled,
  onBusyChange,
  onWorkspaceChange,
  onCommitted,
  onRefresh,
}: {
  path: string
  workspace: GitWorkspace | null
  loading: boolean
  error: string | null
  disabled: boolean
  onBusyChange: (busy: boolean) => void
  onWorkspaceChange: (workspace: GitWorkspace) => void
  onCommitted: () => Promise<void>
  onRefresh: () => Promise<void>
}) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [operationError, setOperationError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const lock = useRef(false)
  const staged = workspace?.files.filter((file) => file.index !== ' ' && file.index !== '?') ?? []
  const changes = workspace?.files.filter((file) => file.worktree !== ' ') ?? []
  const blocked = busy || loading || disabled || !workspace || Boolean(error)

  async function run(
    command: 'git_stage' | 'git_unstage' | 'git_create_commit',
    file: string | null = null,
  ) {
    if (lock.current || blocked) return
    lock.current = true
    setBusy(true)
    onBusyChange(true)
    setOperationError(null)
    setNotice(null)
    try {
      if (command === 'git_create_commit') {
        const hash = await invoke<string>(command, { path, message })
        setMessage('')
        setNotice(`Committed ${hash.slice(0, 7)} locally. Nothing was pushed.`)
        await onCommitted()
      } else {
        const next = await invoke<GitWorkspace>(command, { path, file })
        onWorkspaceChange(next)
      }
    } catch (reason) {
      setOperationError(toAppError(reason).message)
      await onRefresh()
    } finally {
      lock.current = false
      setBusy(false)
      onBusyChange(false)
    }
  }

  function fileGroup(title: string, files: WorkingFile[], stagedGroup: boolean) {
    const command = stagedGroup ? 'git_unstage' : 'git_stage'
    const action = stagedGroup ? 'Unstage' : 'Stage'
    return (
      <section aria-label={title}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">
            {title}{' '}
            <span className="ml-2 text-xs font-normal tabular-nums text-muted-foreground">
              {files.length}
            </span>
          </h2>
          <Button
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground"
            disabled={blocked || !files.length}
            onClick={() => void run(command)}
          >
            {action} all
          </Button>
        </div>
        {!files.length && (
          <p className="py-3 text-xs text-muted-foreground">
            {stagedGroup ? 'No staged changes.' : 'No unstaged changes.'}
          </p>
        )}
        <ul className="divide-y divide-border/50">
          {files.map((file) => {
            const status = file.conflicted ? 'U' : stagedGroup ? file.index : file.worktree
            return (
              <li key={file.path} className="flex items-center gap-3 py-2">
                <span
                  className={`w-4 shrink-0 font-mono text-xs ${file.conflicted ? 'text-destructive' : 'text-muted-foreground'}`}
                  title={statusLabels[status] ?? status}
                  aria-label={statusLabels[status] ?? status}
                >
                  {status}
                </span>
                <span className="min-w-0 flex-1 break-all text-sm" title={file.path}>
                  {file.originalPath && (
                    <span className="text-muted-foreground">{file.originalPath} → </span>
                  )}
                  {file.path}
                </span>
                <Button
                  variant="ghost"
                  className="h-7 shrink-0 px-2 text-xs text-muted-foreground"
                  disabled={blocked}
                  aria-label={`${action} ${file.path}`}
                  onClick={() => void run(command, file.path)}
                >
                  {action}
                </Button>
              </li>
            )
          })}
        </ul>
      </section>
    )
  }

  return (
    <div className="mt-6 space-y-6">
      {loading && (
        <p role="status" className="text-xs text-muted-foreground">
          Refreshing local changes…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {workspace && (
        <>
          {!workspace.files.length && (
            <p className="text-sm text-muted-foreground">Working tree clean.</p>
          )}
          {fileGroup('Changes', changes, false)}
          {fileGroup('Staged changes', staged, true)}
          <form
            className="max-w-xl space-y-3 border-t border-border/60 pt-5"
            onSubmit={(event) => {
              event.preventDefault()
              void run('git_create_commit')
            }}
          >
            <label className="block text-sm font-medium" htmlFor="repository-commit-message">
              Commit message
            </label>
            <textarea
              id="repository-commit-message"
              required
              rows={3}
              value={message}
              disabled={busy}
              onChange={(event) => setMessage(event.target.value)}
              className="w-full resize-y rounded-md border border-border bg-background/50 p-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
              placeholder="Describe your changes"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {staged.length} staged {staged.length === 1 ? 'file' : 'files'}
              </p>
              <Button
                type="submit"
                disabled={
                  blocked ||
                  !message.trim() ||
                  !staged.length ||
                  Boolean(workspace.commitBlockReason)
                }
              >
                {busy ? 'Working…' : 'Commit changes'}
              </Button>
            </div>
            {workspace.commitBlockReason && (
              <p className="text-xs text-muted-foreground">{workspace.commitBlockReason}</p>
            )}
            {workspace.ahead !== null && (
              <p className="text-xs text-muted-foreground">
                {workspace.ahead} {workspace.ahead === 1 ? 'commit' : 'commits'} ahead of upstream
                {workspace.behind ? ` · ${workspace.behind} behind` : ''}
              </p>
            )}
          </form>
        </>
      )}
      {operationError && (
        <p role="alert" className="text-sm text-destructive">
          {operationError}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
    </div>
  )
}
