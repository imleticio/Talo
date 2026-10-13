import { useId } from 'react'
import {
  activitySummary,
  currentActivity,
  isActivityFinished,
  type AgentActivityState,
} from './agent-activity'
import { ActivityDetails, FileActivity, TaskProgress } from './pulse-activity-details'
import { AgentWorkHeader } from './agent-work-header'

export function AgentPulse({
  state,
  cancelling = false,
  onExpandedChange,
}: {
  state: AgentActivityState
  cancelling?: boolean
  onExpandedChange: (expanded: boolean) => void
}) {
  const detailsId = useId()
  const finished = isActivityFinished(state)
  const expanded = state.expanded ?? !finished
  const current = currentActivity(state)
  const label = cancelling && !finished ? 'Stopping' : current.label
  const summary = activitySummary(state)
  const hasActiveAction = state.actions.some(
    (action) => action.state === 'running' || action.state === 'pending',
  )
  const showStatus =
    !finished &&
    (cancelling || state.phase === 'waiting' || (!hasActiveAction && label !== 'Working'))

  return (
    <div className="agent-pulse" data-phase={state.phase} aria-label="Agent activity">
      <AgentWorkHeader
        state={state}
        cancelling={cancelling}
        expanded={expanded}
        detailsId={detailsId}
        onExpandedChange={onExpandedChange}
      />
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {label}
        {!finished && current.path ? ` · ${current.path}` : ''}
      </span>
      <div id={detailsId} hidden={!expanded} className="pulse-details">
        {expanded && (
          <>
            {showStatus && (
              <div className="pulse-current">
                <span>{label}</span>
                {current.detail && <span className="pulse-current-detail">{current.detail}</span>}
              </div>
            )}
            {state.error && (
              <p role="alert" className="text-xs text-destructive">
                {state.error}
              </p>
            )}
            {state.attention.slice(0, -1).map((item) => (
              <p key={item.id} className="text-xs text-muted-foreground">
                {item.title}
                {item.detail ? ` · ${item.detail}` : ''} · Continue in your agent harness
              </p>
            ))}
            {state.tasks.length > 0 && (
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Task progress
                </summary>
                <div className="mt-3">
                  <TaskProgress tasks={state.tasks} finished={finished} />
                </div>
              </details>
            )}
            {state.actions.length > 0 && (
              <ActivityDetails actions={state.actions} finished={finished} />
            )}
            {finished && state.changedFiles.length > 0 && (
              <section aria-label="Changed files" className="space-y-2 text-xs">
                <p className="text-muted-foreground">Files changed</p>
                <ul className="space-y-1">
                  {state.changedFiles.map((path) => (
                    <li key={path}>
                      <FileActivity path={path} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {finished && summary && <p className="pulse-summary">{summary}</p>}
          </>
        )}
      </div>
    </div>
  )
}
