import { useEffect, useState } from 'react'

const dots = Array.from({ length: 9 }, (_, index) => index)

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
    <li className="chat-thinking-indicator shrink-0">
      <div className="chat-thinking-line">
        <span className="chat-thinking-dots" aria-hidden="true">
          {dots.map((index) => (
            <span key={index} style={{ animationDelay: `${index * 140}ms` }} />
          ))}
        </span>
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
