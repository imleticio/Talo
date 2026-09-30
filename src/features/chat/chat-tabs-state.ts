import type { Conversation, Message } from '@/services/persistence'

export type ChatActivity = 'idle' | 'connecting' | 'sending' | 'cancelling'
export type LiveReply = { messageId: string; text: string; tool: string | null }

export type ChatTab = {
  id: string
  conversationId: string | null
  title: string
  draft: string
  messages: Message[]
  live: LiveReply | null
  activity: ChatActivity
  loadingHistory: boolean
  historyLoaded: boolean
  sessionReady: boolean
  sessionMissing: boolean
  error: string | null
}

export type ChatWorkspace = { tabs: ChatTab[]; activeTabId: string }

export function createChatTab(conversation?: Conversation): ChatTab {
  return {
    id: crypto.randomUUID(),
    conversationId: conversation?.id ?? null,
    title: conversation?.title ?? 'New chat',
    draft: '',
    messages: [],
    live: null,
    activity: 'idle',
    loadingHistory: false,
    historyLoaded: !conversation,
    sessionReady: false,
    sessionMissing: false,
    error: null,
  }
}

export function createChatWorkspace(): ChatWorkspace {
  const tab = createChatTab()
  return { tabs: [tab], activeTabId: tab.id }
}

export function updateChatTab(
  workspace: ChatWorkspace,
  id: string,
  update: Partial<ChatTab> | ((tab: ChatTab) => Partial<ChatTab>),
): ChatWorkspace {
  if (!workspace.tabs.some((tab) => tab.id === id)) return workspace
  return {
    ...workspace,
    tabs: workspace.tabs.map((tab) =>
      tab.id === id ? { ...tab, ...(typeof update === 'function' ? update(tab) : update) } : tab,
    ),
  }
}

export function openChatTab(workspace: ChatWorkspace, conversation?: Conversation): ChatWorkspace {
  const existing = conversation
    ? workspace.tabs.find((tab) => tab.conversationId === conversation.id)
    : undefined
  if (existing) return { ...workspace, activeTabId: existing.id }
  const tab = createChatTab(conversation)
  return { tabs: [...workspace.tabs, tab], activeTabId: tab.id }
}

export function closeChatTab(workspace: ChatWorkspace, id: string): ChatWorkspace {
  const index = workspace.tabs.findIndex((tab) => tab.id === id)
  if (index < 0 || workspace.tabs[index].activity !== 'idle') return workspace
  const tabs = workspace.tabs.filter((tab) => tab.id !== id)
  if (!tabs.length) return createChatWorkspace()
  return {
    tabs,
    activeTabId:
      workspace.activeTabId === id
        ? tabs[Math.min(index, tabs.length - 1)].id
        : workspace.activeTabId,
  }
}

export function restoreChatWorkspace(
  conversations: Conversation[],
  saved: unknown,
  legacyActiveId: string | null,
): ChatWorkspace {
  const preference = saved as { conversationIds?: unknown; activeConversationId?: unknown } | null
  const ids =
    preference && Array.isArray(preference.conversationIds)
      ? preference.conversationIds.filter((id): id is string => typeof id === 'string')
      : legacyActiveId
        ? [legacyActiveId]
        : []
  const tabs = [...new Set(ids)].flatMap((id) => {
    const conversation = conversations.find((item) => item.id === id)
    return conversation ? [createChatTab(conversation)] : []
  })
  if (!tabs.length) return createChatWorkspace()
  const active = tabs.find(
    (tab) => tab.conversationId === (preference?.activeConversationId ?? legacyActiveId),
  )
  return { tabs, activeTabId: (active ?? tabs[0]).id }
}

export function chatWorkspacePreference(workspace: ChatWorkspace) {
  return {
    conversationIds: workspace.tabs.flatMap((tab) =>
      tab.conversationId ? [tab.conversationId] : [],
    ),
    activeConversationId:
      workspace.tabs.find((tab) => tab.id === workspace.activeTabId)?.conversationId ?? null,
  }
}
