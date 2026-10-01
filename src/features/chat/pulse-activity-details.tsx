import { Check, Circle, Minus, X } from 'lucide-react'
import type { AgentTask, AgentTool } from '@/services/agent'
import { actionLabel, groupActivity, taskProgress } from './agent-activity'

export function FileActivity({ path }: { path: string }) {
  const separator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return (
    <span className="pulse-file" title={path}>
      <span className="pulse-directory">{path.slice(0, separator + 1)}</span>
      <span className="pulse-filename font-medium text-foreground">
        {path.slice(separator + 1)}
      </span>
    </span>
  )
}

export function ActivityMark({ state }: { state: string }) {
  const Icon =
    state === 'completed'
      ? Check
      : state === 'error' || state === 'failed'
        ? X
        : state === 'cancelled'
          ? Minus
          : Circle
  return (
    <Icon
      aria-hidden="true"
      className={`size-3 shrink-0 ${state === 'error' || state === 'failed' ? 'text-destructive' : state === 'active' || state === 'running' ? 'fill-current text-foreground' : 'text-muted-foreground'}`}
    />
  )
}

export function TaskProgress({ tasks, finished }: { tasks: AgentTask[]; finished: boolean }) {
  const progress = taskProgress(tasks)
  return (
    <section aria-label="Task progress" className="pulse-task-list">
      <div className="mb-2 flex justify-between text-xs text-muted-foreground">
        <span>Task progress</span>
        <span>
          {progress.completed} / {tasks.length}
        </span>
      </div>
      <ol className="space-y-2">
        {tasks.map((task) => (
          <li
            key={task.id}
            className={`flex items-start gap-2 text-xs ${task.state === 'active' && !finished ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
          >
            <span className="pt-0.5">
              <ActivityMark
                state={finished && task.state === 'active' ? 'cancelled' : task.state}
              />
            </span>
            <span className="min-w-0 wrap-break-word">
              {task.label}
              {finished && task.state === 'active' ? ' · Incomplete' : ''}
              {task.state === 'cancelled' ? ' · Cancelled' : ''}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function ToolActivity({ action, finished }: { action: AgentTool; finished: boolean }) {
  const interrupted = finished && (action.state === 'running' || action.state === 'pending')
  return (
    <li className="pulse-action">
      <ActivityMark state={interrupted ? 'cancelled' : action.state} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span>
            {actionLabel(action)}
            {interrupted
              ? action.state === 'pending'
                ? ' · Not run'
                : ' · Interrupted'
              : action.state === 'pending'
                ? ' · Pending'
                : ''}
          </span>
          {action.path && <FileActivity path={action.path} />}
        </div>
        {action.command && <code className="pulse-command">{action.command}</code>}
        {action.exitCode !== null && (
          <span className="text-muted-foreground">Exit {action.exitCode}</span>
        )}
        {action.output && (
          <details className="mt-1">
            <summary className="cursor-pointer text-muted-foreground">
              {action.state === 'error' ? 'Inspect error' : 'Inspect output'}
            </summary>
            <pre className="pulse-output">{action.output}</pre>
          </details>
        )}
      </div>
    </li>
  )
}

export function ActivityDetails({
  actions,
  finished,
}: {
  actions: AgentTool[]
  finished: boolean
}) {
  return (
    <section aria-label="Agent actions" className="space-y-3">
      {groupActivity(actions).map((group, index) => (
        <details key={`${index}-${group.label}`} className="pulse-group">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {group.label}{' '}
            <span className="ml-1">
              · {group.actions.length} {group.actions.length === 1 ? 'action' : 'actions'}
            </span>
            {group.actions.some(
              (action) =>
                action.state === 'error' || (action.exitCode !== null && action.exitCode !== 0),
            ) && <span className="ml-2 text-destructive">Failed</span>}
          </summary>
          <ol className="mt-3 space-y-3">
            {group.actions.map((action) => (
              <ToolActivity key={action.id} action={action} finished={finished} />
            ))}
          </ol>
        </details>
      ))}
    </section>
  )
}
