import { isTauri } from '@tauri-apps/api/core'

export const isMacDesktop = isTauri() && /^Mac/.test(navigator.platform)
