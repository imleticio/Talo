import { useEffect, useState } from 'react'
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
      {label} {finished ? 'in' : 'for'} {formatElapsed((state.endedAt ?? now) - state.startedAt)}
    </span>
  )
}

export function AgentWorkHeader({
  state,
  cancelling,
}: {
  state: AgentActivityState
  cancelling: boolean
}) {
  const label = isActivityFinished(state)
    ? { completed: 'Completed', cancelled: 'Cancelled', failed: 'Failed' }[
        state.phase as 'completed' | 'cancelled' | 'failed'
      ]
    : cancelling
      ? 'Stopping'
      : state.phase === 'waiting'
        ? 'Waiting'
        : 'Working'
  return (
    <div className="pulse-work-header">
      <span className="font-medium text-foreground">{state.modelName || 'Agent'}</span>
      <ElapsedTime state={state} label={label} />
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {state.modelName || 'Agent'} · {label}
      </span>
    </div>
  )
}
