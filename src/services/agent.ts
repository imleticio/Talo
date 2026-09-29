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

export type AgentEvent =
  | { type: 'started' | 'completed' | 'cancelled' }
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string; state: string }
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
export const opencodeCreateSession = (conversationId: string) =>
  call<ExternalSession>('opencode_create_session', { conversationId })
export const opencodeGetSession = (conversationId: string) =>
  call<ExternalSession>('opencode_get_session', { conversationId })
export const opencodeSendMessage = (conversationId: string, content: string) =>
  call<Message>('opencode_send_message', { conversationId, content })
export const opencodeCancel = (conversationId: string) =>
  call<void>('opencode_cancel', { conversationId })
