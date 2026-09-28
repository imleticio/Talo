import { useState } from 'react'
import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { toAppError } from '@/services/errors'

const STORAGE_KEY = 'talo.chat-background'
export const MAX_CHAT_BACKGROUND_OPACITY = 70

type BackgroundScope = 'empty' | 'all'
type Preference = {
  imagePath: string | null
  effect: 'gradient-blur'
  scope: BackgroundScope
  emptyOpacity: number
  sessionOpacity: number
}

const defaults: Preference = {
  imagePath: null,
  effect: 'gradient-blur',
  scope: 'all',
  emptyOpacity: 24,
  sessionOpacity: 14,
}

function opacity(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.max(0, Math.min(MAX_CHAT_BACKGROUND_OPACITY, value)))
    : fallback
}

function readPreference(): Preference {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (stored && typeof stored === 'object') {
      const value = stored as Partial<Preference>
      return {
        imagePath: typeof value.imagePath === 'string' ? value.imagePath : null,
        effect: 'gradient-blur',
        scope: value.scope === 'empty' ? 'empty' : 'all',
        emptyOpacity: opacity(value.emptyOpacity, defaults.emptyOpacity),
        sessionOpacity: opacity(value.sessionOpacity, defaults.sessionOpacity),
      }
    }
  } catch {
    // The background remains usable for this session if storage is unavailable.
  }
  return defaults
}

export type ChatBackground = Preference & {
  imageUrl: string | null
  supported: boolean
  busy: boolean
  error: string | null
  selectImage: () => Promise<void>
  clearImage: () => void
  setScope: (scope: BackgroundScope) => void
  setEmptyOpacity: (value: number) => void
  setSessionOpacity: (value: number) => void
}

export function useChatBackground(): ChatBackground {
  const [preference, setPreference] = useState(readPreference)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supported = isTauri()

  function update(next: Preference) {
    setPreference(next)
    setError(null)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      setError('Background changed, but the preference could not be saved.')
    }
  }

  async function selectImage() {
    if (!supported || busy) return
    setBusy(true)
    setError(null)
    try {
      const path = await open({
        multiple: false,
        directory: false,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
      })
      if (path) {
        const imagePath = await invoke<string>('save_chat_background', { path })
        update({ ...preference, imagePath })
      }
    } catch (reason) {
      setError(toAppError(reason).message)
    } finally {
      setBusy(false)
    }
  }

  return {
    ...preference,
    imageUrl: supported && preference.imagePath ? convertFileSrc(preference.imagePath) : null,
    supported,
    busy,
    error,
    selectImage,
    clearImage: () => update({ ...preference, imagePath: null }),
    setScope: (scope) => update({ ...preference, scope }),
    setEmptyOpacity: (value) =>
      update({ ...preference, emptyOpacity: opacity(value, defaults.emptyOpacity) }),
    setSessionOpacity: (value) =>
      update({ ...preference, sessionOpacity: opacity(value, defaults.sessionOpacity) }),
  }
}
