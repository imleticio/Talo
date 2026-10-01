import { useEffect, useRef, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { open as openDirectory } from '@tauri-apps/plugin-dialog'
import { Check, ChevronDown, FolderOpen, GitBranch, LoaderCircle } from 'lucide-react'
import { Popover } from 'radix-ui'
import { Button } from '@/components/ui/button'

type Repository = { path: string; branch: string | null; revision: string; branches: string[] }
const STORAGE_KEY = 'talo.git-repository'

function savedPath() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function BranchPicker({ disabled }: { disabled: boolean }) {
  const [path, setPath] = useState(savedPath)
  const [repository, setRepository] = useState<Repository | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const locked = useRef(false)
  const generation = useRef(0)
  const supported = isTauri()

  useEffect(() => {
    if (!path || !supported) return
    let cancelled = false
    const refresh = async () => {
      if (locked.current) return
      const request = ++generation.current
      try {
        const next = await invoke<Repository>('git_repository', { path })
        if (!cancelled && request === generation.current) {
          setRepository(next)
          setError(null)
        }
      } catch (reason) {
        if (!cancelled && request === generation.current) {
          setRepository(null)
          setError(String(reason))
        }
      }
    }
    void refresh()
    window.addEventListener('focus', refresh)
    return () => {
      cancelled = true
      window.removeEventListener('focus', refresh)
    }
  }, [path, supported, open])

  async function perform(action: () => Promise<void>) {
    if (locked.current || disabled) return
    locked.current = true
    generation.current++
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (reason) {
      setError(String(reason))
    } finally {
      locked.current = false
      setBusy(false)
    }
  }

  function chooseFolder() {
    void perform(async () => {
      const selected = await openDirectory({
        directory: true,
        multiple: false,
        title: 'Choose Git repository',
      })
      if (!selected) return
      const next = await invoke<Repository>('git_repository', { path: selected })
      setRepository(next)
      setPath(next.path)
      setSearch('')
      try {
        localStorage.setItem(STORAGE_KEY, next.path)
      } catch {
        setError('Repository selected, but the folder preference could not be saved.')
      }
    })
  }

  function switchBranch(branch: string) {
    if (!repository) return
    void perform(async () => {
      const next = await invoke<Repository>('git_switch_branch', { path: repository.path, branch })
      setRepository(next)
      setOpen(false)
    })
  }

  const label = repository
    ? (repository.branch ?? `Detached HEAD · ${repository.revision}`)
    : path
      ? 'Repository unavailable'
      : 'Select repository'

  return (
    <div className="mb-2 flex items-center">
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <Button
            type="button"
            variant="ghost"
            disabled={!supported || disabled || busy}
            aria-label={`Git branch: ${label}`}
            title={repository?.path ?? 'Choose a local Git repository'}
            className="branch-picker-trigger h-8 max-w-full gap-2 rounded-lg px-2 text-sm text-muted-foreground hover:text-foreground"
          >
            {busy ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <GitBranch className="size-4 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate font-medium">{label}</span>
            <ChevronDown className="branch-picker-chevron size-3.5 shrink-0" aria-hidden="true" />
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={8}
            collisionPadding={16}
            aria-label="Repository branches"
            className="branch-picker-popover z-50 flex max-h-[var(--radix-popover-content-available-height)] w-[min(20rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border p-2 text-popover-foreground outline-none"
          >
            {repository && (
              <p
                className="truncate px-2 py-2 text-xs text-muted-foreground"
                title={repository.path}
              >
                {repository.path}
              </p>
            )}
            {error && (
              <p role="alert" className="px-2 py-2 text-xs text-destructive whitespace-pre-wrap">
                {error}
              </p>
            )}
            {repository && (
              <>
                <input
                  type="search"
                  aria-label="Search branches"
                  placeholder="Search branches…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="mb-2 h-8 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="max-h-64 overflow-y-auto">
                  {repository.branches
                    .filter((branch) => branch.toLowerCase().includes(search.toLowerCase()))
                    .map((branch) => (
                      <button
                        key={branch}
                        type="button"
                        disabled={disabled || busy}
                        aria-pressed={branch === repository.branch}
                        onClick={() => switchBranch(branch)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
                      >
                        <GitBranch
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="truncate">{branch}</span>
                        {branch === repository.branch && (
                          <Check className="ml-auto size-4 shrink-0" aria-hidden="true" />
                        )}
                      </button>
                    ))}
                  {repository.branches.length === 0 && (
                    <p className="px-2 py-2 text-xs text-muted-foreground">
                      No local branches yet. Create your first commit to get started.
                    </p>
                  )}
                </div>
              </>
            )}
            <Button
              type="button"
              variant="ghost"
              disabled={disabled || busy}
              onClick={chooseFolder}
              className="mt-2 h-8 justify-start gap-2 text-xs"
            >
              <FolderOpen className="size-4" aria-hidden="true" />
              {path ? 'Change repository…' : 'Choose repository…'}
            </Button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
}
