import { isValidElement, memo } from 'react'
import Markdown, { type Components } from 'react-markdown'
import type { Message } from '@/services/persistence'
import type { ChatConversation } from './use-chat-conversation'

const markdownComponents: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  img: ({ alt }) => <span className="chat-image-description">{alt || 'Image'}</span>,
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

export const ChatMessage = memo(function ChatMessage({ message, live }: { message: Message; live: ChatConversation['live'] }) {
  const streaming = live?.messageId === message.id
  const content = streaming && live ? live.text || message.content : message.content
  const status = streaming ? 'streaming' : message.status

  if (message.role !== 'assistant') {
    return (
      <li className={`chat-message chat-message-${message.role}`} data-message-id={message.id}>
        <div className={message.role === 'user' ? 'chat-user-bubble' : 'chat-notice'}>
          <p className="chat-message-text">{content}</p>
        </div>
      </li>
    )
  }

  return (
    <li className="chat-message chat-message-assistant" data-message-id={message.id}>
      <article className="chat-assistant-surface" aria-label="Talo response" aria-busy={streaming}>
        <header className="chat-response-header">
          <img src="/talo-logo.png" alt="" className="chat-response-mark" />
          <span>Talo</span>
        </header>
        {content ? (
          <div className="chat-prose">
            <Markdown skipHtml components={markdownComponents}>
              {content}
            </Markdown>
          </div>
        ) : status === 'streaming' ? (
          <p className="chat-thinking" role="status">
            <span className="chat-thinking-light" aria-hidden="true" />
            Thinking…
          </p>
        ) : (
          <p className="chat-response-status">No response was returned.</p>
        )}
        {(status !== 'completed' || (streaming && live?.tool)) && (
          <p className="chat-response-status" role="status">
            {streaming && live?.tool
              ? `Using ${live.tool}`
              : status === 'streaming'
                ? content
                  ? 'Responding…'
                  : null
                : status === 'failed'
                  ? 'Response failed'
                  : 'Response interrupted'}
          </p>
        )}
      </article>
    </li>
  )
})
