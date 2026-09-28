import { invoke } from '@tauri-apps/api/core'
import { toAppError } from './errors'

export type AppInfo = { name: string; version: string }

export async function getAppInfo(): Promise<AppInfo> {
  try {
    return await invoke<AppInfo>('get_app_info')
  } catch (error) {
    throw toAppError(error)
  }
}

export async function supportsWindowTranslucency(): Promise<boolean> {
  try {
    return await invoke<boolean>('supports_window_translucency')
  } catch (error) {
    throw toAppError(error)
  }
}

export async function supportsWindowBackgroundBlur(): Promise<boolean> {
  try {
    return await invoke<boolean>('supports_window_background_blur')
  } catch (error) {
    throw toAppError(error)
  }
}

export async function setWindowBackgroundBlur(radius: number): Promise<void> {
  try {
    await invoke('set_window_background_blur', { radius })
  } catch (error) {
    throw toAppError(error)
  }
}

export async function setWindowTranslucency(enabled: boolean): Promise<void> {
  try {
    await invoke('set_window_translucency', { enabled })
  } catch (error) {
    throw toAppError(error)
  }
}
