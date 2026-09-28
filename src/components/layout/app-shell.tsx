import { useState, type ReactNode } from 'react'
import { FolderClosed, MessageSquare, PanelLeftClose, PanelLeftOpen, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GradientBlurBackground } from '@/features/chat/gradient-blur-background'
import { hazeStyle } from '@/features/chat/haze-style'
import type { ChatBackground } from '@/features/settings/use-chat-background'
import { isMacDesktop } from '@/lib/platform'
import { navigation, type Section } from './navigation'

type AppShellProps = {
  section: Section
  onNavigate: (section: Section) => void
  background: ChatBackground
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

export function AppShell({ section, onNavigate, background, children }: AppShellProps) {
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
          className={`talo-sidebar flex shrink-0 flex-col bg-sidebar text-sidebar-foreground ${expanded ? 'w-72' : 'w-[76px]'}`}
          aria-label="Main navigation"
        >
          <div
            data-tauri-drag-region={isMacDesktop ? 'deep' : undefined}
            className={`talo-brand flex h-14 shrink-0 items-center ${expanded ? 'px-4' : 'justify-center'}`}
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

          <nav
            className={`flex flex-col gap-1 ${expanded ? 'px-3' : 'items-center px-2'}`}
            aria-label="Sections"
          >
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
                  className={`${expanded ? 'h-11 w-full justify-start pr-3 pl-4.5 text-[13px]' : 'size-11 p-0'} relative rounded-xl font-medium transition-none ${section === item.id ? 'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent dark:hover:bg-sidebar-accent' : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'}`}
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
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <MessageSquare className="size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                <span>No conversations yet</span>
              </div>
            </section>
          </div>

          <div className={`mt-auto pb-4 ${expanded ? 'px-3' : 'flex flex-col items-center px-2'}`}>
            <div
              className={`relative flex h-10 items-center text-xs text-muted-foreground ${expanded ? 'border-t border-sidebar-border px-6' : 'justify-center'}`}
              title="No provider connected"
              role="status"
              aria-label="No provider connected"
            >
              <span
                className="size-1.5 shrink-0 rounded-full bg-muted-foreground"
                aria-hidden="true"
              />
              <span className="talo-sidebar-status-label" aria-hidden="true">
                No provider connected
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              title="Settings"
              aria-label="Settings"
              aria-current={section === 'settings' ? 'page' : undefined}
              onClick={() => onNavigate('settings')}
              className={`${expanded ? 'h-11 w-full justify-start pr-3 pl-4.5 text-[13px]' : 'size-11 p-0'} relative rounded-xl font-medium transition-none ${section === 'settings' ? 'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent dark:hover:bg-sidebar-accent' : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'}`}
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
          data-session-empty="true"
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
