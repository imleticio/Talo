import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { AgentActivityState } from './agent-activity'
import { isActivityFinished } from './agent-activity'
import { formatElapsed } from './elapsed-time'

function ElapsedTime({ state, label }: { state: AgentActivityState; label: string }) {
  const [now, setNow] = useState(Date.now)
  const finished = isActivityFinished(state)
  useEffect(() => {
    if (finished) return
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [finished, state.startedAt])
  return (
    <span
      aria-hidden="true"
      className={`pulse-work-time ${state.phase === 'working' && label === 'Working' ? 'pulse-working' : ''}`}
    >
      {label} {finished && state.phase !== 'completed' ? 'in' : 'for'}{' '}
      {formatElapsed((state.endedAt ?? now) - state.startedAt)}
    </span>
  )
}

export function AgentWorkHeader({
  state,
  cancelling,
  expanded,
  detailsId,
  onExpandedChange,
}: {
  state: AgentActivityState
  cancelling: boolean
  expanded: boolean
  detailsId: string
  onExpandedChange: (expanded: boolean) => void
}) {
  const label = isActivityFinished(state)
    ? { completed: 'Worked', cancelled: 'Cancelled', failed: 'Failed' }[
        state.phase as 'completed' | 'cancelled' | 'failed'
      ]
    : cancelling
      ? 'Stopping'
      : state.phase === 'waiting'
        ? 'Waiting'
        : 'Working'
  return (
    <div className="pulse-work-header">
      <button
        type="button"
        className="pulse-header-toggle"
        aria-label={expanded ? 'Collapse agent activity' : 'Inspect agent activity'}
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={() => onExpandedChange(!expanded)}
      >
        <ChevronRight
          className={`size-3 shrink-0 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
        <span className="pulse-model-name">{state.modelName || 'Agent'}</span>
        <ElapsedTime state={state} label={label} />
      </button>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {state.modelName || 'Agent'} · {label}
      </span>
    </div>
  )
}
