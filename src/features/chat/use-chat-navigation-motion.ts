import { useLayoutEffect, useRef } from 'react'

export function useChatNavigationMotion(panelIds: string[]) {
  const workspaceRef = useRef<HTMLDivElement>(null)
  const previousPanels = useRef<string[] | null>(null)
  const panelKey = JSON.stringify(panelIds)

  useLayoutEffect(() => {
    const ids: string[] = JSON.parse(panelKey)
    const previous = previousPanels.current
    previousPanels.current = ids
    const workspace = workspaceRef.current
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!previous || !workspace || preference.matches) return

    const animations: Animation[] = []
    const timing = { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
    for (const panel of workspace.querySelectorAll<HTMLElement>('[data-chat-panel]')) {
      if (previous.includes(panel.dataset.chatPanel!) || typeof panel.animate !== 'function')
        continue

      // Keep the composer anchored; only the reading surface settles into place.
      const content = panel.querySelector<HTMLElement>('.chat-scroll-viewport, .chat-welcome')
      if (content) {
        animations.push(
          content.animate(
            [
              { opacity: 0.35, transform: 'translateY(6px)' },
              { opacity: 1, transform: 'translateY(0)' },
            ],
            timing,
          ),
        )
      }
    }

    const stop = () => {
      for (const animation of animations) animation.cancel()
    }
    const handlePreference = () => {
      if (preference.matches) stop()
    }
    preference.addEventListener('change', handlePreference)
    return () => {
      preference.removeEventListener('change', handlePreference)
      stop()
    }
  }, [panelKey])

  return workspaceRef
}
