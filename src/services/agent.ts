import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { toAppError } from './errors'
import type { Message } from './persistence'

export type AgentInfo = {
  name: string
  installed: boolean
  available: boolean
  version: string | null
  endpoint: string | null
}

export type ExternalSession = { conversationId: string; externalId: string }

export type AgentModel = {
  providerId: string
  providerName: string
  modelId: string
  name: string
  variants: string[]
}

export type AgentModelChoice = {
  providerId: string
  modelId: string
  variant: string | null
}

export type AgentTask = {
  id: string
  label: string
  state: 'pending' | 'active' | 'completed' | 'cancelled' | 'failed'
}

export type AgentAction =
  'read' | 'search' | 'edit' | 'write' | 'create' | 'delete' | 'command' | 'tool'
export type AgentTool = {
  id: string
  name: string
  state: 'pending' | 'running' | 'completed' | 'error'
  action: AgentAction
  title: string
  path: string | null
  command: string | null
  output: string | null
  exitCode: number | null
  files: string[]
}

export type AgentEvent =
  | { type: 'started' | 'completed' | 'cancelled' }
  | { type: 'delta'; text: string }
  | ({ type: 'tool' } & AgentTool)
  | { type: 'tasks'; tasks: AgentTask[] }
  | { type: 'status'; text: string }
  | { type: 'attention'; id: string; title: string; detail: string | null }
  | { type: 'attention_resolved'; id: string }
  | { type: 'files_changed'; files: string[] }
  | { type: 'error'; message: string }

export type AgentUpdate = { conversationId: string; messageId: string; event: AgentEvent }

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    throw toAppError(error)
  }
}

export const onAgentUpdate = (handler: (update: AgentUpdate) => void) =>
  listen<AgentUpdate>('agent:update', ({ payload }) => handler(payload))
export const opencodeStatus = () => call<AgentInfo>('opencode_status')
export const opencodeModels = () => call<AgentModel[]>('opencode_models')
export const opencodeCreateSession = (conversationId: string) =>
  call<ExternalSession>('opencode_create_session', { conversationId })
export const opencodeGetSession = (conversationId: string) =>
  call<ExternalSession>('opencode_get_session', { conversationId })
export const opencodeSendMessage = (
  conversationId: string,
  content: string,
  model: AgentModelChoice | null = null,
) => call<Message>('opencode_send_message', { conversationId, content, model })
export const opencodeCancel = (conversationId: string) =>
  call<void>('opencode_cancel', { conversationId })
