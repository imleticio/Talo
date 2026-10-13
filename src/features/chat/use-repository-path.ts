import { useSyncExternalStore } from 'react'

const storageKey = 'talo.git-repository'
const changedEvent = 'talo:repository-changed'
let selectedPath: string | null | undefined

export function repositoryPath() {
  if (selectedPath !== undefined) return selectedPath
  try {
    return localStorage.getItem(storageKey)
  } catch {
    return null
  }
}

export function saveRepositoryPath(path: string) {
  selectedPath = path
  try {
    localStorage.setItem(storageKey, path)
  } finally {
    window.dispatchEvent(new Event(changedEvent))
  }
}

function subscribe(listener: () => void) {
  const storageChanged = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) {
      selectedPath = undefined
      listener()
    }
  }
  window.addEventListener(changedEvent, listener)
  window.addEventListener('storage', storageChanged)
  return () => {
    window.removeEventListener(changedEvent, listener)
    window.removeEventListener('storage', storageChanged)
  }
}

export function useRepositoryPath() {
  return useSyncExternalStore(subscribe, repositoryPath, () => null)
}
