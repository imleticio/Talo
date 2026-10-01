import { isValidElement, memo } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Message } from '@/services/persistence'
import type { ChatConversation } from './use-chat-conversation'
import type { AgentActivityState } from './agent-activity'
import { AgentPulse } from './agent-pulse'

const markdownComponents: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  img: ({ alt }) => <span>{alt || 'Image'}</span>,
  pre: ({ children }) => {
    const language = isValidElement<{ className?: string }>(children)
      ? children.props.className?.replace(/^language-/, '')
      : null
    return (
      <div className="chat-code-block">
        <div className="chat-code-label">{language || 'Code'}</div>
        <pre>{children}</pre>
      </div>
    )
  },
}
const markdownPlugins = [remarkGfm]

export const ChatMessage = memo(function ChatMessage({
  message,
  live,
  pulse,
  cancelling = false,
  onExpandedChange,
}: {
  message: Message
  live: ChatConversation['live']
  pulse?: AgentActivityState
  cancelling?: boolean
  onExpandedChange: (expanded: boolean) => void
}) {
  const isAssistant = message.role === 'assistant'
  const streaming = live?.messageId === message.id
  const content = streaming && live ? live.text || message.content : message.content
  const status = streaming ? 'streaming' : message.status

  return (
    <li className={`flex shrink-0 ${isAssistant ? 'justify-start' : 'justify-end'}`}>
      <div
        data-message-id={message.id}
        data-message-role={message.role}
        className={
          isAssistant
            ? 'chat-assistant-message w-full min-w-0 text-sm leading-6 text-foreground'
            : 'chat-user-message max-w-[90%] min-w-0 rounded-2xl px-3 py-2 text-sm leading-6 sm:max-w-[80%]'
        }
      >
        {isAssistant && pulse && (
          <AgentPulse
            state={pulse}
            cancelling={streaming && cancelling}
            onExpandedChange={onExpandedChange}
          />
        )}
        {isAssistant ? (
          <div className="chat-prose">
            <Markdown skipHtml remarkPlugins={markdownPlugins} components={markdownComponents}>
              {content}
            </Markdown>
          </div>
        ) : (
          <p className="whitespace-pre-wrap wrap-break-word">{content}</p>
        )}
        {isAssistant && !pulse && status !== 'completed' && (
          <p role="status" className="mt-2 text-xs text-muted-foreground">
            {status === 'streaming'
              ? cancelling
                ? 'Stopping…'
                : 'Responding…'
              : status === 'failed'
                ? 'Failed'
                : 'Interrupted'}
          </p>
        )}
      </div>
    </li>
  )
})
