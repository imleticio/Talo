import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Check, Circle, GitMerge, GitPullRequest, LoaderCircle, RefreshCw, X } from 'lucide-react'
import { Popover } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { toAppError, type AppError } from '@/services/errors'

type CheckStatus = {
  name?: string
  context?: string
  status?: string
  conclusion?: string
  state?: string
}
type PullRequest = {
  number: number
  title: string
  state: string
  isDraft: boolean
  baseRefName: string
  headRefName: string
  headRefOid: string
  reviewDecision: string
  statusCheckRollup: CheckStatus[] | null
}
type GitHubStatus = {
  repository: string
  branch: string
  pullRequest: PullRequest | null
  mergeMethods: string[]
  canMerge: boolean
  mergeBlockReason: string | null
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

function CheckRow({ check }: { check: CheckStatus }) {
  const result = check.conclusion || check.state || check.status || 'PENDING'
  const passed = ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(result)
  const failed = [
    'FAILURE',
    'ERROR',
    'CANCELLED',
    'TIMED_OUT',
    'ACTION_REQUIRED',
    'STARTUP_FAILURE',
    'STALE',
  ].includes(result)
  const Icon = passed ? Check : failed ? X : Circle
  return (
    <li className="flex items-center gap-2 py-1.5 text-xs">
      <Icon
        className={`size-3.5 shrink-0 ${passed ? 'text-emerald-500' : failed ? 'text-destructive' : 'text-muted-foreground'}`}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate">{check.name || check.context || 'Check'}</span>
      <span className="text-muted-foreground">
        {passed ? 'Passed' : failed ? 'Failed' : 'Pending'}
      </span>
    </li>
  )
}

const methodLabels: Record<string, string> = {
  squash: 'Squash & merge',
  merge: 'Create merge commit',
  rebase: 'Rebase & merge',
}
const reviewLabels: Record<string, string> = {
  APPROVED: 'Approved',
  CHANGES_REQUESTED: 'Changes requested',
  REVIEW_REQUIRED: 'Review required',
}

function PanelContainer({ inline, children }: { inline: boolean; children: ReactNode }) {
  return inline ? <>{children}</> : <Popover.Portal>{children}</Popover.Portal>
}

function PanelContent({
  inline,
  ...props
}: ComponentProps<typeof Popover.Content> & { inline: boolean }) {
  return inline ? (
    <div className="min-h-64 rounded-xl border border-border bg-background p-6">
      {props.children}
    </div>
  ) : (
    <Popover.Content {...props} />
  )
}

export function GitHubPanel({
  path,
  disabled,
  onMergingChange,
  number,
  inline = false,
}: {
  path: string
  disabled: boolean
  onMergingChange: (merging: boolean) => void
  number?: number
  inline?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<GitHubStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [method, setMethod] = useState('')
  const request = useRef(0)
  const mergeLock = useRef(false)

  const load = useCallback(async () => {
    if (mergeLock.current) return
    const id = ++request.current
    setLoading(true)
    setError(null)
    try {
      const next = await invoke<GitHubStatus>('github_pr_status', { path, number })
      if (id !== request.current) return
      setData(next)
      setMethod((previous) =>
        next.mergeMethods.includes(previous) ? previous : (next.mergeMethods[0] ?? ''),
      )
    } catch (reason) {
      if (id === request.current) setError(toAppError(reason))
    } finally {
      if (id === request.current) setLoading(false)
    }
  }, [path, number])

  useEffect(() => {
    if (!inline) return
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [inline, load])

  useEffect(
    () => () => {
      request.current++
    },
    [],
  )
  useEffect(() => {
    if (!open && !inline) return
    const refresh = () => {
      void load()
    }
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [open, inline, load])

  function changeOpen(next: boolean) {
    if (mergeLock.current) return
    setOpen(next)
    if (next) {
      setNotice(null)
      void load()
    } else {
      request.current++
      setLoading(false)
    }
  }

  async function merge() {
    const pr = data?.pullRequest
    if (!data || !pr || !data.canMerge || disabled || loading || error || mergeLock.current) return
    mergeLock.current = true
    request.current++
    setMerging(true)
    onMergingChange(true)
    setError(null)
    setNotice(null)
    try {
      const result = await invoke<{ merged: boolean; message: string }>('github_merge_pr', {
        path,
        repository: data.repository,
        number: pr.number,
        headOid: pr.headRefOid,
        method,
      })
      if (!result.merged) throw new Error(result.message)
      setNotice(result.message)
      setData({ ...data, canMerge: false, pullRequest: { ...pr, state: 'MERGED' } })
    } catch (reason) {
      setError(toAppError(reason))
    } finally {
      mergeLock.current = false
      setMerging(false)
      onMergingChange(false)
    }
  }

  const pr = data?.pullRequest
  return (
    <Popover.Root open={inline || open} onOpenChange={changeOpen}>
      {!inline && (
        <Popover.Trigger asChild>
          <Button
            type="button"
            variant="ghost"
            disabled={disabled || merging}
            aria-label="GitHub pull request"
            title="GitHub pull request"
            className="h-8 shrink-0 gap-2 rounded-lg px-2 text-muted-foreground hover:text-foreground"
          >
            <GitHubMark />
            <span className="text-xs">GitHub</span>
          </Button>
        </Popover.Trigger>
      )}
      <PanelContainer inline={inline}>
        <PanelContent
          inline={inline}
          align="end"
          sideOffset={8}
          collisionPadding={16}
          aria-label="GitHub pull request status"
          onInteractOutside={(event) => {
            if (merging) event.preventDefault()
          }}
          onEscapeKeyDown={(event) => {
            if (merging) event.preventDefault()
          }}
          className="branch-picker-popover z-50 flex max-h-[var(--radix-popover-content-available-height)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-y-auto rounded-xl border border-border p-4 text-popover-foreground outline-none"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="truncate text-xs text-muted-foreground">
              {data?.repository ?? 'GitHub'}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Refresh pull request"
              disabled={loading || merging}
              onClick={() => void load()}
              className="size-7 shrink-0"
            >
              <RefreshCw
                className={`size-3.5 ${loading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
            </Button>
          </div>
          {loading && (
            <p role="status" className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
              Refreshing pull request…
            </p>
          )}
          {error && (
            <div
              role="alert"
              className="mb-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs"
            >
              <p className="whitespace-pre-wrap">{error.message}</p>
              {(error.kind === 'authentication' || error.kind === 'not_installed') && (
                <p className="mt-2 text-muted-foreground">
                  For GitHub access, install GitHub CLI and run <code>gh auth login</code> in the
                  terminal, then refresh.
                </p>
              )}
            </div>
          )}
          {notice && (
            <p role="status" className="mb-3 rounded-lg bg-accent/60 p-3 text-xs">
              {notice}
            </p>
          )}
          {pr ? (
            <>
              <div className="mb-3 flex items-start gap-2">
                {pr.state === 'MERGED' ? (
                  <GitMerge className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                ) : (
                  <GitPullRequest className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {pr.title} <span className="text-muted-foreground">#{pr.number}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {pr.isDraft
                      ? 'Draft'
                      : pr.state === 'OPEN'
                        ? 'Open'
                        : pr.state === 'MERGED'
                          ? 'Merged'
                          : 'Closed'}
                  </p>
                </div>
              </div>
              <p
                className="mb-4 truncate text-xs text-muted-foreground"
                title={`${pr.headRefName} → ${pr.baseRefName}`}
              >
                {pr.headRefName} → {pr.baseRefName}
              </p>
              <div className="mb-3 flex justify-between gap-2 text-xs">
                <span className="text-muted-foreground">Review</span>
                <span>{reviewLabels[pr.reviewDecision] ?? 'No review decision'}</span>
              </div>
              <div className="border-t border-border py-3">
                <p className="mb-1 text-xs font-medium">Checks</p>
                {pr.statusCheckRollup?.length ? (
                  <ul>
                    {pr.statusCheckRollup.map((check, index) => (
                      <CheckRow key={index} check={check} />
                    ))}
                  </ul>
                ) : (
                  <p className="py-1 text-xs text-muted-foreground">No checks reported.</p>
                )}
              </div>
              {pr.state === 'OPEN' && (
                <div className="border-t border-border pt-3">
                  {data?.mergeBlockReason && (
                    <p className="mb-3 text-xs text-muted-foreground">{data.mergeBlockReason}</p>
                  )}
                  {data && data.mergeMethods.length > 1 && (
                    <label className="mb-3 flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">Merge method</span>
                      <select
                        value={method}
                        disabled={merging || loading}
                        onChange={(event) => setMethod(event.target.value)}
                        className="min-w-0 rounded-md border border-border bg-popover px-2 py-1 text-xs"
                      >
                        {data.mergeMethods.map((value) => (
                          <option key={value} value={value}>
                            {methodLabels[value]}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <Button
                    type="button"
                    disabled={!data?.canMerge || disabled || loading || merging || Boolean(error)}
                    onClick={() => void merge()}
                    className="h-9 w-full gap-2 text-xs"
                  >
                    {merging ? (
                      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <GitMerge className="size-4" aria-hidden="true" />
                    )}
                    {merging ? 'Merging…' : (methodLabels[method] ?? 'Merge pull request')}
                  </Button>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Merges the published PR into {pr.baseRefName}. Your local branch is not changed.
                  </p>
                </div>
              )}
            </>
          ) : (
            !loading &&
            !error && (
              <p className="py-4 text-sm text-muted-foreground">No pull request for this branch.</p>
            )
          )}
        </PanelContent>
      </PanelContainer>
    </Popover.Root>
  )
}
