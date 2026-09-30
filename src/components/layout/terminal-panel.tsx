import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { ChevronDown, RotateCcw, TerminalSquare } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'
import './terminal-panel.css'

function TerminalSession({
  visible,
  onTitle,
}: {
  visible: boolean
  onTitle: (title: string) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exited, setExited] = useState(false)
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    if (!container.current || !isTauri()) return
    let disposed = false
    let ready = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let writes = Promise.resolve()
    const terminal = new Terminal({
      fontFamily: 'Menlo, Monaco, monospace',
      fontSize: 12,
      lineHeight: 1.4,
      cursorBlink: true,
      scrollback: 5000,
      theme: {
        background: '#17191d',
        foreground: '#e5e7eb',
        cursor: '#e5e7eb',
        selectionBackground: '#47556980',
      },
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(container.current)
    terminalRef.current = terminal
    const title = terminal.onTitleChange((value) => onTitle(value.trim().slice(0, 80) || 'Shell'))
    function fail(reason: unknown) {
      if (!disposed) setError(String(reason))
    }
    function resize() {
      if (disposed || !container.current?.clientHeight || !container.current.clientWidth) return
      fit.fit()
      if (ready)
        void invoke('terminal_resize', { cols: terminal.cols, rows: terminal.rows }).catch(fail)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container.current)
    const input = terminal.onData((data) => {
      if (ready) writes = writes.then(() => invoke<void>('terminal_write', { data })).catch(fail)
    })
    async function poll() {
      try {
        const output = await invoke<{ data: number[]; exited: boolean }>('terminal_read')
        if (disposed) return
        if (output.data.length)
          await new Promise<void>((resolve) => terminal.write(new Uint8Array(output.data), resolve))
        if (output.exited) {
          ready = false
          setExited(true)
          return
        }
        timer = setTimeout(() => void poll(), 32)
      } catch (reason) {
        fail(reason)
      }
    }
    // Defer startup so React's development effect replay cannot open two sessions.
    void Promise.resolve()
      .then(async () => {
        if (disposed) return
        resize()
        await invoke('terminal_open', { cols: terminal.cols, rows: terminal.rows })
        if (disposed) {
          await invoke('terminal_close')
          return
        }
        ready = true
        terminal.focus()
        await poll()
      })
      .catch(fail)
    return () => {
      disposed = true
      clearTimeout(timer)
      observer.disconnect()
      input.dispose()
      title.dispose()
      terminalRef.current = null
      terminal.dispose()
      if (ready) void invoke('terminal_close').catch(() => {})
    }
  }, [generation, onTitle])

  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(
      () => terminalRef.current?.focus(),
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 280,
    )
    return () => clearTimeout(timer)
  }, [visible])

  return (
    <div className="relative h-full min-h-0 bg-[#17191d] p-4">
      <div ref={container} className="h-full min-h-0" />
      {(!isTauri() || error || exited) && (
        <div
          role="status"
          className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#17191d] px-8 text-center text-xs text-slate-300"
        >
          <p>
            {!isTauri()
              ? 'Terminal is available in the desktop app.'
              : error
                ? `Unable to connect: ${error}`
                : 'Shell session ended.'}
          </p>
          {isTauri() && (
            <button
              className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 hover:bg-white/15"
              onClick={async () => {
                try {
                  await invoke('terminal_close')
                  setError(null)
                  setExited(false)
                  setGeneration((value) => value + 1)
                } catch (reason) {
                  setError(String(reason))
                }
              }}
            >
              <RotateCcw size={14} />
              Restart terminal
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function TerminalPanel({
  connection,
  workspace,
}: {
  connection: string
  workspace: RefObject<HTMLDivElement | null>
}) {
  const [open, setOpen] = useState(false)
  const [started, setStarted] = useState(false)
  const [height, setHeight] = useState(280)
  const [maxHeight, setMaxHeight] = useState(420)
  const [title, setTitle] = useState('Shell')
  const panel = useRef<HTMLElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const previousHeight = useRef<number | null>(null)
  const workspaceAnimation = useRef<Animation | null>(null)
  useEffect(() => {
    if (!open || started) return
    const timer = setTimeout(
      () => setStarted(true),
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 280,
    )
    return () => clearTimeout(timer)
  }, [open, started])
  useLayoutEffect(() => {
    const element = workspace.current
    const before = previousHeight.current
    previousHeight.current = null
    if (!element || before === null) return
    workspaceAnimation.current?.cancel()
    const after = element.getBoundingClientRect().height
    if (!after || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // FLIP: lay out once, then interpolate the old visual bounds on the compositor.
    workspaceAnimation.current = element.animate(
      [{ transform: `scaleY(${before / after})` }, { transform: 'scaleY(1)' }],
      { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    )
  }, [open, workspace])
  useEffect(() => () => workspaceAnimation.current?.cancel(), [])
  useEffect(() => {
    const parent = panel.current?.parentElement
    if (!parent) return
    const observer = new ResizeObserver(() => {
      const maximum = Math.max(120, Math.floor(parent.clientHeight * 0.65) - 48)
      setMaxHeight(maximum)
      setHeight((value) => Math.min(value, maximum))
    })
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])
  function toggle() {
    previousHeight.current = workspace.current?.getBoundingClientRect().height ?? null
    if (open) trigger.current?.focus()
    setOpen((value) => !value)
  }
  function constrain(value: number) {
    return Math.max(120, Math.min(value, maxHeight))
  }
  return (
    <section ref={panel} aria-label="Terminal" className="talo-terminal shrink-0" data-open={open}>
      <div
        className="talo-terminal-reveal"
        style={{ height: open ? height + 8 : 0 }}
        aria-hidden={!open}
        inert={!open}
      >
        <div
          role="separator"
          aria-label="Resize terminal"
          aria-orientation="horizontal"
          aria-valuemin={120}
          aria-valuemax={maxHeight}
          aria-valuenow={Math.round(height)}
          tabIndex={0}
          className="flex h-2 cursor-row-resize touch-none items-center justify-center hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault()
              setHeight((value) => constrain(value + (event.key === 'ArrowUp' ? 24 : -24)))
            }
          }}
          onPointerDown={(event) => {
            workspaceAnimation.current?.cancel()
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              setHeight(
                constrain(
                  (panel.current?.getBoundingClientRect().bottom ?? 0) - event.clientY - 28,
                ),
              )
          }}
          onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
        >
          <span className="h-0.5 w-8 rounded-full bg-muted-foreground/30" />
        </div>
        <div
          id="talo-terminal-content"
          style={{ height, '--terminal-travel': `${height + 8}px` } as CSSProperties}
          className="talo-terminal-surface overflow-hidden rounded-2xl border border-border/60 bg-[#17191d]"
        >
          <div className="flex h-8 items-center gap-2 border-b border-white/5 bg-white/[0.025] px-4 text-xs text-slate-400">
            <TerminalSquare size={12} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{title}</span>
            <button
              type="button"
              onClick={toggle}
              aria-label="Collapse terminal"
              className="rounded p-1 hover:bg-accent hover:text-foreground"
            >
              <ChevronDown size={14} />
            </button>
          </div>
          <div className="h-[calc(100%-2rem)]">
            {started && <TerminalSession visible={open} onTitle={setTitle} />}
          </div>
        </div>
      </div>
      <footer className="flex h-7 items-center justify-between px-2 text-[11px] text-muted-foreground">
        <span title={`OpenCode · ${connection}`} className="flex items-center gap-2">
          <span
            className={`size-1.5 rounded-full ${connection === 'ready' ? 'bg-emerald-400' : 'bg-muted-foreground/60'}`}
            aria-hidden="true"
          />
          opencode
        </span>
        <button
          ref={trigger}
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="talo-terminal-content"
          aria-label={open ? 'Collapse terminal' : 'Open terminal'}
          title={open ? 'Collapse terminal' : 'Open terminal'}
          className="flex h-6 max-w-48 items-center gap-2 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-expanded:bg-sidebar-accent aria-expanded:text-foreground"
        >
          <span className="flex items-end gap-0.5" aria-hidden="true">
            <span className="h-2 w-0.5 rounded-sm bg-amber-500/80" />
            <span className="h-2 w-0.5 rounded-sm bg-amber-500/55" />
            <span className="h-2 w-0.5 rounded-sm bg-amber-500/30" />
          </span>
          <span className="truncate">{title}</span>
        </button>
      </footer>
    </section>
  )
}
