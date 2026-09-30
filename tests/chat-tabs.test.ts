import assert from 'node:assert/strict'
import test from 'node:test'
import {
  chatWorkspacePreference,
  closeChatTab,
  createChatWorkspace,
  openChatTab,
  restoreChatWorkspace,
  updateChatTab,
} from '../src/features/chat/chat-tabs-state.ts'

function conversation(id: string) {
  return {
    id,
    title: `Chat ${id}`,
    projectId: null,
    lastProviderId: null,
    lastModelId: null,
    createdAt: '',
    updatedAt: '',
  }
}

test('reopening a conversation activates its existing tab and preserves the draft', () => {
  let workspace = openChatTab(createChatWorkspace(), conversation('a'))
  const a = workspace.activeTabId
  workspace = updateChatTab(workspace, a, { draft: 'Unsent message' })
  workspace = openChatTab(workspace, conversation('b'))
  workspace = openChatTab(workspace, conversation('a'))
  assert.equal(workspace.tabs.length, 3)
  assert.equal(workspace.activeTabId, a)
  assert.equal(workspace.tabs.find((tab) => tab.id === a)?.draft, 'Unsent message')
})

test('separate new chats retain independent unsent drafts', () => {
  let workspace = createChatWorkspace()
  const first = workspace.activeTabId
  workspace = updateChatTab(workspace, first, { draft: 'First draft' })
  workspace = openChatTab(workspace)
  workspace = updateChatTab(workspace, workspace.activeTabId, { draft: 'Second draft' })
  assert.deepEqual(
    workspace.tabs.map((tab) => tab.draft),
    ['First draft', 'Second draft'],
  )
  assert.notEqual(workspace.tabs[0].id, workspace.tabs[1].id)
})

test('background updates target their originating tab without changing selection', () => {
  let workspace = openChatTab(createChatWorkspace(), conversation('a'))
  const a = workspace.activeTabId
  workspace = updateChatTab(workspace, a, {
    activity: 'sending',
    live: { messageId: 'reply-a', text: '', tool: null },
  })
  workspace = openChatTab(workspace, conversation('b'))
  const b = workspace.activeTabId
  workspace = updateChatTab(workspace, b, { draft: 'Draft B' })
  workspace = updateChatTab(workspace, a, (tab) => ({
    live: { ...tab.live!, text: 'Background reply A' },
  }))
  assert.equal(workspace.activeTabId, b)
  assert.equal(workspace.tabs.find((tab) => tab.id === a)?.live?.text, 'Background reply A')
  assert.equal(workspace.tabs.find((tab) => tab.id === b)?.draft, 'Draft B')
  assert.equal(workspace.tabs.find((tab) => tab.id === b)?.live, null)
})

test('running tabs cannot close until their operation settles', () => {
  let workspace = createChatWorkspace()
  const id = workspace.activeTabId
  for (const activity of ['connecting', 'sending', 'cancelling'] as const) {
    workspace = updateChatTab(workspace, id, { activity })
    assert.equal(closeChatTab(workspace, id), workspace)
  }
  workspace = updateChatTab(workspace, id, { activity: 'idle' })
  assert.notEqual(closeChatTab(workspace, id).activeTabId, id)
})

test('closing selects the adjacent chat, leaves other drafts intact, and keeps one tab', () => {
  let workspace = openChatTab(createChatWorkspace(), conversation('a'))
  const a = workspace.activeTabId
  workspace = updateChatTab(workspace, a, { draft: 'Keep this' })
  workspace = openChatTab(workspace, conversation('b'))
  workspace = closeChatTab(workspace, workspace.activeTabId)
  assert.equal(workspace.activeTabId, a)
  assert.equal(workspace.tabs.at(-1)?.draft, 'Keep this')
  workspace = closeChatTab(workspace, workspace.tabs[0].id)
  assert.equal(workspace.activeTabId, a)
  workspace = closeChatTab(workspace, a)
  assert.equal(workspace.tabs.length, 1)
  assert.equal(workspace.tabs[0].conversationId, null)
  assert.equal(workspace.tabs[0].draft, '')
})

test('late results for closed tabs are ignored and cannot recreate them', () => {
  let workspace = openChatTab(createChatWorkspace(), conversation('a'))
  const closedId = workspace.activeTabId
  workspace = closeChatTab(workspace, closedId)
  assert.equal(updateChatTab(workspace, closedId, { draft: 'Late result' }), workspace)
})

test('restore ignores deleted and duplicate chats and restores the selected saved chat', () => {
  const workspace = restoreChatWorkspace(
    [conversation('a'), conversation('b')],
    { conversationIds: ['a', 'deleted', null, 'a', 'b'], activeConversationId: 'b' },
    null,
  )
  assert.deepEqual(
    workspace.tabs.map((tab) => tab.conversationId),
    ['a', 'b'],
  )
  assert.equal(workspace.tabs.find((tab) => tab.id === workspace.activeTabId)?.conversationId, 'b')
  assert.ok(workspace.tabs.every((tab) => !tab.historyLoaded))
})

test('preferences retain saved tabs and migrate the previous single-chat preference', () => {
  let workspace = restoreChatWorkspace([conversation('a')], null, 'a')
  assert.deepEqual(chatWorkspacePreference(workspace), {
    conversationIds: ['a'],
    activeConversationId: 'a',
  })
  workspace = openChatTab(workspace)
  assert.deepEqual(chatWorkspacePreference(workspace), {
    conversationIds: ['a'],
    activeConversationId: null,
  })
  assert.equal(restoreChatWorkspace([], { conversationIds: [] }, 'a').tabs.length, 1)
})
