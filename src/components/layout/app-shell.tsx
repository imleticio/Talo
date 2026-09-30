import { useState, type ReactNode } from 'react'
import { FolderClosed, MessageSquare, PanelLeftClose, PanelLeftOpen, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GradientBlurBackground } from '@/features/chat/gradient-blur-background'
import { hazeStyle } from '@/features/chat/haze-style'
import type { ChatConversation } from '@/features/chat/use-chat-conversation'
import type { ChatBackground } from '@/features/settings/use-chat-background'
import { isMacDesktop } from '@/lib/platform'
import { navigation, type Section } from './navigation'

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

export function AppShell({ section, onNavigate, background, chat, children }: AppShellProps) {
  const [expanded, setExpanded] = useState(initialSidebarState)
  const imageUrl = section !== 'settings' ? background.imageUrl : null

  function toggleSidebar() {
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
        className="talo-titlebar h-3 shrink-0 bg-sidebar"
        aria-hidden="true"
      />
      <div className="flex min-h-0 flex-1">
        <aside
          id="talo-sidebar"
          data-expanded={expanded}
          data-has-haze={Boolean(imageUrl)}
          className="talo-sidebar flex shrink-0 flex-col bg-sidebar text-sidebar-foreground"
          aria-label="Main navigation"
        >
          <div
            data-tauri-drag-region={isMacDesktop ? 'deep' : undefined}
            className="talo-brand flex h-14 shrink-0 items-center px-4"
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
              className="size-11 rounded-xl text-muted-foreground transition-none hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              {expanded ? (
                <PanelLeftClose className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
              ) : (
                <PanelLeftOpen className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
              )}
            </Button>
          </div>

          <nav className="flex flex-col gap-1 px-4" aria-label="Sections">
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
                  className={`relative h-11 w-full justify-start rounded-xl pr-3 pl-3 text-[13px] font-medium transition-none ${section === item.id ? 'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent dark:hover:bg-sidebar-accent' : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'}`}
                >
                  <item.icon className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
                  <span className="talo-sidebar-label" aria-hidden="true">
                    {item.label}
                  </span>
                </Button>
              ))}
          </nav>

          <div
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

            <section aria-labelledby="sidebar-conversations" className="mt-8">
              <h2
                id="sidebar-conversations"
                className="text-xs font-medium text-sidebar-foreground"
              >
                Recent chats
              </h2>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  chat.newChat()
                  onNavigate('chat')
                }}
                disabled={chat.activity !== 'idle'}
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
                      <Button
                        key={conversation.id}
                        type="button"
                        variant="ghost"
                        title={conversation.title}
                        aria-current={chat.activeId === conversation.id ? 'page' : undefined}
                        disabled={chat.activity !== 'idle'}
                        onClick={() => {
                          void chat.openConversation(conversation.id)
                          onNavigate('chat')
                        }}
                        className="h-9 w-full justify-start truncate px-2 text-xs font-normal text-muted-foreground aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-foreground"
                      >
                        <span className="truncate">{conversation.title}</span>
                      </Button>
                    ))}
                </div>
              )}
            </section>
          </div>

          <div className="mt-auto px-4 pb-4">
            <div
              className={`relative flex h-10 items-center border-t px-5.5 text-xs text-muted-foreground ${expanded ? 'border-sidebar-border' : 'border-transparent'}`}
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
              className={`relative h-11 w-full justify-start rounded-xl pr-3 pl-3 text-[13px] font-medium transition-none ${section === 'settings' ? 'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent dark:hover:bg-sidebar-accent' : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'}`}
            >
              <Settings2 className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
              <span className="talo-sidebar-label" aria-hidden="true">
                Settings
              </span>
            </Button>
          </div>
        </aside>

        <div
          className="talo-body haze-pane mr-3 mb-3 flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-[0_12px_36px_rgba(0,0,0,0.08)]"
          data-has-haze={Boolean(imageUrl)}
          data-session-empty={!chat.live && chat.messages.length === 0}
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
          <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
        </div>
      </div>
    </div>
  )
}
