import { useEffect, useState } from 'react'

export function ChatThinking({ cancelling, tool }: { cancelling: boolean; tool: string | null }) {
  const [startedAt] = useState(() => performance.now())
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = window.setInterval(() => {
      setElapsed(Math.floor((performance.now() - startedAt) / 1000))
    }, 1000)
    return () => window.clearInterval(interval)
  }, [startedAt])

  const duration = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`

  return (
    <li className="chat-thinking-indicator shrink-0" data-cancelling={cancelling}>
      <div className="chat-thinking-line">
        <svg
          className="chat-thinking-mark"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M4 6h3a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 1 1 0 0 1 1 1v7M20 6h-3a2 2 0 0 0-2 2v2a2 2 0 0 1-2 2 1 1 0 0 0-1 1" />
        </svg>
        <span className="chat-thinking-label" role="status">
          {cancelling ? 'Deteniendo…' : 'Pensando…'}
        </span>
        <span className="chat-thinking-elapsed" aria-hidden="true">
          {duration}
        </span>
      </div>
      {tool && !cancelling && <p className="chat-thinking-tool">Usando {tool}</p>}
    </li>
  )
}
