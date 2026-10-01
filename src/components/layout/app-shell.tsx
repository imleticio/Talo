import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  FolderClosed,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BranchIcon } from '@/components/ui/branch-icon'
import { GradientBlurBackground } from '@/features/chat/gradient-blur-background'
import { ChatTabs } from '@/features/chat/chat-tabs'
import { beginChatDrag } from '@/features/chat/chat-drag'
import { visibleChatPanels } from '@/features/chat/chat-panels-state'
import { ChatAgentMark } from '@/features/chat/chat-agent-mark'
import { hazeStyle } from '@/features/chat/haze-style'
import type { ChatConversation } from '@/features/chat/use-chat-conversation'
import type { ChatBackground } from '@/features/settings/use-chat-background'
import { isMacDesktop } from '@/lib/platform'
import type { Conversation } from '@/services/persistence'
import { navigation, type Section } from './navigation'
import { TerminalPanel } from './terminal-panel'

type AppShellProps = {
  section: Section
  onNavigate: (section: Section) => void
  background: ChatBackground
  chat: ChatConversation
  children: ReactNode
}

const SIDEBAR_STORAGE_KEY = 'talo.sidebar-expanded'

function initialSidebarState() {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function RecentConversation({
  conversation,
  chat,
  onOpen,
  onRemoved,
}: {
  conversation: Conversation
  chat: ChatConversation
  onOpen: () => void
  onRemoved: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const modelDescriptionId = useId()
  const deleteButton = useRef<HTMLButtonElement>(null)
  const blocked = Boolean(chat.deletingId)
  const running = chat.tabs.some(
    (tab) => tab.conversationId === conversation.id && tab.activity !== 'idle',
  )
  const deleting = chat.deletingId === conversation.id
  const modelLabel = conversation.lastModelId
    ? (chat.models.find(
        (model) =>
          model.providerId === conversation.lastProviderId &&
          model.modelId === conversation.lastModelId,
      )?.name ?? conversation.lastModelId)
    : 'Model not recorded'

  function cancel() {
    if (deleting) return
    setConfirming(false)
    deleteButton.current?.focus()
  }

  return (
    <div className="group min-w-0">
      <div
        data-active={chat.activeId === conversation.id}
        className="talo-chat-card relative min-w-0 rounded-lg border border-transparent hover:bg-sidebar-accent/50 data-[active=true]:bg-sidebar-accent"
      >
        <Button
          type="button"
          variant="ghost"
          title={conversation.title}
          aria-label={conversation.title}
          aria-describedby={modelDescriptionId}
          aria-current={chat.activeId === conversation.id ? 'page' : undefined}
          disabled={blocked}
          onClick={onOpen}
          onPointerDown={(event) => {
            if (!blocked) beginChatDrag(event, { conversationId: conversation.id })
          }}
          onDragStart={(event) => event.preventDefault()}
          className="talo-chat-card-open h-auto min-h-9 w-full min-w-0 justify-start rounded-lg border-0 bg-transparent py-2 pr-11 pl-3 text-left text-xs font-normal text-muted-foreground hover:bg-transparent aria-[current=page]:font-medium aria-[current=page]:text-sidebar-foreground dark:hover:bg-transparent"
        >
          <span id={modelDescriptionId} data-chat-model className="sr-only">
            Last response model: {modelLabel}
          </span>
          <span className="flex w-full min-w-0 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-2 leading-4">
              <ChatAgentMark agentId={conversation.agentId} />
              <span className="truncate">{conversation.title}</span>
            </span>
            {conversation.branch && (
              <span
                className="flex min-w-0 items-center gap-2 text-[11px] font-normal leading-4 text-muted-foreground/75"
                title={`${conversation.repositoryPath ?? ''} · ${conversation.branch}`}
              >
                <BranchIcon className="size-3.5 shrink-0" />
                <span className="truncate">{conversation.branch}</span>
              </span>
            )}
          </span>
        </Button>
        <Button
          ref={deleteButton}
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Delete chat: ${conversation.title}`}
          title="Delete chat"
          aria-expanded={confirming}
          disabled={blocked || running}
          onClick={() => setConfirming((current) => !current)}
          className={`absolute top-1/2 right-1 size-6 -translate-y-1/2 text-muted-foreground/70 hover:text-destructive group-hover:opacity-100 group-focus-within:opacity-100 ${confirming ? '' : '[@media(hover:hover)]:opacity-0'}`}
        >
          <Trash2 className="size-3" strokeWidth={1.8} aria-hidden="true" />
        </Button>
      </div>
      {confirming && (
        <div
          role="group"
          aria-label={`Delete chat: ${conversation.title}`}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              cancel()
            }
          }}
          className="mb-1 rounded-lg border border-sidebar-border px-2 py-2 text-xs"
        >
          <p>Delete this chat and its local messages?</p>
          {chat.deleteError && chat.deleteErrorId === conversation.id && (
            <p role="alert" className="mt-2 text-destructive">
              {chat.deleteError}
            </p>
          )}
          <div className="mt-2 flex justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              autoFocus
              disabled={blocked}
              onClick={cancel}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="xs"
              disabled={blocked || running}
              onClick={async () => {
                if (await chat.removeConversation(conversation.id)) onRemoved()
              }}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function AppShell({ section, onNavigate, background, chat, children }: AppShellProps) {
  const [expanded, setExpanded] = useState(initialSidebarState)
  const newChatButton = useRef<HTMLButtonElement>(null)
  const sidebarViewport = useRef<HTMLDivElement>(null)
  const conversationsContent = useRef<HTMLElement>(null)
  const workspace = useRef<HTMLDivElement>(null)
  const workspaceColumn = useRef<HTMLDivElement>(null)
  const previousWorkspaceBounds = useRef<DOMRect | null>(null)
  const sidebarAnimation = useRef<Animation | null>(null)
  const imageUrl = section !== 'settings' ? background.imageUrl : null
  const visiblePanels = visibleChatPanels(
    chat.panelTabIds,
    chat.tabs.map((tab) => tab.id),
    chat.activeTabId,
  )
  const sessionEmpty = chat.tabs
    .filter((tab) => visiblePanels.includes(tab.id))
    .every((tab) => !tab.live && tab.messages.length === 0)

  useLayoutEffect(() => {
    const element = workspaceColumn.current
    const before = previousWorkspaceBounds.current
    previousWorkspaceBounds.current = null
    if (!element || !before) return
    sidebarAnimation.current?.cancel()
    const after = element.getBoundingClientRect()
    if (!after.width || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // Change column widths once; animate the previous visual bounds instead of layout.
    sidebarAnimation.current = element.animate(
      [
        {
          transform: `translateX(${before.left - after.left}px) scaleX(${before.width / after.width})`,
        },
        { transform: 'translateX(0) scaleX(1)' },
      ],
      { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    )
  }, [expanded])

  useEffect(() => () => sidebarAnimation.current?.cancel(), [])

  useLayoutEffect(() => {
    const viewport = sidebarViewport.current
    const content = conversationsContent.current
    if (!viewport || !content) return

    function measure() {
      if (!viewport) return
      const visible = expanded && viewport.clientHeight > 0
      const top = String(visible && viewport.scrollTop > 1)
      const bottom = String(
        visible && viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight > 1,
      )
      if (viewport.dataset.fadeTop !== top) viewport.dataset.fadeTop = top
      if (viewport.dataset.fadeBottom !== bottom) viewport.dataset.fadeBottom = bottom
    }

    measure()
    viewport.addEventListener('scroll', measure, { passive: true })
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    observer.observe(content)
    return () => {
      viewport.removeEventListener('scroll', measure)
      observer.disconnect()
    }
  }, [expanded])

  function toggleSidebar() {
    previousWorkspaceBounds.current = workspaceColumn.current?.getBoundingClientRect() ?? null
    const next = !expanded
    setExpanded(next)
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next))
    } catch {
      // The sidebar still works when local storage is unavailable.
    }
  }

  return (
    <div
      className="talo-shell flex h-dvh min-h-0 flex-col bg-sidebar text-foreground"
      data-has-haze={Boolean(imageUrl)}
      style={
        imageUrl
          ? hazeStyle(imageUrl, background.emptyOpacity, background.sessionOpacity)
          : undefined
      }
    >
      <div
        data-tauri-drag-region={isMacDesktop ? '' : undefined}
        className="talo-titlebar flex h-10 shrink-0 items-center bg-sidebar pr-3 pl-12"
      >
        <ChatTabs chat={chat} visible={section === 'chat'} onShowChat={() => onNavigate('chat')} />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="talo-sidebar-slot shrink-0" data-expanded={expanded}>
          <aside
            id="talo-sidebar"
            data-expanded={expanded}
            data-has-haze={Boolean(imageUrl)}
            className="talo-sidebar flex shrink-0 flex-col bg-sidebar text-sidebar-foreground"
            aria-label="Main navigation"
          >
            <div
              data-tauri-drag-region={isMacDesktop ? 'deep' : undefined}
              className="talo-brand flex h-10 shrink-0 items-center px-2"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
                title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
                aria-expanded={expanded}
                aria-controls="talo-sidebar"
                className="size-8 rounded-xl text-muted-foreground transition-none hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                {expanded ? (
                  <PanelLeftClose className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                ) : (
                  <PanelLeftOpen className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                )}
              </Button>
            </div>

            <nav className="flex flex-col gap-1 px-2" aria-label="Sections">
              {navigation
                .filter((item) => item.id !== 'settings')
                .map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    variant="ghost"
                    title={item.label}
                    aria-label={item.label}
                    aria-current={section === item.id ? 'page' : undefined}
                    onClick={() => onNavigate(item.id)}
                    className={`relative h-8 w-full justify-start rounded-xl px-2 text-[13px] font-medium transition-none ${section === item.id ? 'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent dark:hover:bg-sidebar-accent' : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'}`}
                  >
                    <item.icon className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                    <span className="talo-sidebar-label" aria-hidden="true">
                      {item.label}
                    </span>
                  </Button>
                ))}
            </nav>

            <div
              ref={sidebarViewport}
              className="talo-sidebar-details mt-8 min-h-0 flex-1 overflow-y-auto px-5"
              aria-hidden={!expanded}
              inert={!expanded}
            >
              <section aria-labelledby="sidebar-projects">
                <h2 id="sidebar-projects" className="text-xs font-medium text-sidebar-foreground">
                  Projects
                </h2>
                <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <FolderClosed className="size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                  <span>No projects yet</span>
                </div>
              </section>

              <section
                ref={conversationsContent}
                aria-labelledby="sidebar-conversations"
                className="mt-8"
              >
                <h2
                  id="sidebar-conversations"
                  className="text-xs font-medium text-sidebar-foreground"
                >
                  Recent chats
                </h2>
                <Button
                  ref={newChatButton}
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    chat.newChat()
                    onNavigate('chat')
                  }}
                  disabled={Boolean(chat.deletingId)}
                  className="mt-2 h-9 w-full justify-start px-2 text-xs text-muted-foreground"
                >
                  <MessageSquare className="size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                  New chat
                </Button>
                {chat.conversations.length === 0 ? (
                  <p className="mt-2 px-2 text-xs text-muted-foreground">No conversations yet</p>
                ) : (
                  <div className="mt-1 flex flex-col gap-0.5">
                    {chat.conversations
                      .slice()
                      .reverse()
                      .map((conversation) => (
                        <RecentConversation
                          key={conversation.id}
                          conversation={conversation}
                          chat={chat}
                          onOpen={() => {
                            void chat.openConversation(conversation.id)
                            onNavigate('chat')
                          }}
                          onRemoved={() => {
                            requestAnimationFrame(() => newChatButton.current?.focus())
                          }}
                        />
                      ))}
                  </div>
                )}
              </section>
            </div>

            <div className="mt-auto px-2 pb-2">
              <div
                className={`relative flex h-8 items-center border-t px-3 text-xs text-muted-foreground ${expanded ? 'border-sidebar-border' : 'border-transparent'}`}
                title={chat.info?.name ?? 'OpenCode'}
                role="status"
                aria-label={`OpenCode ${chat.connection.replace('_', ' ')}`}
              >
                <span
                  className={`size-1.5 shrink-0 rounded-full ${chat.connection === 'ready' ? 'bg-emerald-400' : 'bg-muted-foreground'}`}
                  aria-hidden="true"
                />
                <span className="talo-sidebar-status-label" aria-hidden="true">
                  OpenCode · {chat.connection.replace('_', ' ')}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                title="Settings"
                aria-label="Settings"
                aria-current={section === 'settings' ? 'page' : undefined}
                onClick={() => onNavigate('settings')}
                className={`relative h-8 w-full justify-start rounded-xl px-2 text-[13px] font-medium transition-none ${section === 'settings' ? 'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent dark:hover:bg-sidebar-accent' : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'}`}
              >
                <Settings2 className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                <span className="talo-sidebar-label" aria-hidden="true">
                  Settings
                </span>
              </Button>
            </div>
          </aside>
        </div>

        <div
          ref={workspaceColumn}
          className="talo-workspace-column mr-3 flex min-h-0 min-w-0 flex-1 flex-col"
        >
          <div
            ref={workspace}
            className="talo-body haze-pane flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-[0_12px_36px_rgba(0,0,0,0.08)]"
            data-has-haze={Boolean(imageUrl)}
            data-section={section}
            data-session-empty={sessionEmpty}
            data-background-scope={background.scope}
          >
            {imageUrl ? (
              <GradientBlurBackground />
            ) : section === 'chat' ? (
              <div
                className="chat-atmosphere pointer-events-none absolute inset-0 -z-10"
                aria-hidden="true"
              />
            ) : null}
            <div className="repository-background" aria-hidden="true" />
            <main
              tabIndex={section === 'chat' ? 0 : undefined}
              className="flex min-h-0 flex-1 flex-col overflow-y-auto outline-none"
            >
              {children}
            </main>
          </div>
          <TerminalPanel workspace={workspace} />
        </div>
      </div>
    </div>
  )
}
