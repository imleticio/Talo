import { useId } from 'react'
import { Check, ChevronDown, Circle, Minus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  const summaryLabel =
    state.phase === 'completed' &&
    state.actions.length > 0 &&
    state.actions.every((action) => action.action === 'read' || action.action === 'search')
      ? 'Inspected repository'
      : 'Activity'
  const pastActions = finished
    ? state.actions
    : state.actions.filter((action) => action.state === 'completed' || action.state === 'error')
  const hasInspectionDetails = Boolean(
    state.error ||
    state.attention.length > 1 ||
    state.tasks.length ||
    pastActions.length ||
    (finished && state.changedFiles.length),
  )
  const Icon =
    state.phase === 'completed'
      ? Check
      : state.phase === 'cancelled'
        ? Minus
        : state.phase === 'failed'
          ? X
          : Circle

  return (
    <div className="agent-pulse" data-phase={state.phase} aria-label="Agent activity">
      <AgentWorkHeader state={state} cancelling={cancelling} />
      <div className="pulse-current-row">
        <Icon
          className={`pulse-mark size-3.5 shrink-0 ${state.phase === 'working' && !cancelling ? 'pulse-mark-active fill-current' : ''}`}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1" role="status" aria-live="polite" aria-atomic="true">
          <div id={`${detailsId}-current`} className="pulse-current">
            <span className="text-xs font-medium">{finished ? summaryLabel : label}</span>
            {!finished && expanded && current.path && <FileActivity path={current.path} />}
            {!finished && expanded && current.detail && (
              <span className="pulse-current-detail">{current.detail}</span>
            )}
            {finished && summary && <span className="pulse-summary"> · {summary}</span>}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="pulse-expand shrink-0 text-muted-foreground"
          aria-label={expanded ? 'Collapse agent activity' : 'Inspect agent activity'}
          aria-expanded={expanded}
          aria-controls={`${detailsId}-current${expanded && hasInspectionDetails ? ` ${detailsId}` : ''}`}
          onClick={() => onExpandedChange(!expanded)}
        >
          <ChevronDown
            className={`size-3.5 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </Button>
      </div>
      {expanded && hasInspectionDetails && (
        <div id={detailsId} className="pulse-details">
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
          {pastActions.length > 0 && <ActivityDetails actions={pastActions} finished={finished} />}
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
        </div>
      )}
    </div>
  )
}
