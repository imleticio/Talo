import { useLayoutEffect, useRef } from 'react'

type EmptyLayout = {
  composer: DOMRect
  welcome: HTMLElement
  welcomeBounds: DOMRect
}

export function useChatViewTransition({
  hasTranscript,
  loadingHistory,
  activeId,
}: {
  hasTranscript: boolean
  loadingHistory: boolean
  activeId: string | null
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLFormElement>(null)
  const emptyLayout = useRef<EmptyLayout | null>(null)
  const previous = useRef({ hasTranscript, loadingHistory, activeId })
  const running = useRef<(() => void) | null>(null)
  const reducedMotion = useRef<MediaQueryList | null>(null)

  useLayoutEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion.current = preference
    const stop = () => {
      if (preference.matches) running.current?.()
    }
    preference.addEventListener('change', stop)
    return () => {
      preference.removeEventListener('change', stop)
      running.current?.()
    }
  }, [])

  // Keep source geometry current before React replaces the empty view's layout.
  useLayoutEffect(() => {
    if (hasTranscript || loadingHistory) return
    const root = rootRef.current
    const composer = composerRef.current
    const welcome = root?.querySelector<HTMLElement>('.chat-welcome')
    if (!root || !composer || !welcome) return
    const measure = () => {
      emptyLayout.current = {
        composer: composer.getBoundingClientRect(),
        welcome,
        welcomeBounds: welcome.getBoundingClientRect(),
      }
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    observer.observe(composer)
    observer.observe(welcome)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [hasTranscript, loadingHistory])

  useLayoutEffect(() => {
    const before = previous.current
    previous.current = { hasTranscript, loadingHistory, activeId }
    const navigating = before.activeId !== activeId && before.activeId !== null
    if (!hasTranscript || loadingHistory || navigating) running.current?.()

    if (!hasTranscript || loadingHistory) {
      if (loadingHistory) emptyLayout.current = null
      return
    }
    const source = emptyLayout.current
    emptyLayout.current = null
    const composer = composerRef.current
    const root = rootRef.current
    if (
      before.hasTranscript ||
      before.loadingHistory ||
      navigating ||
      !source ||
      !composer ||
      !root ||
      reducedMotion.current?.matches ||
      typeof composer.animate !== 'function'
    )
      return

    const destination = composer.getBoundingClientRect()
    const ghost = source.welcome.cloneNode(true) as HTMLElement
    ghost.setAttribute('aria-hidden', 'true')
    ghost.inert = true
    Object.assign(ghost.style, {
      position: 'fixed',
      left: `${source.welcomeBounds.left}px`,
      top: `${source.welcomeBounds.top}px`,
      width: `${source.welcomeBounds.width}px`,
      height: `${source.welcomeBounds.height}px`,
      margin: '0',
      pointerEvents: 'none',
    })
    // The outgoing copy keeps the existing scoped appearance without replaying entry animations.
    for (const child of ghost.querySelectorAll<HTMLElement>('*')) child.style.animation = 'none'
    root.append(ghost)
    const movement = composer.animate(
      [
        {
          transform: `translate(${source.composer.left - destination.left}px, ${source.composer.top - destination.top}px)`,
        },
        { transform: 'none' },
      ],
      { duration: 540, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    )
    const farewell = ghost.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 220,
      easing: 'ease-out',
      fill: 'forwards',
    })
    const cleanup = () => {
      movement.cancel()
      farewell.cancel()
      ghost.remove()
      if (running.current === cleanup) running.current = null
    }
    farewell.onfinish = () => ghost.remove()
    movement.onfinish = cleanup
    running.current = cleanup
  }, [hasTranscript, loadingHistory, activeId])

  return { rootRef, composerRef }
}
