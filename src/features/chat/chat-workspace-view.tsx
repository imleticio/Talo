import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { isTauri } from '@tauri-apps/api/core'
import { Button } from '@/components/ui/button'
import { ChatPage } from './chat-page'
import { CHAT_DRAG_TYPE, CHAT_POINTER_DRAG, readChatDrag, type ChatPointerDrag } from './chat-drag'
import type { ChatConversation } from './use-chat-conversation'
import { visibleChatPanels } from './chat-panels-state'

export function ChatWorkspaceView({ chat }: { chat: ChatConversation }) {
  const [dropTarget, setDropTarget] = useState<{ id: string; side: 'left' | 'right' } | null>(null)
  useEffect(() => {
    const clear = () => setDropTarget(null)
    window.addEventListener('dragend', clear)
    window.addEventListener('drop', clear)
    return () => {
      window.removeEventListener('dragend', clear)
      window.removeEventListener('drop', clear)
    }
  }, [])
  const ids = visibleChatPanels(
    chat.panelTabIds,
    chat.tabs.map((tab) => tab.id),
    chat.activeTabId,
  )

  function split(tabId: string, anchorId: string, side: 'left' | 'right' = 'right') {
    chat.showPanel(tabId, anchorId, side)
  }

  useEffect(() => {
    const handle = (event: Event) => {
      const { payload, x, y, phase } = (event as CustomEvent<ChatPointerDrag>).detail
      if (phase === 'cancel' || chat.deletingId) {
        setDropTarget(null)
        return
      }
      const panel = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-chat-panel]')
      const anchor = panel?.dataset.chatPanel
      const sourceTab =
        'tabId' in payload
          ? payload.tabId
          : chat.tabs.find((tab) => tab.conversationId === payload.conversationId)?.id
      const target = anchor && sourceTab !== anchor ? anchor : null
      const bounds = panel?.getBoundingClientRect()
      const side = bounds && x < bounds.left + bounds.width / 2 ? 'left' : 'right'
      if (phase === 'move') {
        setDropTarget(target ? { id: target, side } : null)
        return
      }
      setDropTarget(null)
      if (!target) return
      const tabId =
        'tabId' in payload
          ? payload.tabId
          : chat.openConversation(payload.conversationId, target, side)
      if (tabId) chat.showPanel(tabId, target, side)
    }
    window.addEventListener(CHAT_POINTER_DRAG, handle)
    return () => window.removeEventListener(CHAT_POINTER_DRAG, handle)
  }, [chat])

  return (
    <div
      className="chat-workspace flex min-h-0 min-w-0 flex-1 overflow-x-auto"
      data-split={ids.length > 1}
      aria-label="Chat workspace"
    >
      {ids.map((id) => {
        const tab = chat.tabs.find((item) => item.id === id)!
        const scoped: ChatConversation = {
          ...chat,
          activeTabId: id,
          activeId: tab.conversationId,
          messages: tab.messages,
          turnActivity: tab.turnActivity,
          live: tab.live,
          activity: tab.activity,
          draft: tab.draft,
          loadingHistory: tab.loadingHistory,
          sessionReady: tab.sessionReady,
          sessionMissing: tab.sessionMissing,
          error: isTauri() ? (tab.error ?? chat.connectionError) : chat.error,
          setDraft: (draft) => chat.setTabDraft(id, draft),
          send: () => chat.send(id),
          stop: () => chat.stop(id),
          retrySession: () => chat.retrySession(id),
        }
        return (
          <section
            key={id}
            id={`chat-panel-${id}`}
            data-chat-panel={id}
            role="tabpanel"
            aria-labelledby={`chat-tab-${id}`}
            className={`chat-panel group/panel relative flex min-h-0 min-w-0 flex-1 flex-col outline-none ${ids.length > 1 ? 'min-w-80 border-r border-border/50 last:border-r-0' : ''}`}
            tabIndex={0}
            onFocusCapture={() => {
              if (chat.activeTabId !== id) chat.selectTab(id)
            }}
            onPointerDown={() => {
              if (chat.activeTabId !== id) chat.selectTab(id)
            }}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes(CHAT_DRAG_TYPE) || chat.deletingId) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              const bounds = event.currentTarget.getBoundingClientRect()
              setDropTarget({
                id,
                side: event.clientX < bounds.left + bounds.width / 2 ? 'left' : 'right',
              })
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                setDropTarget(null)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setDropTarget(null)
              const payload = readChatDrag(event.dataTransfer.getData(CHAT_DRAG_TYPE))
              if (!payload) return
              const bounds = event.currentTarget.getBoundingClientRect()
              const side = event.clientX < bounds.left + bounds.width / 2 ? 'left' : 'right'
              const tabId =
                'tabId' in payload
                  ? payload.tabId
                  : chat.openConversation(payload.conversationId, id, side)
              if (tabId) split(tabId, id, side)
            }}
            onDragEnd={() => setDropTarget(null)}
          >
            {ids.length > 1 && (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Hide panel: ${tab.title}`}
                title="Hide panel"
                className="absolute top-2 right-2 z-10 size-6 rounded-full text-muted-foreground opacity-0 hover:bg-background/60 group-hover/panel:opacity-100 group-focus-within/panel:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                onClick={() => {
                  const remaining = ids.filter((item) => item !== id)
                  chat.hidePanel(id)
                  chat.selectTab(remaining[0])
                }}
              >
                <X className="size-3.5" />
              </Button>
            )}
            <ChatPage chat={scoped} />
            {dropTarget?.id === id && (
              <div
                className={`pointer-events-none absolute inset-y-2 z-20 flex w-[calc(50%-0.5rem)] items-center justify-center rounded-2xl border border-foreground/30 bg-foreground/10 backdrop-blur-sm ${dropTarget.side === 'left' ? 'left-2' : 'right-2'}`}
              >
                <span className="rounded-lg bg-background/90 px-3 py-2 text-xs font-medium text-foreground shadow-sm">
                  Open chat here
                </span>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
