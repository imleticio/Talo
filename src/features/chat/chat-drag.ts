export const CHAT_DRAG_TYPE = 'application/x-talo-chat'

export type ChatDrag = { tabId: string } | { conversationId: string }

export const CHAT_POINTER_DRAG = 'talo:chat-pointer-drag'
export type ChatPointerDrag = {
  payload: ChatDrag
  x: number
  y: number
  phase: 'move' | 'drop' | 'cancel'
}

// Pointer dragging works inside WKWebView without handing the gesture to the OS.
export function beginChatDrag(event: ReactPointerEvent<HTMLElement>, payload: ChatDrag) {
  if (event.button !== 0 || !event.isPrimary) return
  const start = { x: event.clientX, y: event.clientY }
  const pointerId = event.pointerId
  let dragging = false
  const source = event.currentTarget
  const emit = (phase: ChatPointerDrag['phase'], x: number, y: number) => {
    window.dispatchEvent(
      new CustomEvent<ChatPointerDrag>(CHAT_POINTER_DRAG, {
        detail: { payload, x, y, phase },
      }),
    )
  }
  const move = (next: PointerEvent) => {
    if (next.pointerId !== pointerId) return
    if (!dragging && Math.hypot(next.clientX - start.x, next.clientY - start.y) < 6) return
    dragging = true
    next.preventDefault()
    document.documentElement.classList.add('chat-dragging')
    emit('move', next.clientX, next.clientY)
  }
  const cleanup = () => {
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('pointerup', finish, true)
    window.removeEventListener('pointercancel', cancel, true)
    window.removeEventListener('keydown', keydown, true)
    window.removeEventListener('blur', cancel)
    document.documentElement.classList.remove('chat-dragging')
  }
  const suppressClick = () => {
    const stop = (click: MouseEvent) => {
      click.preventDefault()
      click.stopImmediatePropagation()
    }
    // The click follows pointerup in the same event turn, including after Escape.
    source.addEventListener('click', stop, { capture: true, once: true })
    setTimeout(() => source.removeEventListener('click', stop, true), 0)
  }
  const finish = (next: PointerEvent) => {
    if (next.pointerId !== pointerId) return
    cleanup()
    if (!dragging) return
    suppressClick()
    emit('drop', next.clientX, next.clientY)
  }
  const cancel = () => {
    cleanup()
    if (dragging) {
      emit('cancel', start.x, start.y)
      // Keep the release from activating a tab after a cancelled drag.
      window.addEventListener('pointerup', suppressClick, { once: true, capture: true })
    }
  }
  const keydown = (next: KeyboardEvent) => {
    if (next.key === 'Escape') cancel()
  }
  window.addEventListener('pointermove', move, { capture: true, passive: false })
  window.addEventListener('pointerup', finish, true)
  window.addEventListener('pointercancel', cancel, true)
  window.addEventListener('keydown', keydown, true)
  window.addEventListener('blur', cancel)
}

export function readChatDrag(data: string): ChatDrag | null {
  try {
    const value: unknown = JSON.parse(data)
    if (!value || typeof value !== 'object') return null
    if ('tabId' in value && typeof value.tabId === 'string') return { tabId: value.tabId }
    if ('conversationId' in value && typeof value.conversationId === 'string')
      return { conversationId: value.conversationId }
  } catch {
    // Ignore external or malformed drag payloads.
  }
  return null
}
import type { PointerEvent as ReactPointerEvent } from 'react'
