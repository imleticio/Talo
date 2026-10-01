import { useLayoutEffect, useRef } from 'react'
import { Columns2, LoaderCircle, MessageSquare, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ChatConversation } from './use-chat-conversation'
import { beginChatDrag } from './chat-drag'
import { visibleChatPanels } from './chat-panels-state'

export function ChatTabs({
  chat,
  visible,
  onShowChat,
}: {
  chat: ChatConversation
  visible: boolean
  onShowChat: () => void
}) {
  const tabList = useRef<HTMLDivElement>(null)
  const panelIds = visibleChatPanels(
    chat.panelTabIds,
    chat.tabs.map((tab) => tab.id),
    chat.activeTabId,
  )
  const groups = chat.panelGroups
    .map((group) => group.filter((id) => chat.tabs.some((tab) => tab.id === id)))
    .filter((group) => group.length > 1)
  const tabGroups = chat.tabs.flatMap((tab) => {
    const group = groups.find((ids) => ids.includes(tab.id))
    if (!group) return [[tab]]
    const firstGrouped = chat.tabs.find((item) => group.includes(item.id))?.id
    if (tab.id !== firstGrouped) return []
    return [group.map((id) => chat.tabs.find((item) => item.id === id)!)]
  })
  const orderedTabs = tabGroups.flat()

  useLayoutEffect(() => {
    tabList.current
      ?.querySelector<HTMLElement>(`[id="chat-tab-${chat.activeTabId}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [chat.activeTabId])

  function activate(id: string) {
    chat.selectTab(id)
    onShowChat()
  }

  function close(id: string) {
    const hadFocus = tabList.current?.contains(document.activeElement)
    chat.closeTab(id)
    if (hadFocus) {
      requestAnimationFrame(() => {
        tabList.current?.querySelector<HTMLElement>('[role="tab"][tabindex="0"]')?.focus()
      })
    }
  }

  return (
    <div className="talo-chat-tabs flex h-8 min-w-0 items-center gap-1">
      <div
        ref={tabList}
        role="tablist"
        aria-label="Open chats"
        aria-orientation="horizontal"
        className="flex min-w-0 items-center gap-1 overflow-x-auto p-0.5"
        onKeyDown={(event) => {
          const target = event.target as HTMLElement
          if (target.getAttribute('role') !== 'tab') return
          const index = orderedTabs.findIndex((tab) => `chat-tab-${tab.id}` === target.id)
          let next: number
          if (event.key === 'ArrowRight') next = (index + 1) % orderedTabs.length
          else if (event.key === 'ArrowLeft')
            next = (index - 1 + orderedTabs.length) % orderedTabs.length
          else if (event.key === 'Home') next = 0
          else if (event.key === 'End') next = orderedTabs.length - 1
          else if (event.key === 'Delete' && orderedTabs[index].activity === 'idle') {
            event.preventDefault()
            close(orderedTabs[index].id)
            return
          } else return
          event.preventDefault()
          const tab = orderedTabs[next]
          activate(tab.id)
          document.getElementById(`chat-tab-${tab.id}`)?.focus()
        }}
      >
        {tabGroups.map((tabs) => (
          <div
            key={tabs
              .map((tab) => tab.id)
              .sort()
              .join(':')}
            role={tabs.length > 1 ? 'group' : 'presentation'}
            aria-label={tabs.length > 1 ? 'Side-by-side chats' : undefined}
            data-active={visible && tabs.some((tab) => tab.id === chat.activeTabId)}
            className={
              tabs.length > 1
                ? 'talo-chat-tab-group flex h-8 shrink-0 items-center gap-1 rounded-2xl border border-sidebar-border bg-sidebar-accent/40 p-0.5'
                : 'contents'
            }
          >
            {tabs.map((tab) => {
              const active = tab.id === chat.activeTabId
              const busy = tab.activity !== 'idle'
              return (
                <div
                  key={tab.id}
                  role="presentation"
                  data-active={active && visible}
                  className="talo-chat-tab group flex h-7 w-44 shrink-0 items-center rounded-xl border border-transparent text-muted-foreground transition-colors hover:bg-sidebar-accent/50 data-[active=true]:border-sidebar-border data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-foreground"
                >
                  <button
                    id={`chat-tab-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-selected={active && visible}
                    aria-controls={
                      visible && panelIds.includes(tab.id) ? `chat-panel-${tab.id}` : undefined
                    }
                    aria-label={busy ? `${tab.title}, responding` : tab.title}
                    tabIndex={active ? 0 : -1}
                    title={tab.title}
                    onPointerDown={(event) => {
                      if (!chat.deletingId) beginChatDrag(event, { tabId: tab.id })
                    }}
                    onDragStart={(event) => event.preventDefault()}
                    onClick={() => activate(tab.id)}
                    className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                  >
                    {busy ? (
                      <LoaderCircle
                        className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                    ) : (
                      <MessageSquare className="size-3.5 shrink-0" aria-hidden="true" />
                    )}
                    <span className="truncate">{tab.title}</span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Close tab: ${tab.title}`}
                    title={busy ? 'Stop the response before closing this tab' : 'Close tab'}
                    disabled={busy || Boolean(chat.deletingId)}
                    onClick={() => close(tab.id)}
                    className="talo-chat-tab-close mr-1 size-5 shrink-0 rounded-md text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" aria-hidden="true" />
                  </Button>
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="New chat tab"
        title="New chat tab"
        disabled={Boolean(chat.deletingId)}
        onClick={() => {
          chat.newChat()
          onShowChat()
        }}
        className="size-7 shrink-0 rounded-xl text-muted-foreground hover:text-foreground"
      >
        <Plus className="size-4" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Open another chat alongside"
        title="Open another chat alongside"
        disabled={Boolean(chat.deletingId)}
        onClick={() => {
          const other = chat.tabs.find(
            (tab) => tab.id !== chat.activeTabId && !chat.panelTabIds.includes(tab.id),
          )
          if (other) chat.showPanel(other.id)
          else chat.newChat(chat.activeTabId)
          onShowChat()
        }}
        className="size-7 shrink-0 rounded-xl text-muted-foreground hover:text-foreground"
      >
        <Columns2 className="size-3.5" aria-hidden="true" />
      </Button>
    </div>
  )
}
