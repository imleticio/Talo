import type { AgentUpdate } from '../../services/agent'
import { createAgentActivity, isActivityFinished, reduceAgentActivity } from './agent-activity.ts'
import type { ChatTab } from './chat-tabs-state'

// Transport/run ownership is checked by the hook; this is the testable per-turn transition.
export function applyChatAgentUpdate(
  tab: ChatTab,
  update: AgentUpdate,
  modelName?: string,
): Partial<ChatTab> {
  if (tab.conversationId !== update.conversationId) return {}
  const { event, messageId } = update
  if (event.type === 'started') {
    if (tab.turnActivity[messageId]) return {}
    return {
      live: { messageId, text: '', tool: null },
      turnActivity: {
        ...tab.turnActivity,
        [messageId]: createAgentActivity(Date.now(), modelName),
      },
    }
  }
  if (tab.live?.messageId !== messageId) return {}
  const activity = tab.turnActivity[messageId] ?? createAgentActivity()
  if (isActivityFinished(activity)) return {}
  return {
    turnActivity: { ...tab.turnActivity, [messageId]: reduceAgentActivity(activity, event) },
    ...(event.type === 'delta' ? { live: { ...tab.live, text: tab.live.text + event.text } } : {}),
    ...(event.type === 'error' ? { error: event.message } : {}),
    ...(event.type === 'cancelled' ? { error: null } : {}),
  }
}
