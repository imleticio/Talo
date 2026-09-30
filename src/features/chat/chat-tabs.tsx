import { useLayoutEffect, useRef } from 'react'
import { LoaderCircle, MessageSquare, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ChatConversation } from './use-chat-conversation'

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
          const index = chat.tabs.findIndex((tab) => `chat-tab-${tab.id}` === target.id)
          let next: number
          if (event.key === 'ArrowRight') next = (index + 1) % chat.tabs.length
          else if (event.key === 'ArrowLeft')
            next = (index - 1 + chat.tabs.length) % chat.tabs.length
          else if (event.key === 'Home') next = 0
          else if (event.key === 'End') next = chat.tabs.length - 1
          else if (event.key === 'Delete' && chat.tabs[index].activity === 'idle') {
            event.preventDefault()
            close(chat.tabs[index].id)
            return
          } else return
          event.preventDefault()
          const tab = chat.tabs[next]
          activate(tab.id)
          document.getElementById(`chat-tab-${tab.id}`)?.focus()
        }}
      >
        {chat.tabs.map((tab) => {
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
                aria-controls={active && visible ? `chat-panel-${tab.id}` : undefined}
                aria-label={busy ? `${tab.title}, responding` : tab.title}
                tabIndex={active ? 0 : -1}
                title={tab.title}
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
    </div>
  )
}
