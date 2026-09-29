import { invoke } from '@tauri-apps/api/core'
import { toAppError } from './errors'

export type Project = {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

export type Conversation = {
  id: string
  projectId: string | null
  title: string
  createdAt: string
  updatedAt: string
}

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'
export type MessageStatus = 'completed' | 'streaming' | 'failed' | 'interrupted'

export type Message = {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  status: MessageStatus
  createdAt: string
  updatedAt: string
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    throw toAppError(error)
  }
}

export const createProject = (name: string, description: string | null = null) =>
  call<Project>('create_project', { name, description })
export const listProjects = () => call<Project[]>('list_projects')
export const getProject = (projectId: string) => call<Project>('get_project', { projectId })
export const updateProject = (projectId: string, name: string, description: string | null = null) =>
  call<Project>('update_project', { projectId, name, description })
export const deleteProject = (projectId: string) => call<void>('delete_project', { projectId })

// Omit the filter to include standalone conversations.
export const createConversation = (title: string, projectId: string | null = null) =>
  call<Conversation>('create_conversation', { title, projectId })
export const listConversations = (projectId: string | null = null) =>
  call<Conversation[]>('list_conversations', { projectId })
export const getConversation = (conversationId: string) =>
  call<Conversation>('get_conversation', { conversationId })
export const renameConversation = (conversationId: string, title: string) =>
  call<Conversation>('rename_conversation', { conversationId, title })
export const deleteConversation = (conversationId: string) =>
  call<void>('delete_conversation', { conversationId })

export const createMessage = (
  conversationId: string,
  role: MessageRole,
  content: string,
  status: MessageStatus = 'completed',
) => call<Message>('create_message', { conversationId, role, content, status })
export const listMessages = (conversationId: string) =>
  call<Message[]>('list_messages', { conversationId })
export const updateMessage = (messageId: string, content: string, status: MessageStatus) =>
  call<Message>('update_message', { messageId, content, status })
