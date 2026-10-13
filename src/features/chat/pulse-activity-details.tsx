import {
  BookOpen,
  Check,
  ChevronRight,
  Circle,
  Minus,
  Pencil,
  Terminal,
  Wrench,
  X,
} from 'lucide-react'
import type { AgentTask, AgentTool } from '@/services/agent'
import { actionLabel, groupActivity, taskProgress, type ActivityGroup } from './agent-activity'

export function FileActivity({ path }: { path: string }) {
  const separator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return (
    <span className="pulse-file" title={path}>
      <span className="pulse-directory">{path.slice(0, separator + 1)}</span>
      <span className="pulse-filename">{path.slice(separator + 1)}</span>
    </span>
  )
}

function GroupSummary({ group, finished }: { group: ActivityGroup; finished: boolean }) {
  const first = group.actions[0]
  const Icon =
    group.label === 'Exploration'
      ? BookOpen
      : first.action === 'command'
        ? Terminal
        : ['edit', 'write', 'create', 'delete'].includes(first.action)
          ? Pencil
          : Wrench
  const completedLabels = {
    read: 'Read',
    search: 'Searched',
    edit: 'Edited',
    write: 'Wrote',
    create: 'Created',
    delete: 'Deleted',
    command: 'Ran command',
    tool: first.title,
  }
  const running = !finished && group.actions.some((action) => action.state === 'running')
  const pending = !finished && group.actions.some((action) => action.state === 'pending')
  const label =
    group.actions.length === 1
      ? first.state === 'completed'
        ? completedLabels[first.action]
        : first.state === 'pending'
          ? finished
            ? `Not run · ${actionLabel(first)}`
            : `Queued · ${actionLabel(first)}`
          : finished && first.state === 'running'
            ? `Interrupted · ${actionLabel(first)}`
            : actionLabel(first)
      : group.label === 'Exploration'
        ? running || pending
          ? 'Exploring repository'
          : 'Repository exploration'
        : group.label
  const failed = group.actions.some(
    (action) => action.state === 'error' || (action.exitCode !== null && action.exitCode !== 0),
  )

  return (
    <>
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span className={`pulse-group-label ${running ? 'text-foreground' : ''}`}>
        {label}
        {group.actions.length === 1 && first.path && (
          <>
            {' '}
            <FileActivity path={first.path} />
          </>
        )}
        {group.actions.length > 1 && <span> · {group.actions.length} actions</span>}
      </span>
      {failed && <span className="text-destructive">Failed</span>}
      <ChevronRight className="pulse-group-chevron size-3 shrink-0" aria-hidden="true" />
    </>
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
    <section aria-label="Agent actions" className="pulse-action-groups">
      {groupActivity(actions).map((group, index) => (
        <details key={`${index}-${group.label}`} className="pulse-group">
          <summary className="pulse-group-toggle">
            <GroupSummary group={group} finished={finished} />
          </summary>
          <ol className="pulse-group-actions">
            {group.actions.map((action) => (
              <ToolActivity key={action.id} action={action} finished={finished} />
            ))}
          </ol>
        </details>
      ))}
    </section>
  )
}
