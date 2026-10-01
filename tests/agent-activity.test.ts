import assert from 'node:assert/strict'
import test from 'node:test'
import {
  activitySummary,
  createAgentActivity,
  currentActivity,
  groupActivity,
  reduceAgentActivity,
  taskProgress,
} from '../src/features/chat/agent-activity.ts'
import {
  createChatWorkspace,
  openChatTab,
  updateChatTab,
} from '../src/features/chat/chat-tabs-state.ts'
import type { AgentEvent, AgentTool } from '../src/services/agent.ts'
import { applyChatAgentUpdate } from '../src/features/chat/chat-agent-update.ts'

function tool(id: string, overrides: Partial<AgentTool> = {}): AgentEvent & AgentTool {
  return {
    type: 'tool',
    id,
    name: 'read',
    action: 'read',
    title: 'Read file',
    state: 'running',
    path: 'src/agent.ts',
    command: null,
    output: null,
    exitCode: null,
    files: [],
    ...overrides,
  }
}

test('structured actions determine the current file; text never guesses an action', () => {
  let state = reduceAgentActivity(createAgentActivity(), {
    type: 'delta',
    text: 'Editing fake.ts and running tests',
  })
  assert.deepEqual(currentActivity(state), { label: 'Responding' })
  state = reduceAgentActivity(state, tool('read'))
  state = reduceAgentActivity(state, { type: 'delta', text: 'I will edit something' })
  assert.equal(currentActivity(state).label, 'Reading')
  assert.equal(currentActivity(state).path, 'src/agent.ts')
  state = reduceAgentActivity(state, tool('read', { state: 'completed' }))
  assert.equal(currentActivity(state).path, undefined)
  state = reduceAgentActivity(state, tool('edit', { action: 'edit', path: 'src/chat.ts' }))
  assert.equal(currentActivity(state).label, 'Editing')
  assert.equal(currentActivity(state).path, 'src/chat.ts')
})

test('tool snapshots deduplicate, retain failure evidence and ignore stale running updates', () => {
  let state = reduceAgentActivity(createAgentActivity(), tool('one'))
  state = reduceAgentActivity(state, tool('one', { state: 'completed', output: 'Read result' }))
  const completed = state
  state = reduceAgentActivity(state, tool('one'))
  assert.equal(state, completed)
  assert.equal(state.actions.length, 1)
  assert.equal(state.actions[0].output, 'Read result')
  state = reduceAgentActivity(state, tool('two', { state: 'error', output: 'Access denied' }))
  assert.equal(state.phase, 'working', 'a failed tool is not necessarily a failed turn')
  assert.equal(state.actions[1].state, 'error')
})

test('parallel tools retain another running action when the newest action finishes', () => {
  let state = reduceAgentActivity(createAgentActivity(), tool('first', { path: 'first.ts' }))
  state = reduceAgentActivity(state, tool('second', { path: 'second.ts' }))
  assert.equal(currentActivity(state).path, 'second.ts')
  state = reduceAgentActivity(state, tool('second', { state: 'completed' }))
  assert.equal(currentActivity(state).path, 'first.ts')
})

test('pending tools are queued and never presented as already running', () => {
  const state = reduceAgentActivity(createAgentActivity(), tool('queued', { state: 'pending' }))
  assert.equal(currentActivity(state).label, 'Queued · Reading')
})

test('attention wins over tools and multiple requests must each be resolved', () => {
  let state = reduceAgentActivity(createAgentActivity(), tool('one'))
  state = reduceAgentActivity(state, {
    type: 'attention',
    id: 'a',
    title: 'Approval required',
    detail: 'edit',
  })
  state = reduceAgentActivity(state, {
    type: 'attention',
    id: 'b',
    title: 'Answer required',
    detail: null,
  })
  state = reduceAgentActivity(state, { type: 'attention_resolved', id: 'a' })
  assert.equal(state.phase, 'waiting')
  assert.equal(currentActivity(state).label, 'Answer required')
  state = reduceAgentActivity(state, { type: 'attention_resolved', id: 'b' })
  assert.equal(state.phase, 'working')
  assert.equal(currentActivity(state).label, 'Reading')
})

test('tasks are replaced by the real plan without inventing completion on turn end', () => {
  let state = reduceAgentActivity(createAgentActivity(), {
    type: 'tasks',
    tasks: [
      { id: '0', label: 'Inspect', state: 'completed' },
      { id: '1', label: 'Implement', state: 'active' },
      { id: '2', label: 'Test', state: 'pending' },
      { id: '3', label: 'Skipped', state: 'cancelled' },
    ],
  })
  assert.deepEqual(taskProgress(state.tasks), {
    completed: 1,
    remaining: 2,
    active: state.tasks[1],
  })
  state = reduceAgentActivity(state, { type: 'completed' })
  assert.equal(state.tasks[1].state, 'active')
  assert.equal(currentActivity(state).label, 'Completed')
})

test('terminal outcomes are final and preserve partial actions and distinct cancellation', () => {
  for (const event of [
    { type: 'completed' },
    { type: 'cancelled' },
    { type: 'error', message: 'Disconnected' },
  ] as AgentEvent[]) {
    let state = reduceAgentActivity(createAgentActivity(), tool('one'))
    state = reduceAgentActivity(state, event)
    const ended = state
    assert.equal(reduceAgentActivity(state, tool('late')), ended)
    assert.equal(state.actions.length, 1)
    assert.equal(state.phase, event.type === 'error' ? 'failed' : event.type)
    assert.equal(currentActivity(state).path, undefined)
  }
})

test('changed files are confirmed and deduplicated; commands only pass with known exit code', () => {
  let state = reduceAgentActivity(
    createAgentActivity(),
    tool('edit', { action: 'edit', path: 'file.ts' }),
  )
  assert.deepEqual(state.changedFiles, [])
  state = reduceAgentActivity(
    state,
    tool('edit', { action: 'edit', state: 'completed', files: ['file.ts'] }),
  )
  state = reduceAgentActivity(state, { type: 'files_changed', files: ['file.ts', 'other.ts'] })
  state = reduceAgentActivity(
    state,
    tool('cmd', { action: 'command', command: 'npm test', state: 'completed' }),
  )
  assert.equal(activitySummary(state), '2 files changed')
  state = reduceAgentActivity(
    state,
    tool('cmd', { action: 'command', command: 'npm test', state: 'completed', exitCode: 0 }),
  )
  assert.equal(activitySummary(state), '2 files changed · 1 command passed')
  state = reduceAgentActivity(
    state,
    tool('bad', { action: 'command', command: 'npm test', state: 'completed', exitCode: 1 }),
  )
  assert.equal(activitySummary(state), '2 files changed · Command failed')
})

test('past exploration compresses consecutive actions without losing their inspection details', () => {
  const groups = groupActivity([
    tool('read'),
    tool('grep', { action: 'search' }),
    tool('edit', { action: 'edit' }),
    tool('read-again'),
  ])
  assert.deepEqual(
    groups.map((group) => [group.label, group.actions.length]),
    [
      ['Exploration', 2],
      ['Editing', 1],
      ['Exploration', 1],
    ],
  )
})

test('turns stay isolated across background tabs, split panel selection and subsequent turns', () => {
  let workspace = createChatWorkspace()
  const first = workspace.activeTabId
  workspace = updateChatTab(workspace, first, {
    turnActivity: { 'turn-a': reduceAgentActivity(createAgentActivity(), tool('a')) },
  })
  workspace = openChatTab(workspace)
  const second = workspace.activeTabId
  workspace = updateChatTab(workspace, second, {
    turnActivity: {
      'turn-b': reduceAgentActivity(
        createAgentActivity(),
        tool('b', { action: 'edit', path: 'b.ts' }),
      ),
    },
  })
  workspace = updateChatTab(workspace, first, (tab) => ({
    turnActivity: {
      ...tab.turnActivity,
      'turn-a': reduceAgentActivity(tab.turnActivity['turn-a'], { type: 'cancelled' }),
      'next-turn': createAgentActivity(),
    },
  }))
  assert.equal(workspace.activeTabId, second)
  assert.equal(workspace.tabs[0].turnActivity['turn-a'].phase, 'cancelled')
  assert.equal(workspace.tabs[0].turnActivity['next-turn'].actions.length, 0)
  assert.equal(currentActivity(workspace.tabs[1].turnActivity['turn-b']).path, 'b.ts')
  assert.equal(workspace.tabs[1].turnActivity['turn-a'], undefined)
})

test('actual turn transitions preserve streaming text, reject foreign and late updates, and retain history', () => {
  let workspace = createChatWorkspace()
  const tabId = workspace.activeTabId
  workspace = updateChatTab(workspace, tabId, { conversationId: 'chat-a' })
  const update = (event: AgentEvent, messageId = 'reply-a', conversationId = 'chat-a') => {
    workspace = updateChatTab(workspace, tabId, (tab) =>
      applyChatAgentUpdate(tab, { event, messageId, conversationId }),
    )
    return workspace.tabs[0]
  }
  update({ type: 'started' })
  update({ type: 'delta', text: 'Hello ' })
  update(tool('read'))
  update({ type: 'started' })
  update({ type: 'delta', text: 'wrong' }, 'other-reply')
  update(tool('wrong'), 'reply-a', 'other-conversation')
  let tab = update({ type: 'delta', text: 'world' })
  assert.equal(tab.live?.text, 'Hello world')
  assert.equal(tab.turnActivity['reply-a'].actions.length, 1)
  tab = update({ type: 'cancelled' })
  assert.equal(tab.turnActivity['reply-a'].phase, 'cancelled')
  assert.equal(tab.live?.text, 'Hello world')
  tab = update({ type: 'delta', text: 'late' })
  assert.equal(tab.live?.text, 'Hello world')
  tab = update({ type: 'started' }, 'reply-next')
  assert.equal(tab.live?.text, '')
  assert.equal(tab.turnActivity['reply-a'].phase, 'cancelled')
  assert.equal(tab.turnActivity['reply-next'].actions.length, 0)
})
