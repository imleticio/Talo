import { useEffect, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { isMacDesktop } from '@/lib/platform'
import { toAppError } from '@/services/errors'
import {
  setWindowBackgroundBlur,
  setWindowTranslucency,
  supportsWindowBackgroundBlur,
  supportsWindowTranslucency,
} from '@/services/tauri'

const STORAGE_KEY = 'talo.window-translucency'
const DEFAULT_OPACITY = 85
const DEFAULT_RADIUS = 24

type Preference = { enabled: boolean; opacity: number; radius: number }

function readPreference(): Preference {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (typeof value === 'object' && value !== null && 'enabled' in value && 'opacity' in value) {
      return {
        enabled: value.enabled === true,
        opacity:
          typeof value.opacity === 'number' && Number.isFinite(value.opacity)
            ? Math.max(15, Math.min(100, value.opacity))
            : DEFAULT_OPACITY,
        radius:
          'radius' in value && typeof value.radius === 'number' && Number.isFinite(value.radius)
            ? Math.round(Math.max(1, Math.min(64, value.radius)))
            : DEFAULT_RADIUS,
      }
    }
  } catch {
    // Storage can be unavailable; the appearance still works for this session.
  }
  return { enabled: true, opacity: DEFAULT_OPACITY, radius: DEFAULT_RADIUS }
}

function savePreference(preference: Preference): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preference))
    return true
  } catch {
    return false
  }
}

export function initializeWindowAppearance() {
  document.documentElement.classList.toggle('is-macos-desktop', isMacDesktop)
  document.documentElement.style.setProperty(
    '--window-glass-opacity',
    String(readPreference().opacity / 100),
  )
  document.documentElement.classList.add('glass-body')
}

export type WindowTranslucency = {
  supported: boolean
  radiusSupported: boolean
  enabled: boolean
  opacity: number
  radius: number
  loading: boolean
  busy: boolean
  error: string | null
  toggle: (enabled: boolean) => Promise<void>
  changeOpacity: (opacity: number) => void
  changeRadius: (radius: number) => Promise<void>
}

export function useWindowTranslucency(): WindowTranslucency {
  const [supported, setSupported] = useState(false)
  const [radiusSupported, setRadiusSupported] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [opacity, setOpacity] = useState(() => readPreference().opacity)
  const [radius, setRadius] = useState(() => readPreference().radius)
  const [loading, setLoading] = useState(() => isTauri())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isTauri()) return

    let active = true
    let firstFrame = 0
    let secondFrame = 0
    Promise.all([supportsWindowTranslucency(), supportsWindowBackgroundBlur()])
      .then(([available, macBlur]) => {
        if (!active) return
        setSupported(available)
        setRadiusSupported(macBlur)
        const preference = readPreference()
        // Native launch stays opaque until the UI has painted twice.
        firstFrame = requestAnimationFrame(() => {
          secondFrame = requestAnimationFrame(() => {
            void (async () => {
              try {
                if (macBlur) await setWindowBackgroundBlur(preference.radius)
                if (
                  available &&
                  preference.enabled &&
                  document.documentElement.classList.contains('dark')
                ) {
                  await setWindowTranslucency(true)
                  if (active) setEnabled(true)
                }
              } catch (reason) {
                if (active) setError(toAppError(reason).message)
              } finally {
                if (active) setLoading(false)
              }
            })()
          })
        })
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(toAppError(reason).message)
          setLoading(false)
        }
      })
    return () => {
      active = false
      cancelAnimationFrame(firstFrame)
      cancelAnimationFrame(secondFrame)
    }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('window-glass', enabled)
    return () => {
      document.documentElement.classList.remove('window-glass')
    }
  }, [enabled])

  useEffect(() => {
    document.documentElement.style.setProperty('--window-glass-opacity', String(opacity / 100))
  }, [opacity])

  async function toggle(next: boolean) {
    if (loading || busy || !supported) return
    setBusy(true)
    setError(null)
    try {
      await setWindowTranslucency(next)
      setEnabled(next)
      if (!savePreference({ enabled: next, opacity, radius })) {
        setError('Window appearance changed, but the preference could not be saved.')
      }
    } catch (reason) {
      setError(toAppError(reason).message)
    } finally {
      setBusy(false)
    }
  }

  function changeOpacity(next: number) {
    const value = Math.max(15, Math.min(100, next))
    setOpacity(value)
    setError(null)
    if (!savePreference({ enabled, opacity: value, radius })) {
      setError('Window appearance changed, but the preference could not be saved.')
    }
  }

  async function changeRadius(next: number) {
    if (!radiusSupported || busy) return
    const value = Math.round(Math.max(1, Math.min(64, next)))
    setBusy(true)
    setError(null)
    try {
      await setWindowBackgroundBlur(value)
      setRadius(value)
      if (!savePreference({ enabled, opacity, radius: value })) {
        setError('Window appearance changed, but the preference could not be saved.')
      }
    } catch (reason) {
      setError(toAppError(reason).message)
    } finally {
      setBusy(false)
    }
  }

  return {
    supported,
    radiusSupported,
    enabled,
    opacity,
    radius,
    loading,
    busy,
    error,
    toggle,
    changeOpacity,
    changeRadius,
  }
}
