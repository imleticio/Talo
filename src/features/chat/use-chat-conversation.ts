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
  type Message,
} from '@/services/persistence'

const ACTIVE_CHAT_KEY = 'talo.active-chat-id'
const MODEL_KEY = 'talo.opencode-model'
const FAVORITES_KEY = 'talo.opencode-favorite-models'

type Connection = 'checking' | 'not_installed' | 'stopped' | 'connecting' | 'ready' | 'error'
type Activity = 'idle' | 'connecting' | 'sending' | 'cancelling'
type LiveReply = { messageId: string; text: string; tool: string | null }

function savedChatId() {
  try {
    return localStorage.getItem(ACTIVE_CHAT_KEY)
  } catch {
    return null
  }
}

function rememberChat(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_CHAT_KEY, id)
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
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [live, setLive] = useState<LiveReply | null>(null)
  const [activity, setActivity] = useState<Activity>('idle')
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [listenerReady, setListenerReady] = useState(false)
  const [listenerAttempt, setListenerAttempt] = useState(0)
  const [sessionReady, setSessionReady] = useState(false)
  const [sessionMissing, setSessionMissing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteErrorId, setDeleteErrorId] = useState<string | null>(null)
  const [models, setModels] = useState<AgentModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<AgentModelChoice | null>(savedModel)
  const [favoriteModels, setFavoriteModels] = useState<string[]>(savedFavorites)

  const activeIdRef = useRef<string | null>(null)
  const runIdRef = useRef<string | null>(null)
  const busyRef = useRef(false)
  const deletingRef = useRef(false)
  const sessionReadyRef = useRef(false)
  const unboundIdRef = useRef<string | null>(null)
  const viewRef = useRef(0)
  const syncRef = useRef(0)
  const modelsRequest = useRef(0)

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

  const syncMessages = useCallback(async (id: string, view = viewRef.current) => {
    const request = ++syncRef.current
    const saved = await listMessages(id)
    if (activeIdRef.current === id && viewRef.current === view && syncRef.current === request) {
      setMessages(saved)
    }
    return saved
  }, [])

  const openConversation = useCallback(
    async (id: string) => {
      if (busyRef.current || deletingRef.current) return
      if (activeIdRef.current === id) {
        const view = viewRef.current
        try {
          await syncMessages(id)
        } catch (reason) {
          if (viewRef.current === view) setError(errorMessage(reason))
        }
        return
      }
      const view = ++viewRef.current
      activeIdRef.current = id
      rememberChat(id)
      setActiveId(id)
      setMessages([])
      setLive(null)
      setError(null)
      setDraft('')
      setSessionReady(false)
      setSessionMissing(false)
      sessionReadyRef.current = false
      setLoadingHistory(true)
      try {
        await syncMessages(id, view)
      } catch (reason) {
        if (viewRef.current === view) setError(errorMessage(reason))
      }
      if (viewRef.current !== view) return
      try {
        await opencodeGetSession(id)
        if (viewRef.current === view) {
          sessionReadyRef.current = true
          setSessionReady(true)
          setSessionMissing(false)
          setConnection('ready')
        }
      } catch (reason) {
        if (viewRef.current === view) {
          const failure = toAppError(reason)
          setSessionMissing(failure.kind === 'not_found' || failure.kind === 'session_not_found')
          setError(errorMessage(failure))
          if (failure.kind !== 'not_found') setConnection('error')
        }
      } finally {
        if (viewRef.current === view) setLoadingHistory(false)
      }
    },
    [syncMessages],
  )

  useEffect(() => {
    if (!isTauri()) {
      return
    }
    let mounted = true
    void opencodeStatus()
      .then((status) => {
        if (!mounted) return
        setInfo(status)
        if (!sessionReadyRef.current) {
          setConnection(status.available ? 'ready' : status.installed ? 'stopped' : 'not_installed')
        }
        if (status.installed || status.available) void loadModels()
      })
      .catch((reason) => {
        if (mounted) {
          setConnection('error')
          setError(errorMessage(reason))
        }
      })
    void listConversations()
      .then((saved) => {
        if (!mounted) return
        setConversations(saved)
        const previous = savedChatId()
        if (previous && saved.some((conversation) => conversation.id === previous)) {
          void openConversation(previous)
        }
      })
      .catch((reason) => {
        if (mounted) setError(errorMessage(reason))
      })
    return () => {
      mounted = false
    }
  }, [loadModels, openConversation])

  useEffect(() => {
    if (!isTauri()) return
    let mounted = true
    let dispose: (() => void) | undefined
    void onAgentUpdate((update) => {
      if (!mounted) return
      if (update.conversationId !== activeIdRef.current) return
      if (update.event.type === 'started') {
        if (!busyRef.current) return
        runIdRef.current = update.messageId
        setLive({ messageId: update.messageId, text: '', tool: null })
        void syncMessages(update.conversationId).catch((reason) => setError(errorMessage(reason)))
        return
      }
      if (update.messageId !== runIdRef.current) return
      switch (update.event.type) {
        case 'delta': {
          const text = update.event.text
          setLive((current) =>
            current?.messageId === update.messageId
              ? { ...current, text: current.text + text }
              : current,
          )
          break
        }
        case 'tool': {
          const tool = `${update.event.name} · ${update.event.state}`
          setLive((current) =>
            current?.messageId === update.messageId ? { ...current, tool } : current,
          )
          break
        }
        case 'error':
          setError(update.event.message)
          break
        case 'completed':
          break
        case 'cancelled':
          setError(null)
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
          setError(errorMessage(reason))
        }
      })
    return () => {
      mounted = false
      dispose?.()
      setListenerReady(false)
    }
  }, [listenerAttempt, syncMessages])

  async function refreshStatus() {
    if (busyRef.current || deletingRef.current) return
    setConnection('checking')
    setError(null)
    try {
      const status = await opencodeStatus()
      setInfo(status)
      setConnection(status.available ? 'ready' : status.installed ? 'stopped' : 'not_installed')
      if (!listenerReady) setListenerAttempt((attempt) => attempt + 1)
      if (status.installed || status.available) await loadModels()
    } catch (reason) {
      setConnection('error')
      setError(errorMessage(reason))
    }
  }

  async function retrySession() {
    const id = activeIdRef.current
    if (!id || busyRef.current || deletingRef.current) return
    const view = viewRef.current
    setConnection('connecting')
    setError(null)
    setLoadingHistory(true)
    try {
      await opencodeGetSession(id)
      if (viewRef.current === view && activeIdRef.current === id) {
        sessionReadyRef.current = true
        setSessionReady(true)
        setSessionMissing(false)
        setConnection('ready')
      }
    } catch (reason) {
      if (viewRef.current === view && activeIdRef.current === id) {
        const failure = toAppError(reason)
        setSessionMissing(failure.kind === 'not_found' || failure.kind === 'session_not_found')
        setConnection('error')
        setError(errorMessage(failure))
      }
    } finally {
      if (viewRef.current === view && activeIdRef.current === id) setLoadingHistory(false)
    }
  }

  function clearConversationView() {
    ++viewRef.current
    ++syncRef.current
    activeIdRef.current = null
    runIdRef.current = null
    sessionReadyRef.current = false
    unboundIdRef.current = null
    rememberChat(null)
    setActiveId(null)
    setMessages([])
    setLive(null)
    setSessionReady(false)
    setSessionMissing(false)
    setLoadingHistory(false)
    setError(null)
    setDraft('')
  }

  function newChat() {
    if (busyRef.current || deletingRef.current) return
    clearConversationView()
  }

  async function removeConversation(id: string) {
    if (busyRef.current || deletingRef.current) return false
    deletingRef.current = true
    setDeletingId(id)
    setDeleteError(null)
    setDeleteErrorId(id)
    try {
      await deleteConversation(id)
      setConversations((current) => current.filter((conversation) => conversation.id !== id))
      if (activeIdRef.current === id) clearConversationView()
      return true
    } catch (reason) {
      setDeleteError(`Could not delete this chat. ${errorMessage(reason)}`)
      return false
    } finally {
      deletingRef.current = false
      setDeletingId(null)
    }
  }

  async function send() {
    const text = draft.trim()
    if (
      !text ||
      busyRef.current ||
      deletingRef.current ||
      !listenerReady ||
      loadingHistory ||
      sessionMissing ||
      (!info?.installed && !info?.available)
    )
      return
    busyRef.current = true
    setActivity('connecting')
    setError(null)
    let id = activeIdRef.current
    let submitted = false
    let restoreDraft = false
    const previousSequence = messages.at(-1)?.sequence ?? 0
    try {
      if (!id) {
        const conversation = await createConversation(conversationTitle(text))
        id = conversation.id
        activeIdRef.current = id
        unboundIdRef.current = id
        rememberChat(id)
        setActiveId(id)
        setConversations((previous) => [...previous, conversation])
      }
      if (!sessionReadyRef.current) {
        try {
          await opencodeGetSession(id)
        } catch (reason) {
          const failure = toAppError(reason)
          if (unboundIdRef.current !== id || failure.kind !== 'not_found') throw failure
          await opencodeCreateSession(id)
          unboundIdRef.current = null
        }
        sessionReadyRef.current = true
        setSessionReady(true)
        setSessionMissing(false)
      }
      setConnection('ready')
      setActivity('sending')
      runIdRef.current = null
      setDraft('')
      submitted = true
      await opencodeSendMessage(id, text, selectedModel)
    } catch (reason) {
      const failure: AppError = toAppError(reason)
      if (failure.kind !== 'cancelled') {
        setError(errorMessage(failure))
        setConnection(failure.kind === 'not_installed' ? 'not_installed' : 'error')
        if (failure.kind === 'session_not_found' || failure.kind === 'not_found') {
          sessionReadyRef.current = false
          setSessionReady(false)
          setSessionMissing(unboundIdRef.current !== id)
        }
      }
      restoreDraft = !submitted || !runIdRef.current
    } finally {
      if (id) {
        try {
          const saved = await syncMessages(id)
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
            setDraft(text)
          setConversations(await listConversations())
        } catch (reason) {
          if (restoreDraft && !submitted) setDraft(text)
          setError(errorMessage(reason))
        }
      } else if (restoreDraft) {
        setDraft(text)
      }
      setLive(null)
      runIdRef.current = null
      busyRef.current = false
      setActivity('idle')
    }
  }

  async function stop() {
    const id = activeIdRef.current
    if (!id || !busyRef.current || !runIdRef.current || activity === 'cancelling') return
    setActivity('cancelling')
    try {
      await opencodeCancel(id)
    } catch (reason) {
      const failure = toAppError(reason)
      if (failure.kind !== 'not_found') setError(errorMessage(failure))
    }
  }

  return {
    connection,
    info,
    conversations,
    activeId,
    messages,
    live,
    activity,
    loadingHistory,
    listenerReady,
    sessionReady,
    sessionMissing,
    models,
    modelsLoading,
    modelsError,
    selectedModel,
    favoriteModels,
    draft,
    deletingId,
    deleteError,
    deleteErrorId,
    error: isTauri() ? error : 'Open Talo on the desktop to use OpenCode.',
    setDraft,
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
    newChat,
    removeConversation,
  }
}

export type ChatConversation = ReturnType<typeof useChatConversation>
