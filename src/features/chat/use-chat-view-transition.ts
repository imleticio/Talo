import { useLayoutEffect, useRef } from 'react'

type PendingSend = {
  text: string
  ids: Set<string>
  source: DOMRect
  color: string
  started: boolean
}

type EmptyLayout = {
  composer: DOMRect
  borderRadius: string
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
  const transcriptRef = useRef<HTMLOListElement>(null)
  const emptyLayout = useRef<EmptyLayout | null>(null)
  const previous = useRef({ hasTranscript, loadingHistory, activeId })
  const running = useRef<(() => void) | null>(null)
  const reducedMotion = useRef<MediaQueryList | null>(null)
  const pendingSend = useRef<PendingSend | null>(null)
  const sendEffect = useRef<(() => void) | null>(null)
  const reflection = useRef<(() => void) | null>(null)

  function cancelSend() {
    pendingSend.current = null
    sendEffect.current?.()
    reflection.current?.()
  }

  function beginSend(text: string) {
    cancelSend()
    const composer = composerRef.current
    const input = composer?.querySelector('textarea')
    if (
      !composer ||
      !input ||
      reducedMotion.current?.matches ||
      typeof composer.animate !== 'function'
    )
      return () => {}

    // Capture the visible source, including any in-progress composer FLIP.
    const pending: PendingSend = {
      text,
      ids: new Set(
        Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[data-message-id]') ?? []).map(
          (element) => element.dataset.messageId!,
        ),
      ),
      source: input.getBoundingClientRect(),
      color: getComputedStyle(input).color,
      started: false,
    }
    pendingSend.current = pending
    const light = document.createElement('span')
    light.className = 'chat-send-reflection'
    light.setAttribute('aria-hidden', 'true')
    light.inert = true
    composer.append(light)
    const gleam = light.animate(
      [
        { opacity: 0, backgroundPosition: '130% 0' },
        { opacity: 0.65, offset: 0.25 },
        { opacity: 0, backgroundPosition: '-30% 0' },
      ],
      { duration: 560, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    )
    const clearReflection = () => {
      gleam.cancel()
      light.remove()
      if (reflection.current === clearReflection) reflection.current = null
    }
    reflection.current = clearReflection
    void gleam.finished.then(clearReflection, () => {})

    // A failed send may never create a bubble. Allow React's final render and
    // its measurement frame to run before discarding the pending destination.
    return () => {
      requestAnimationFrame(() => {
        if (pendingSend.current === pending && !pending.started) cancelSend()
      })
    }
  }

  useLayoutEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion.current = preference
    const stop = () => {
      if (preference.matches) {
        running.current?.()
        cancelSend()
      }
    }
    preference.addEventListener('change', stop)
    return () => {
      preference.removeEventListener('change', stop)
      running.current?.()
      cancelSend()
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
        borderRadius: getComputedStyle(composer).borderRadius,
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
    if (loadingHistory || navigating || (!hasTranscript && before.hasTranscript)) cancelSend()

    if (!hasTranscript || loadingHistory) {
      if (loadingHistory) emptyLayout.current = null
      return
    }
    const source = emptyLayout.current
    emptyLayout.current = null
    const composer = composerRef.current
    const transcript = transcriptRef.current
    const root = rootRef.current
    if (
      before.hasTranscript ||
      before.loadingHistory ||
      navigating ||
      !source ||
      !composer ||
      !transcript ||
      !root ||
      reducedMotion.current?.matches ||
      typeof composer.animate !== 'function'
    )
      return

    const destination = composer.getBoundingClientRect()
    const destinationStyle = getComputedStyle(composer)
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
          width: `${source.composer.width}px`,
          borderRadius: source.borderRadius,
        },
        {
          transform: 'none',
          width: `${destination.width}px`,
          borderRadius: destinationStyle.borderRadius,
        },
      ],
      { duration: 680, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
    )
    const farewell = ghost.animate(
      [
        { opacity: 1, transform: 'translateY(0)' },
        { opacity: 0, transform: 'translateY(-16px)' },
      ],
      {
        duration: 340,
        easing: 'ease-in-out',
        fill: 'forwards',
      },
    )
    const entrance = transcript.animate(
      [
        { opacity: 0, transform: 'translateY(18px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      {
        delay: 150,
        duration: 440,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        fill: 'backwards',
      },
    )
    const cleanup = () => {
      movement.cancel()
      farewell.cancel()
      entrance.cancel()
      ghost.remove()
      if (running.current === cleanup) running.current = null
    }
    farewell.onfinish = () => ghost.remove()
    movement.onfinish = cleanup
    running.current = cleanup
  }, [hasTranscript, loadingHistory, activeId])

  // Run after the page's autoscroll layout effect and before the next paint.
  // The real user bubble can arrive well after the assistant placeholder.
  useLayoutEffect(() => {
    const pending = pendingSend.current
    const root = rootRef.current
    const transcript = transcriptRef.current
    if (!pending || pending.started || !root || !transcript) return
    const bubble = Array.from(
      transcript.querySelectorAll<HTMLElement>('[data-message-role="user"]'),
    ).find(
      (element) =>
        !pending.ids.has(element.dataset.messageId!) &&
        element.querySelector('p')?.textContent === pending.text,
    )
    if (!bubble) return
    pending.started = true
    // Hide before the next paint, while autoscroll settles the destination.
    // Otherwise the real bubble flashes before its flying copy takes over.
    const opacity = bubble.style.opacity
    bubble.style.opacity = '0'
    const frame = requestAnimationFrame(() => {
      if (pendingSend.current !== pending || !bubble.isConnected) return
      // Keep the departing text attached to the composer's visible position,
      // including its first-send movement while the message is being created.
      const source =
        composerRef.current?.querySelector('textarea')?.getBoundingClientRect() ?? pending.source
      const bounds = bubble.getBoundingClientRect()
      const viewport = transcript.getBoundingClientRect()
      const compact =
        bounds.height <= Math.min(140, source.height + 80) &&
        bounds.width <= source.width + 32 &&
        bounds.top >= viewport.top &&
        bounds.bottom <= viewport.bottom
      const ghost = compact ? (bubble.cloneNode(true) as HTMLElement) : null
      let animation: Animation
      let follow = 0
      const material: Animation[] = []
      const destination = () => {
        const rect = bubble.getBoundingClientRect()
        // The transcript still has an entrance translation on first send.
        // Land at its final layout position, rather than its moving position.
        const transform = getComputedStyle(transcript).transform
        const shift = transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42
        return { left: rect.left, top: rect.top - shift }
      }
      if (ghost) {
        ghost.classList.add('chat-send-copy')
        ghost.removeAttribute('data-message-id')
        ghost.removeAttribute('data-message-role')
        ghost.setAttribute('aria-hidden', 'true')
        ghost.inert = true
        const surface = getComputedStyle(bubble)
        const target = destination()
        Object.assign(ghost.style, {
          // The real bubble is hidden before cloning; its flight must remain visible.
          opacity,
          position: 'fixed',
          left: `${target.left}px`,
          top: `${target.top}px`,
          width: `${bounds.width}px`,
          maxWidth: 'none',
          margin: '0',
          zIndex: '10',
          pointerEvents: 'none',
        })
        const text = ghost.querySelector('p')!
        const sourceText = text.cloneNode(true) as HTMLElement
        sourceText.classList.add('chat-send-source-text')
        Object.assign(sourceText.style, {
          position: 'absolute',
          inset: '0',
          padding: surface.padding,
          color: pending.color,
          textShadow: `0 1px 2px ${surface.color}`,
        })
        ghost.append(sourceText)
        root.append(ghost)
        composerRef.current?.classList.add('chat-transfer-active')
        // Opacity preserves the real content and live-region accessibility.
        bubble.style.opacity = '0'
        const keyframes = () => {
          const target = destination()
          const x = target.left - parseFloat(ghost.style.left)
          const y = target.top - parseFloat(ghost.style.top)
          return [
            {
              transform: `translate(${source.left - parseFloat(surface.paddingLeft) - parseFloat(ghost.style.left)}px, ${source.top - parseFloat(surface.paddingTop) - parseFloat(ghost.style.top)}px)`,
              backgroundColor: 'transparent',
              color: surface.color,
              borderRadius: '12px',
              boxShadow: '0 8px 24px -12px rgb(0 0 0 / 0)',
            },
            { backgroundColor: 'transparent', offset: 0.14 },
            { backgroundColor: surface.backgroundColor, offset: 0.3 },
            {
              transform: `translate(${x}px, ${y}px)`,
              backgroundColor: surface.backgroundColor,
              color: surface.color,
              borderRadius: surface.borderRadius,
              boxShadow: surface.boxShadow,
            },
          ]
        }
        animation = ghost.animate(keyframes(), {
          duration: 580,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'both',
        })
        // Separate source and destination ink so inverse colors never blend
        // into the forming surface and disappear against the same middle gray.
        const inkTiming = {
          duration: 580,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'both' as const,
        }
        material.push(
          sourceText.animate(
            [
              { opacity: 1 },
              { opacity: 1, offset: 0.14 },
              { opacity: 0, offset: 0.3 },
              { opacity: 0 },
            ],
            inkTiming,
          ),
          text.animate(
            [
              { opacity: 0 },
              { opacity: 0, offset: 0.14 },
              { opacity: 1, offset: 0.3 },
              { opacity: 1 },
            ],
            inkTiming,
          ),
        )
        // Streaming and autoscroll can move the destination during the flight.
        const track = () => {
          const rect = bubble.getBoundingClientRect()
          const viewport = transcript.getBoundingClientRect()
          if (
            !bubble.isConnected ||
            rect.top < viewport.top ||
            rect.bottom > viewport.bottom ||
            Math.abs(rect.width - bounds.width) > 1 ||
            Math.abs(rect.height - bounds.height) > 1
          ) {
            cancelSend()
            return
          }
          const effect = animation.effect as KeyframeEffect
          effect.setKeyframes(keyframes())
          follow = requestAnimationFrame(track)
        }
        follow = requestAnimationFrame(track)
      } else {
        // Large messages retain their complete real layout and readable text.
        bubble.style.opacity = opacity
        animation = bubble.animate(
          [
            { opacity: 0, transform: 'translateY(8px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
        )
      }
      const cleanup = () => {
        cancelAnimationFrame(follow)
        animation.cancel()
        for (const ink of material) ink.cancel()
        ghost?.remove()
        bubble.style.opacity = opacity
        composerRef.current?.classList.remove('chat-transfer-active')
        if (pendingSend.current === pending) pendingSend.current = null
        if (sendEffect.current === cleanup) sendEffect.current = null
      }
      sendEffect.current = cleanup
      void animation.finished.then(cleanup, () => {})
    })
    const cancelFrame = () => {
      cancelAnimationFrame(frame)
      bubble.style.opacity = opacity
      if (sendEffect.current === cancelFrame) sendEffect.current = null
    }
    sendEffect.current = cancelFrame
    // A subsequent render must not cancel a flight already started by this frame.
  })

  return { rootRef, composerRef, transcriptRef, beginSend }
}
