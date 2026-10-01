import type { AgentAction, AgentEvent, AgentTask, AgentTool } from '../../services/agent'

export type AgentActivityState = {
  phase: 'working' | 'waiting' | 'completed' | 'cancelled' | 'failed'
  status: string
  tasks: AgentTask[]
  actions: AgentTool[]
  changedFiles: string[]
  attention: { id: string; title: string; detail: string | null }[]
  error?: string
  startedAt: number
  endedAt?: number
  modelName?: string
  expanded?: boolean
}

export function createAgentActivity(
  startedAt = Date.now(),
  modelName?: string,
): AgentActivityState {
  return {
    phase: 'working',
    status: 'Working',
    tasks: [],
    actions: [],
    changedFiles: [],
    attention: [],
    startedAt,
    modelName,
  }
}

export function isActivityFinished(state: AgentActivityState) {
  return state.phase === 'completed' || state.phase === 'cancelled' || state.phase === 'failed'
}

export function reduceAgentActivity(
  state: AgentActivityState,
  event: AgentEvent,
  now = Date.now(),
): AgentActivityState {
  if (isActivityFinished(state)) return state
  switch (event.type) {
    case 'tool': {
      const existing = state.actions.find((action) => action.id === event.id)
      // Repeated snapshots enrich the same action, never add a second log row.
      if (
        existing &&
        (existing.state === 'completed' || existing.state === 'error') &&
        (event.state === 'pending' || event.state === 'running')
      )
        return state
      const action: AgentTool = { ...event }
      const actions = existing
        ? state.actions.map((item) => (item.id === action.id ? action : item))
        : [...state.actions, action]
      return {
        ...state,
        actions,
        status: 'Working',
        changedFiles: [...new Set([...state.changedFiles, ...event.files])],
      }
    }
    case 'tasks':
      return { ...state, tasks: event.tasks }
    case 'files_changed':
      return { ...state, changedFiles: [...new Set([...state.changedFiles, ...event.files])] }
    case 'status':
      return { ...state, status: event.text }
    case 'attention':
      return {
        ...state,
        phase: 'waiting',
        attention: [...state.attention.filter((item) => item.id !== event.id), event],
      }
    case 'attention_resolved': {
      const attention = state.attention.filter((item) => item.id !== event.id)
      return { ...state, attention, phase: attention.length ? 'waiting' : 'working' }
    }
    case 'delta':
      return { ...state, status: 'Responding' }
    case 'completed':
      return { ...state, phase: 'completed', attention: [], endedAt: now, expanded: false }
    case 'cancelled':
      return { ...state, phase: 'cancelled', attention: [], endedAt: now, expanded: false }
    case 'error':
      return {
        ...state,
        phase: 'failed',
        error: event.message,
        attention: [],
        endedAt: now,
        expanded: false,
      }
    case 'started':
      return state
  }
}

const actionLabels: Record<AgentAction, string> = {
  read: 'Reading',
  search: 'Searching',
  edit: 'Editing',
  write: 'Writing',
  create: 'Creating',
  delete: 'Deleting',
  command: 'Running command',
  tool: 'Using tool',
}

export function actionLabel(action: AgentTool) {
  return action.action === 'tool' ? action.title : actionLabels[action.action]
}

export function currentActivity(state: AgentActivityState) {
  if (isActivityFinished(state))
    return {
      label: { completed: 'Completed', cancelled: 'Cancelled', failed: 'Failed' }[
        state.phase as 'completed' | 'cancelled' | 'failed'
      ],
    }
  const attention = state.attention.at(-1)
  if (attention)
    return { label: attention.title, detail: attention.detail ?? 'Continue in your agent harness' }
  const action =
    state.actions.findLast((item) => item.state === 'running') ??
    state.actions.findLast((item) => item.state === 'pending')
  if (action)
    return {
      label: action.state === 'pending' ? `Queued · ${actionLabel(action)}` : actionLabel(action),
      path: action.path,
      detail:
        action.command ?? (!action.path && action.title !== action.name ? action.title : null),
    }
  return { label: state.status }
}

export function taskProgress(tasks: AgentTask[]) {
  return {
    completed: tasks.filter((task) => task.state === 'completed').length,
    remaining: tasks.filter((task) => task.state === 'pending' || task.state === 'active').length,
    active: tasks.find((task) => task.state === 'active'),
  }
}

export type ActivityGroup = { label: string; actions: AgentTool[] }

export function groupActivity(actions: AgentTool[]): ActivityGroup[] {
  const groups: ActivityGroup[] = []
  for (const action of actions) {
    const label =
      action.action === 'read' || action.action === 'search' ? 'Exploration' : actionLabel(action)
    const last = groups.at(-1)
    if (last?.label === label) last.actions.push(action)
    else groups.push({ label, actions: [action] })
  }
  return groups
}

export function activitySummary(state: AgentActivityState) {
  const parts: string[] = []
  if (state.changedFiles.length)
    parts.push(
      `${state.changedFiles.length} ${state.changedFiles.length === 1 ? 'file' : 'files'} changed`,
    )
  const commands = state.actions.filter((action) => action.command)
  if (
    commands.some(
      (action) => action.state === 'error' || (action.exitCode !== null && action.exitCode !== 0),
    )
  )
    parts.push('Command failed')
  else if (
    commands.length &&
    commands.every((action) => action.state === 'completed' && action.exitCode === 0)
  )
    parts.push(`${commands.length} ${commands.length === 1 ? 'command' : 'commands'} passed`)
  if (!parts.length && state.actions.length) parts.push(`${state.actions.length} actions`)
  return parts.join(' · ')
}
