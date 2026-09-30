import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { Message } from '@/services/persistence'

type PendingSend = {
  text: string
  messageIds: Set<string>
  composer: DOMRect
  input: DOMRect
  welcome: { element: HTMLElement; bounds: DOMRect } | null
  moved: boolean
}

const motionAllowed = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches
const easing = 'cubic-bezier(0.22, 1, 0.36, 1)'

export function useChatMotion({
  messages,
  hasTranscript,
  sending,
}: {
  messages: Message[]
  hasTranscript: boolean
  sending: boolean
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const pending = useRef<PendingSend | null>(null)
  const knownMessages = useRef(new Set<string>())
  const animations = useRef(new Set<Animation>())
  const ghosts = useRef(new Set<HTMLElement>())

  const play = useCallback((element: HTMLElement, frames: Keyframe[], duration: number) => {
    if (!motionAllowed() || typeof element.animate !== 'function') return
    const animation = element.animate(frames, { duration, easing })
    animations.current.add(animation)
    void animation.finished.then(
      () => animations.current.delete(animation),
      () => animations.current.delete(animation),
    )
    return animation
  }, [])

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const activeAnimations = animations.current
    const activeGhosts = ghosts.current
    function reset() {
      for (const animation of activeAnimations) animation.cancel()
      for (const ghost of activeGhosts) ghost.remove()
      activeAnimations.clear()
      activeGhosts.clear()
      pending.current = null
    }
    preference.addEventListener('change', reset)
    return () => {
      preference.removeEventListener('change', reset)
      reset()
    }
  }, [])

  useLayoutEffect(() => {
    const root = rootRef.current
    const form = composerRef.current
    const source = pending.current
    if (!root || !form) return
    const rows = new Map(
      Array.from(root.querySelectorAll<HTMLElement>('[data-message-id]')).map((element) => [
        element.dataset.messageId,
        element,
      ]),
    )

    if (source && hasTranscript && !source.moved) {
      source.moved = true
      const destination = form.getBoundingClientRect()
      play(
        form,
        [
          { transform: `translateY(${source.composer.top - destination.top}px)` },
          { transform: 'none' },
        ],
        560,
      )
      if (source.welcome && motionAllowed()) {
        const { element, bounds } = source.welcome
        element.classList.add('chat-welcome-ghost')
        element.setAttribute('aria-hidden', 'true')
        element.inert = true
        Object.assign(element.style, {
          left: `${bounds.left}px`,
          top: `${bounds.top}px`,
          width: `${bounds.width}px`,
          margin: '0',
        })
        root.append(element)
        ghosts.current.add(element)
        const animation = play(
          element,
          [{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(6px)' }],
          240,
        )
        const remove = () => {
          element.remove()
          ghosts.current.delete(element)
        }
        if (animation) void animation.finished.then(remove, remove)
        else remove()
      }
    }

    for (const message of messages) {
      const row = rows.get(message.id)
      if (!row) continue
      if (
        source &&
        message.role === 'user' &&
        !source.messageIds.has(message.id) &&
        message.content === source.text
      ) {
        const bubble = row.querySelector<HTMLElement>('.chat-user-bubble')
        const text = row.querySelector<HTMLElement>('.chat-message-text')
        if (bubble && text) {
          const destination = text.getBoundingClientRect()
          const bounds = bubble.getBoundingClientRect()
          const style = getComputedStyle(bubble)
          // Fly outside the transcript mask so the text stays visible as it leaves the composer.
          const flight = bubble.cloneNode(true) as HTMLElement
          flight.classList.add('chat-message-flight')
          flight.setAttribute('aria-hidden', 'true')
          flight.inert = true
          Object.assign(flight.style, {
            left: `${bounds.left}px`,
            top: `${bounds.top}px`,
            width: `${bounds.width}px`,
            font: style.font,
            letterSpacing: style.letterSpacing,
          })
          if (motionAllowed() && typeof flight.animate === 'function') {
            root.append(flight)
            ghosts.current.add(flight)
            play(bubble, [{ opacity: 0 }, { opacity: 0 }], 560)
            const animation = play(
              flight,
              [
                {
                  transform: `translate(${source.input.left - destination.left}px, ${source.input.top - destination.top}px) scale(0.98)`,
                  opacity: 0.65,
                },
                { transform: 'none', opacity: 1 },
              ],
              560,
            )
            const remove = () => {
              flight.remove()
              ghosts.current.delete(flight)
            }
            if (animation) void animation.finished.then(remove, remove)
            else remove()
          }
        }
        pending.current = null
        break
      }
    }

    for (const message of messages) {
      if (message.role !== 'assistant' || knownMessages.current.has(message.id) || !sending) continue
      const row = rows.get(message.id)
      if (row) play(row, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], 400)
    }
    knownMessages.current = new Set(messages.map((message) => message.id))
  }, [messages, hasTranscript, sending, play])

  function prepareSend(text: string) {
    if (!composerRef.current || !inputRef.current || !motionAllowed()) return () => {}
    const welcome = rootRef.current?.querySelector<HTMLElement>('.chat-welcome')
    const snapshot: PendingSend = {
      text: text.trim(),
      messageIds: new Set(messages.map((message) => message.id)),
      composer: composerRef.current.getBoundingClientRect(),
      input: inputRef.current.getBoundingClientRect(),
      welcome: welcome
        ? { element: welcome.cloneNode(true) as HTMLElement, bounds: welcome.getBoundingClientRect() }
        : null,
      moved: false,
    }
    pending.current = snapshot
    return () => {
      requestAnimationFrame(() => {
        if (pending.current === snapshot) pending.current = null
      })
    }
  }

  return { rootRef, composerRef, inputRef, prepareSend }
}
