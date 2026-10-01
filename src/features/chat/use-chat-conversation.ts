import { useCallback, useEffect, useRef, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import {
  onAgentUpdate,
  opencodeCancel,
  opencodeCreateSession,
  opencodeGetSession,
  opencodeModels,
  opencodeSendMessage,
  opencodeStatus,
  type AgentInfo,
  type AgentModel,
  type AgentModelChoice,
} from '@/services/agent'
import { toAppError, type AppError } from '@/services/errors'
import {
  createConversation,
  deleteConversation,
  listConversations,
  listMessages,
  type Conversation,
} from '@/services/persistence'
import {
  chatWorkspacePreference,
  closeChatTab,
  createChatWorkspace,
  openChatTab,
  restoreChatWorkspace,
  updateChatTab,
  type ChatTab,
  type ChatWorkspace,
} from './chat-tabs-state'

const ACTIVE_CHAT_KEY = 'talo.active-chat-id'
const CHAT_TABS_KEY = 'talo.chat-tabs'
const MODEL_KEY = 'talo.opencode-model'
const FAVORITES_KEY = 'talo.opencode-favorite-models'

type Connection = 'checking' | 'not_installed' | 'stopped' | 'connecting' | 'ready' | 'error'
type TabRuntime = {
  busy: boolean
  runId: string | null
  unboundId: string | null
  sync: number
  history: number
}

function savedWorkspace(conversations: Conversation[]) {
  try {
    return restoreChatWorkspace(
      conversations,
      JSON.parse(localStorage.getItem(CHAT_TABS_KEY) ?? 'null'),
      localStorage.getItem(ACTIVE_CHAT_KEY),
    )
  } catch {
    return createChatWorkspace()
  }
}

function rememberWorkspace(workspace: ChatWorkspace) {
  try {
    const preference = chatWorkspacePreference(workspace)
    localStorage.setItem(CHAT_TABS_KEY, JSON.stringify(preference))
    if (preference.activeConversationId)
      localStorage.setItem(ACTIVE_CHAT_KEY, preference.activeConversationId)
    else localStorage.removeItem(ACTIVE_CHAT_KEY)
  } catch {
    // The conversation remains accessible from SQLite even if this preference fails.
  }
}

function savedModel(): AgentModelChoice | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(MODEL_KEY) ?? 'null')
    if (value && typeof value === 'object') {
      const model = value as Partial<AgentModelChoice>
      if (typeof model.providerId === 'string' && typeof model.modelId === 'string') {
        return {
          providerId: model.providerId,
          modelId: model.modelId,
          variant: typeof model.variant === 'string' ? model.variant : null,
        }
      }
    }
  } catch {
    // Preferences are optional; the server chooses its default model.
  }
  return null
}

function savedFavorites(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]')
    if (Array.isArray(value))
      return value.filter((item): item is string => typeof item === 'string')
  } catch {
    // Favorite models remain optional when local storage is unavailable.
  }
  return []
}

function errorMessage(reason: unknown): string {
  const error = toAppError(reason)
  switch (error.kind) {
    case 'not_installed':
      return 'OpenCode is not installed or is not available on PATH.'
    case 'connection_refused':
    case 'unavailable':
    case 'process_exited':
      return `Could not reach OpenCode. ${error.message}`
    case 'timeout':
      return 'OpenCode timed out. Check that it is running, then try again.'
    case 'session_not_found':
      return 'This OpenCode session is no longer available. Start a new chat to continue.'
    case 'not_found':
      return 'This conversation has no OpenCode session. Start a new chat to continue.'
    default:
      return error.message
  }
}

function conversationTitle(text: string) {
  return text.split('\n', 1)[0].trim().slice(0, 72) || 'New chat'
}

export function useChatConversation() {
  const [connection, setConnection] = useState<Connection>('checking')
  const [info, setInfo] = useState<AgentInfo | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [workspace, setWorkspace] = useState(createChatWorkspace)
  const [listenerReady, setListenerReady] = useState(false)
  const [listenerAttempt, setListenerAttempt] = useState(0)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteErrorId, setDeleteErrorId] = useState<string | null>(null)
  const [models, setModels] = useState<AgentModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<AgentModelChoice | null>(savedModel)
  const [favoriteModels, setFavoriteModels] = useState<string[]>(savedFavorites)

  const workspaceRef = useRef(workspace)
  const initialWorkspace = useRef(workspace)
  const runtimes = useRef(new Map<string, TabRuntime>())
  const deletingRef = useRef(false)
  const modelsRequest = useRef(0)
  const conversationsRequest = useRef(0)

  const changeWorkspace = useCallback((update: (current: ChatWorkspace) => ChatWorkspace) => {
    const previous = workspaceRef.current
    const next = update(previous)
    if (next === previous) return
    workspaceRef.current = next
    setWorkspace(next)
    if (
      JSON.stringify(chatWorkspacePreference(previous)) !==
      JSON.stringify(chatWorkspacePreference(next))
    )
      rememberWorkspace(next)
  }, [])

  const patchTab = useCallback(
    (id: string, update: Partial<ChatTab> | ((tab: ChatTab) => Partial<ChatTab>)) => {
      changeWorkspace((current) => updateChatTab(current, id, update))
    },
    [changeWorkspace],
  )

  const runtimeFor = useCallback((tabId: string) => {
    let runtime = runtimes.current.get(tabId)
    if (!runtime) {
      runtime = { busy: false, runId: null, unboundId: null, sync: 0, history: 0 }
      runtimes.current.set(tabId, runtime)
    }
    return runtime
  }, [])

  const activeTab = workspace.tabs.find((tab) => tab.id === workspace.activeTabId)!
  const activeId = activeTab.conversationId

  const loadModels = useCallback(async () => {
    const request = ++modelsRequest.current
    setModelsLoading(true)
    setModelsError(null)
    try {
      const available = await opencodeModels()
      if (request !== modelsRequest.current) return
      setModels(available)
      setSelectedModel((current) => {
        if (!current) return null
        const model = available.find(
          (item) => item.providerId === current.providerId && item.modelId === current.modelId,
        )
        return model
          ? {
              ...current,
              variant:
                current.variant && model.variants.includes(current.variant)
                  ? current.variant
                  : null,
            }
          : null
      })
      setInfo((current) => current && { ...current, available: true })
      setConnection('ready')
    } catch (reason) {
      if (request !== modelsRequest.current) return
      setModelsError(errorMessage(reason))
      setConnection(toAppError(reason).kind === 'not_installed' ? 'not_installed' : 'error')
    } finally {
      if (request === modelsRequest.current) setModelsLoading(false)
    }
  }, [])

  useEffect(() => {
    try {
      if (selectedModel) localStorage.setItem(MODEL_KEY, JSON.stringify(selectedModel))
      else localStorage.removeItem(MODEL_KEY)
    } catch {
      // The selected model still works for this run without a saved preference.
    }
  }, [selectedModel])

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoriteModels))
    } catch {
      // Favorite models still work for this run without a saved preference.
    }
  }, [favoriteModels])

  const syncMessages = useCallback(
    async (tabId: string, conversationId: string) => {
      const runtime = runtimeFor(tabId)
      const request = ++runtime.sync
      const saved = await listMessages(conversationId)
      if (runtime.sync === request) patchTab(tabId, { messages: saved })
      return saved
    },
    [patchTab, runtimeFor],
  )

  const syncConversations = useCallback(async () => {
    const request = ++conversationsRequest.current
    const saved = await listConversations()
    if (conversationsRequest.current === request) setConversations(saved)
  }, [])

  const loadTab = useCallback(
    async (tabId: string) => {
      const tab = workspaceRef.current.tabs.find((item) => item.id === tabId)
      if (!tab?.conversationId || tab.loadingHistory || runtimeFor(tabId).busy) return
      const id = tab.conversationId
      const runtime = runtimeFor(tabId)
      const request = ++runtime.history
      patchTab(tabId, { loadingHistory: true, error: null })
      try {
        await syncMessages(tabId, id)
        await opencodeGetSession(id)
        if (runtime.history === request) {
          patchTab(tabId, { sessionReady: true, sessionMissing: false })
          setConnection('ready')
        }
      } catch (reason) {
        if (runtime.history === request) {
          const failure = toAppError(reason)
          patchTab(tabId, {
            sessionReady: false,
            sessionMissing: failure.kind === 'not_found' || failure.kind === 'session_not_found',
            error: errorMessage(failure),
          })
        }
      } finally {
        if (runtime.history === request)
          patchTab(tabId, { loadingHistory: false, historyLoaded: true })
      }
    },
    [patchTab, runtimeFor, syncMessages],
  )

  const selectTab = useCallback(
    (tabId: string) => {
      const tab = workspaceRef.current.tabs.find((item) => item.id === tabId)
      if (!tab) return
      changeWorkspace((current) => ({ ...current, activeTabId: tabId }))
      if (!tab.historyLoaded) void loadTab(tabId)
    },
    [changeWorkspace, loadTab],
  )

  function openConversation(id: string) {
    if (deletingRef.current) return
    const conversation = conversations.find((item) => item.id === id)
    if (!conversation) return
    changeWorkspace((current) => openChatTab(current, conversation))
    selectTab(workspaceRef.current.activeTabId)
  }

  useEffect(() => {
    if (!isTauri()) {
      return
    }
    let mounted = true
    void opencodeStatus()
      .then((status) => {
        if (!mounted) return
        setInfo(status)
        setConnection(status.available ? 'ready' : status.installed ? 'stopped' : 'not_installed')
        if (status.installed || status.available) void loadModels()
      })
      .catch((reason) => {
        if (mounted) {
          setConnection('error')
          setConnectionError(errorMessage(reason))
        }
      })
    const request = ++conversationsRequest.current
    void listConversations()
      .then((saved) => {
        if (!mounted || conversationsRequest.current !== request) return
        setConversations(saved)
        if (workspaceRef.current === initialWorkspace.current) {
          const restored = savedWorkspace(saved)
          changeWorkspace(() => restored)
          void loadTab(restored.activeTabId)
        }
      })
      .catch((reason) => {
        if (mounted) setConnectionError(errorMessage(reason))
      })
    return () => {
      mounted = false
    }
  }, [changeWorkspace, loadModels, loadTab])

  useEffect(() => {
    if (!isTauri()) return
    let mounted = true
    let dispose: (() => void) | undefined
    void onAgentUpdate((update) => {
      if (!mounted) return
      const tab = workspaceRef.current.tabs.find(
        (item) => item.conversationId === update.conversationId,
      )
      if (!tab) return
      const runtime = runtimeFor(tab.id)
      if (update.event.type === 'started') {
        if (!runtime.busy) return
        runtime.runId = update.messageId
        patchTab(tab.id, { live: { messageId: update.messageId, text: '', tool: null } })
        void syncMessages(tab.id, update.conversationId).catch((reason) =>
          patchTab(tab.id, { error: errorMessage(reason) }),
        )
        return
      }
      if (update.messageId !== runtime.runId) return
      switch (update.event.type) {
        case 'delta': {
          const text = update.event.text
          patchTab(tab.id, (current) => ({
            live:
              current.live?.messageId === update.messageId
                ? { ...current.live, text: current.live.text + text }
                : current.live,
          }))
          break
        }
        case 'tool': {
          const tool = `${update.event.name} · ${update.event.state}`
          patchTab(tab.id, (current) => ({
            live:
              current.live?.messageId === update.messageId
                ? { ...current.live, tool }
                : current.live,
          }))
          break
        }
        case 'error':
          patchTab(tab.id, { error: update.event.message })
          break
        case 'completed':
          break
        case 'cancelled':
          patchTab(tab.id, { error: null })
          break
      }
    })
      .then((unlisten) => {
        if (mounted) {
          dispose = unlisten
          setListenerReady(true)
        } else unlisten()
      })
      .catch((reason) => {
        if (mounted) {
          setConnection('error')
          setConnectionError(errorMessage(reason))
        }
      })
    return () => {
      mounted = false
      dispose?.()
      setListenerReady(false)
    }
  }, [listenerAttempt, patchTab, runtimeFor, syncMessages])

  async function refreshStatus() {
    if (deletingRef.current) return
    patchTab(workspaceRef.current.activeTabId, { error: null })
    setConnection('checking')
    setConnectionError(null)
    try {
      const status = await opencodeStatus()
      setInfo(status)
      setConnection(status.available ? 'ready' : status.installed ? 'stopped' : 'not_installed')
      if (!listenerReady) setListenerAttempt((attempt) => attempt + 1)
      if (status.installed || status.available) await loadModels()
    } catch (reason) {
      setConnection('error')
      setConnectionError(errorMessage(reason))
    }
  }

  async function retrySession() {
    if (deletingRef.current) return
    await loadTab(workspaceRef.current.activeTabId)
  }

  function newChat() {
    if (deletingRef.current) return
    changeWorkspace((current) => openChatTab(current))
  }

  function closeTab(tabId: string) {
    if (deletingRef.current || runtimeFor(tabId).busy) return
    dismissTab(tabId)
  }

  async function removeConversation(id: string) {
    const tab = workspaceRef.current.tabs.find((item) => item.conversationId === id)
    if (deletingRef.current || (tab && runtimeFor(tab.id).busy)) return false
    deletingRef.current = true
    setDeletingId(id)
    setDeleteError(null)
    setDeleteErrorId(id)
    try {
      await deleteConversation(id)
      ++conversationsRequest.current
      setConversations((current) => current.filter((conversation) => conversation.id !== id))
      if (tab) dismissTab(tab.id)
      return true
    } catch (reason) {
      setDeleteError(`Could not delete this chat. ${errorMessage(reason)}`)
      return false
    } finally {
      deletingRef.current = false
      setDeletingId(null)
    }
  }

  function dismissTab(tabId: string) {
    changeWorkspace((current) => closeChatTab(current, tabId))
    runtimes.current.delete(tabId)
    selectTab(workspaceRef.current.activeTabId)
  }

  async function send() {
    const tab = workspaceRef.current.tabs.find(
      (item) => item.id === workspaceRef.current.activeTabId,
    )!
    const runtime = runtimeFor(tab.id)
    const text = tab.draft.trim()
    if (
      !text ||
      runtime.busy ||
      deletingRef.current ||
      !listenerReady ||
      tab.loadingHistory ||
      tab.sessionMissing ||
      (!info?.installed && !info?.available)
    )
      return
    runtime.busy = true
    patchTab(tab.id, { activity: 'connecting', error: null })
    let id = tab.conversationId
    let submitted = false
    let restoreDraft = false
    const previousSequence = tab.messages.at(-1)?.sequence ?? 0
    try {
      if (!id) {
        const conversation = await createConversation(conversationTitle(text))
        ++conversationsRequest.current
        id = conversation.id
        runtime.unboundId = id
        patchTab(tab.id, { conversationId: id, title: conversation.title })
        setConversations((previous) => [...previous, conversation])
      }
      if (!tab.sessionReady) {
        try {
          await opencodeGetSession(id)
        } catch (reason) {
          const failure = toAppError(reason)
          if (runtime.unboundId !== id || failure.kind !== 'not_found') throw failure
          await opencodeCreateSession(id)
          runtime.unboundId = null
        }
        patchTab(tab.id, { sessionReady: true, sessionMissing: false })
      }
      setConnection('ready')
      patchTab(tab.id, { activity: 'sending', draft: '' })
      runtime.runId = null
      submitted = true
      await opencodeSendMessage(id, text, selectedModel)
    } catch (reason) {
      const failure: AppError = toAppError(reason)
      if (failure.kind !== 'cancelled') {
        patchTab(tab.id, { error: errorMessage(failure) })
        if (failure.kind === 'not_installed') setConnection('not_installed')
        if (failure.kind === 'session_not_found' || failure.kind === 'not_found') {
          patchTab(tab.id, {
            sessionReady: false,
            sessionMissing: runtime.unboundId !== id,
          })
        }
      }
      restoreDraft = !submitted || !runtime.runId
    } finally {
      if (id) {
        try {
          const saved = await syncMessages(tab.id, id)
          if (
            restoreDraft &&
            (!submitted ||
              !saved.some(
                (message) =>
                  message.role === 'user' &&
                  message.sequence > previousSequence &&
                  message.content === text,
              ))
          )
            patchTab(tab.id, { draft: text })
          await syncConversations()
        } catch (reason) {
          if (restoreDraft && !submitted) patchTab(tab.id, { draft: text })
          patchTab(tab.id, { error: errorMessage(reason) })
        }
      } else if (restoreDraft) {
        patchTab(tab.id, { draft: text })
      }
      runtime.runId = null
      runtime.busy = false
      patchTab(tab.id, { live: null, activity: 'idle' })
    }
  }

  async function stop() {
    const tab = workspaceRef.current.tabs.find(
      (item) => item.id === workspaceRef.current.activeTabId,
    )!
    const runtime = runtimeFor(tab.id)
    const id = tab.conversationId
    if (!id || !runtime.busy || !runtime.runId || tab.activity === 'cancelling') return
    patchTab(tab.id, { activity: 'cancelling' })
    try {
      await opencodeCancel(id)
    } catch (reason) {
      const failure = toAppError(reason)
      if (failure.kind !== 'not_found') patchTab(tab.id, { error: errorMessage(failure) })
    }
  }

  return {
    connection,
    info,
    conversations,
    tabs: workspace.tabs,
    activeTabId: workspace.activeTabId,
    activeId,
    messages: activeTab.messages,
    live: activeTab.live,
    activity: activeTab.activity,
    loadingHistory: activeTab.loadingHistory,
    listenerReady,
    sessionReady: activeTab.sessionReady,
    sessionMissing: activeTab.sessionMissing,
    models,
    modelsLoading,
    modelsError,
    selectedModel,
    favoriteModels,
    draft: activeTab.draft,
    deletingId,
    deleteError,
    deleteErrorId,
    error: isTauri()
      ? (activeTab.error ?? connectionError)
      : 'Open Talo on the desktop to use OpenCode.',
    setDraft: (draft: string) => patchTab(activeTab.id, { draft }),
    send,
    stop,
    refreshStatus,
    retrySession,
    loadModels,
    selectModel: setSelectedModel,
    toggleFavoriteModel: (key: string) =>
      setFavoriteModels((current) =>
        current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
      ),
    openConversation,
    selectTab,
    closeTab,
    newChat,
    startIssueChat: (draft: string) => {
      if (deletingRef.current) return
      changeWorkspace((current) => {
        const next = openChatTab(current)
        return {
          ...next,
          tabs: next.tabs.map((tab) => (tab.id === next.activeTabId ? { ...tab, draft } : tab)),
        }
      })
    },
    removeConversation,
  }
}

export type ChatConversation = ReturnType<typeof useChatConversation>
