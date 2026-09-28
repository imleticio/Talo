import type { CSSProperties } from 'react'

export function hazeStyle(imageUrl: string, emptyOpacity: number, sessionOpacity: number) {
  return {
    '--chat-background-image': `url(${JSON.stringify(imageUrl)})`,
    '--chat-background-empty-opacity': String(emptyOpacity / 100),
    '--chat-background-session-opacity': String(sessionOpacity / 100),
  } as CSSProperties
}
