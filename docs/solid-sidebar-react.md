# Implement Talo's animated sidebar in React with a solid background

This guide ports Talo's current sidebar interaction to a standalone React + TypeScript project: a 48px collapsed rail, a 14rem expanded panel, stationary icons, fading labels, and a 280ms content transition. The example uses plain CSS and opaque colors, with no Tailwind, shadcn, Tauri, routing library, or animation-library dependency.

## Quick start

1. Install the icons: `npm install lucide-react`.
2. Create `SidebarLayout.tsx` and `sidebar-layout.css` using the examples below.
3. Wrap your page content in `SidebarLayout` and connect `activeId` and `onNavigate` to your application's navigation.
4. Change `--sidebar-background` to your desired solid color.

The source repository is React + Vite, not Next.js. Next.js also uses React; the interaction can be shared, but navigation and server-rendering integration depend on the destination project.

## How the animation works

| Element            | Behavior                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| Sidebar slot       | Changes immediately between 48px and 14rem, reserving the final layout space.                         |
| Sidebar panel      | Stays 14rem wide. `clip-path` reveals or hides its right side over 280ms.                             |
| Main content       | Uses the Web Animations API to translate and scale from its previous visual bounds to its new bounds. |
| Labels and details | Stay mounted; fade in after 60ms and fade out over 90ms.                                              |
| Icons              | Keep the same position in the collapsed and expanded states.                                          |

This is a FLIP-style transition: measure the previous rectangle, commit the new layout, measure the new rectangle, and animate the inverse transform back to identity. The width change still triggers layout, but width is not animated on every frame. Scaling the content can briefly stretch text; this is also a tradeoff of Talo's current approach. `clip-path` performance depends on the browser and page complexity, so verify with your actual content.

## 1. Create `SidebarLayout.tsx`

This example targets React 19, matching Talo, and uses its boolean `inert` support. For an older React version, verify support before copying the JSX unchanged.

```tsx
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { FolderClosed, MessageSquare, PanelLeftClose, PanelLeftOpen, Settings2 } from 'lucide-react'
import './sidebar-layout.css'

const items = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'projects', label: 'Projects', icon: FolderClosed },
  { id: 'settings', label: 'Settings', icon: Settings2 },
] as const

export type SectionId = (typeof items)[number]['id']

type SidebarLayoutProps = {
  activeId: SectionId
  onNavigate: (id: SectionId) => void
  children: ReactNode
}

const STORAGE_KEY = 'app.sidebar-expanded'

function readExpanded(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function SidebarLayout({ activeId, onNavigate, children }: SidebarLayoutProps) {
  const [expanded, setExpanded] = useState(readExpanded)
  const sidebarId = useId()
  const workspace = useRef<HTMLDivElement>(null)
  const sidebar = useRef<HTMLElement>(null)
  const toggleButton = useRef<HTMLButtonElement>(null)
  const previousBounds = useRef<DOMRect | null>(null)
  const animation = useRef<Animation | null>(null)

  useLayoutEffect(() => {
    const element = workspace.current
    const before = previousBounds.current
    previousBounds.current = null
    if (!element || !before) return

    animation.current?.cancel()
    const after = element.getBoundingClientRect()
    if (
      !after.width ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      typeof element.animate !== 'function'
    )
      return

    animation.current = element.animate(
      [
        {
          transform: `translateX(${before.left - after.left}px) scaleX(${before.width / after.width})`,
        },
        { transform: 'translateX(0) scaleX(1)' },
      ],
      { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    )
  }, [expanded])

  useLayoutEffect(() => () => animation.current?.cancel(), [])

  function toggleSidebar() {
    // Capture the visible rectangle before canceling an interrupted animation.
    previousBounds.current = workspace.current?.getBoundingClientRect() ?? null
    const next = !expanded
    if (!next && sidebar.current?.contains(document.activeElement)) {
      toggleButton.current?.focus()
    }
    setExpanded(next)
    try {
      localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      // Navigation remains usable when storage is unavailable.
    }
  }

  return (
    <div className="sidebar-layout">
      <div className="sidebar-slot" data-expanded={expanded}>
        <aside
          ref={sidebar}
          id={sidebarId}
          className="solid-sidebar"
          data-expanded={expanded}
          aria-label="Main navigation"
        >
          <header className="sidebar-header">
            <button
              ref={toggleButton}
              type="button"
              className="sidebar-toggle"
              onClick={toggleSidebar}
              aria-expanded={expanded}
              aria-controls={sidebarId}
              aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
              title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {expanded ? (
                <PanelLeftClose aria-hidden="true" />
              ) : (
                <PanelLeftOpen aria-hidden="true" />
              )}
            </button>
          </header>

          <nav className="sidebar-navigation" aria-label="Sections">
            {items
              .filter((item) => item.id !== 'settings')
              .map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="sidebar-item"
                  onClick={() => onNavigate(item.id)}
                  aria-current={activeId === item.id ? 'page' : undefined}
                  aria-label={item.label}
                  title={item.label}
                >
                  <item.icon aria-hidden="true" />
                  <span className="sidebar-label" aria-hidden="true">
                    {item.label}
                  </span>
                </button>
              ))}
          </nav>

          <div className="sidebar-details" aria-hidden={!expanded} inert={!expanded}>
            <h2>Projects</h2>
            <p>No projects yet</p>
            <h2>Recent chats</h2>
            <p>No conversations yet</p>
          </div>

          <footer className="sidebar-footer">
            <button
              type="button"
              className="sidebar-item"
              onClick={() => onNavigate('settings')}
              aria-current={activeId === 'settings' ? 'page' : undefined}
              aria-label="Settings"
              title="Settings"
            >
              <Settings2 aria-hidden="true" />
              <span className="sidebar-label" aria-hidden="true">
                Settings
              </span>
            </button>
          </footer>
        </aside>
      </div>

      <div ref={workspace} className="sidebar-workspace">
        <main className="sidebar-main">{children}</main>
      </div>
    </div>
  )
}
```

## 2. Create `sidebar-layout.css`

All surface colors below are opaque. Label opacity is an animation effect, not a translucent sidebar background.

```css
.sidebar-layout {
  --sidebar-collapsed: 48px;
  --sidebar-expanded: 14rem;
  --sidebar-background: #18181b;
  --sidebar-foreground: #fafafa;
  --sidebar-muted: #a1a1aa;
  --sidebar-accent: #303036;
  --workspace-background: #101013;
  display: flex;
  height: 100dvh;
  min-width: 0;
  background: var(--sidebar-background);
  color: var(--sidebar-foreground);
}

.sidebar-layout,
.sidebar-layout * {
  box-sizing: border-box;
}
.sidebar-slot {
  position: relative;
  flex-shrink: 0;
  width: var(--sidebar-collapsed);
}
.sidebar-slot[data-expanded='true'] {
  width: var(--sidebar-expanded);
}

.solid-sidebar {
  display: flex;
  flex-direction: column;
  width: var(--sidebar-expanded);
  height: 100%;
  background: var(--sidebar-background);
  clip-path: inset(0 calc(var(--sidebar-expanded) - var(--sidebar-collapsed)) 0 0);
  transition: clip-path 280ms cubic-bezier(0.22, 1, 0.36, 1);
}
.solid-sidebar[data-expanded='true'] {
  clip-path: inset(0);
}
.sidebar-header {
  display: flex;
  align-items: center;
  height: 40px;
  flex-shrink: 0;
  padding: 0 8px;
}
.sidebar-navigation {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 8px;
}
.sidebar-footer {
  margin-top: auto;
  padding: 0 8px 8px;
}
.solid-sidebar:not([data-expanded='true']) .sidebar-navigation,
.solid-sidebar:not([data-expanded='true']) .sidebar-footer {
  width: var(--sidebar-collapsed);
}

.sidebar-toggle,
.sidebar-item {
  display: flex;
  align-items: center;
  position: relative;
  height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--sidebar-muted);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.sidebar-toggle {
  width: 32px;
  justify-content: center;
}
.sidebar-item {
  width: 100%;
  text-align: left;
}
.sidebar-toggle svg,
.sidebar-item svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}
.sidebar-toggle:hover,
.sidebar-item:hover,
.sidebar-item[aria-current='page'] {
  background: var(--sidebar-accent);
  color: var(--sidebar-foreground);
}
.sidebar-toggle:focus-visible,
.sidebar-item:focus-visible {
  outline: 2px solid var(--sidebar-foreground);
  outline-offset: -2px;
}
.sidebar-label {
  position: absolute;
  left: 40px;
  white-space: nowrap;
}
.sidebar-details {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin-top: 32px;
  padding: 4px 20px;
}
.sidebar-details h2 {
  margin: 0 0 16px;
  font-size: 12px;
  font-weight: 500;
}
.sidebar-details p {
  margin: 0 0 32px;
  font-size: 12px;
  color: var(--sidebar-muted);
}
.sidebar-label,
.sidebar-details {
  opacity: 0;
  visibility: hidden;
  transition:
    opacity 90ms ease,
    visibility 0s linear 90ms;
}
.solid-sidebar[data-expanded='true'] .sidebar-label,
.solid-sidebar[data-expanded='true'] .sidebar-details {
  opacity: 1;
  visibility: visible;
  transition:
    opacity 120ms ease-out 60ms,
    visibility 0s linear 60ms;
}
.sidebar-workspace {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  transform-origin: left center;
  display: flex;
  flex-direction: column;
}
.sidebar-main {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 24px;
  background: var(--workspace-background);
}

@media (prefers-reduced-motion: reduce) {
  .solid-sidebar,
  .sidebar-label,
  .sidebar-details {
    transition: none;
  }
}
```

For a full-screen application, remove the browser's default body margin in your global stylesheet: `body { margin: 0; }`. If this layout lives inside an existing shell, replace `height: 100dvh` with the height appropriate to that container.

## 3. Connect it to your application

```tsx
import { useState } from 'react'
import { SidebarLayout, type SectionId } from './SidebarLayout'

export default function App() {
  const [section, setSection] = useState<SectionId>('chat')

  return (
    <SidebarLayout activeId={section} onNavigate={setSection}>
      <h1>{section === 'chat' ? 'Chat' : section === 'projects' ? 'Projects' : 'Settings'}</h1>
    </SidebarLayout>
  )
}
```

For URL-based navigation, derive `activeId` from your router and use its navigation API in `onNavigate`. Use links instead of buttons when an item represents a URL, preserving native open-in-new-tab behavior. Keep the label, icon, and active-state styling.

## Solid-color porting rules

When adapting the original files instead of using this standalone example:

- Keep the slot, fixed-width panel, workspace ref, measurements, and animation together. Copying only the sidebar CSS leaves the main content jumping between widths.
- Remove the sidebar's `data-has-haze` behavior, `hazeStyle`, background-image pseudo-elements, and `GradientBlurBackground` from the extracted layout.
- Do not copy `html.window-glass` overrides or the dark active-item gradient and `backdrop-filter` rules. Use opaque `background` colors for the panel and selected items.
- Keep labels and details mounted. Conditional rendering removes the elements before their fade-out can finish.
- Keep `inert` on collapsed details. Opacity alone does not prevent keyboard focus.

The sample preserves the core interaction, not Talo-specific chat persistence, terminal integration, desktop titlebar, connection status, or scroll-edge masks.

## Server-rendering note

The example above is intended for a browser-rendered React application. Do not copy its `localStorage` state initializer unchanged into an SSR application: the server and browser can render different initial states when a saved preference exists. Use a deterministic initial state, restore the preference after mounting, and enable persistence only after restoration. Layout measurements belong on the client. Consult your framework's client-component and hydration guidance if the destination is Next.js.

## Verification checklist

- [ ] The collapsed rail is 48px; the expanded panel is 14rem.
- [ ] Icons and the toggle remain stationary while labels fade.
- [ ] The content animates when opening and closing, including rapid repeated toggles.
- [ ] The background is opaque, with no image, gradient, or backdrop blur.
- [ ] Hidden details are skipped when navigating with Tab.
- [ ] Reduced-motion mode disables both the CSS transitions and content animation.
- [ ] Reloading restores the preference; blocked storage does not break navigation.
- [ ] Long content scrolls correctly and your actual pages fit the available width.

This is the desktop rail interaction. A mobile overlay drawer requires a separate responsive design and focus-management behavior.

## Reference implementation

- [`src/components/layout/app-shell.tsx`](../src/components/layout/app-shell.tsx): sidebar state, storage, workspace measurements, animation, and markup.
- [`src/index.css`](../src/index.css): `.talo-sidebar-slot`, `.talo-sidebar`, `.talo-workspace-column`, label transitions, and reduced-motion rules.
- [React: `useLayoutEffect`](https://react.dev/reference/react/useLayoutEffect): pre-paint measurements and effect cleanup.
