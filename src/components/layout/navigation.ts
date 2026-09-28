import { Bot, FolderKanban, MessageSquare, Settings2 } from 'lucide-react'

export const navigation = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'settings', label: 'Settings', icon: Settings2 },
] as const

export type Section = (typeof navigation)[number]['id']
