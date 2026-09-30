import { useLayoutEffect, useRef } from 'react'
import { ArrowUp, LoaderCircle, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { Message } from '@/services/persistence'
import type { ChatConversation } from './use-chat-conversation'
import { ModelPicker } from './model-picker'
import { ChatWelcome } from './chat-welcome'
import { useChatViewTransition } from './use-chat-view-transition'

function MessageBubble({ message, chat }: { message: Message; chat: ChatConversation }) {
  const isAssistant = message.role === 'assistant'
  const streaming = chat.live?.messageId === message.id
  const content = streaming && chat.live ? chat.live.text || message.content : message.content
  const status = streaming ? 'streaming' : message.status

  return (
    <li className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}>
      <div
        data-message-id={message.id}
        data-message-role={message.role}
        className={`max-w-[90%] min-w-0 rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[80%] ${isAssistant ? 'border border-border/70 bg-card/75 text-foreground' : 'bg-foreground text-background'}`}
      >
        <p className="whitespace-pre-wrap wrap-break-word">
          {content || (status === 'streaming' ? 'Waiting for OpenCode…' : '')}
        </p>
        {isAssistant && (status !== 'completed' || (streaming && chat.live?.tool)) && (
          <p role="status" className="mt-2 text-xs text-muted-foreground">
            {streaming && chat.live?.tool ? `Tool: ${chat.live.tool} · ` : ''}
            {status === 'streaming'
              ? 'Responding…'
              : status === 'failed'
                ? 'Failed'
                : 'Interrupted'}
          </p>
        )}
      </div>
    </li>
  )
}

export function ChatPage({ chat }: { chat: ChatConversation }) {
  const scrollEnd = useRef<HTMLLIElement>(null)
  const submitting = useRef(false)
  const hasTranscript = chat.messages.length > 0 || chat.live !== null
  const { rootRef, composerRef, transcriptRef, beginSend } = useChatViewTransition({
    hasTranscript,
    loadingHistory: chat.loadingHistory,
    activeId: chat.activeId,
  })
  const canSend =
    chat.listenerReady &&
    chat.activity === 'idle' &&
    !chat.loadingHistory &&
    !chat.sessionMissing &&
    (chat.info?.installed || chat.info?.available)
  const canStop = chat.activity === 'sending' && chat.live !== null
  const messages =
    chat.live && !chat.messages.some((message) => message.id === chat.live?.messageId)
      ? [
          ...chat.messages,
          {
            id: chat.live.messageId,
            conversationId: chat.activeId ?? '',
            sequence: chat.messages.length + 1,
            role: 'assistant' as const,
            content: '',
            status: 'streaming' as const,
            createdAt: '',
            updatedAt: '',
          },
        ]
      : chat.messages

  useLayoutEffect(() => {
    scrollEnd.current?.scrollIntoView({ block: 'end', behavior: 'instant' })
  }, [messages.length, chat.live?.text])

  async function send() {
    if (!canSend || !chat.draft.trim() || submitting.current) return
    submitting.current = true
    const settled = beginSend(chat.draft.trim())
    try {
      await chat.send()
    } finally {
      submitting.current = false
      settled()
    }
  }

  function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    void send()
  }

  return (
    <div
      ref={rootRef}
      className={`chat-page flex min-h-0 flex-1 flex-col items-center px-5 pt-8 pb-[clamp(2.5rem,5vh,4rem)] sm:px-8 ${hasTranscript ? '' : 'justify-center'}`}
    >
      <div className={`flex w-full max-w-3xl flex-col ${hasTranscript ? 'min-h-0 flex-1' : ''}`}>
        {!hasTranscript && !chat.loadingHistory && <ChatWelcome />}
        {hasTranscript ? (
          <ol
            ref={transcriptRef}
            aria-label="Conversation"
            aria-live="polite"
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-6"
          >
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} chat={chat} />
            ))}
            <li ref={scrollEnd} aria-hidden="true" className="list-none" />
          </ol>
        ) : chat.loadingHistory ? (
          <p role="status" className="mb-8 text-center text-sm text-muted-foreground">
            Loading conversation…
          </p>
        ) : null}
        {chat.error && (
          <div
            role="alert"
            className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-foreground"
          >
            <span>{chat.error}</span>
            {chat.sessionMissing ? (
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void chat.retrySession()
                  }}
                >
                  Retry
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={chat.newChat}>
                  New chat
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  void chat.refreshStatus()
                }}
              >
                Retry
              </Button>
            )}
          </div>
        )}
        <form
          ref={composerRef}
          onSubmit={submit}
          className="chat-composer flex min-h-30 flex-col rounded-2xl border p-4"
        >
          <label htmlFor="chat-message" className="sr-only">
            Message
          </label>
          <Textarea
            id="chat-message"
            value={chat.draft}
            onChange={(event) => chat.setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                void send()
              }
            }}
            placeholder="Ask anything…"
            disabled={!canSend}
            className="min-h-10 flex-1 resize-none border-0 bg-transparent p-0 text-base leading-relaxed shadow-none placeholder:text-muted-foreground/80 disabled:cursor-not-allowed disabled:bg-transparent disabled:opacity-100 focus-visible:ring-0 md:text-base dark:bg-transparent dark:disabled:bg-transparent"
          />
          <div className="flex items-center justify-between gap-4 pt-1">
            <div className="flex min-w-0 items-center gap-2">
              <ModelPicker key={chat.activity === 'idle' ? 'idle' : 'busy'} chat={chat} />
              {(chat.connection === 'not_installed' || chat.connection === 'error') && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void chat.refreshStatus()
                  }}
                  className="shrink-0 text-xs"
                >
                  Check again
                </Button>
              )}
            </div>
            <div className="flex min-w-0 shrink-0 items-center gap-1">
              {canStop || chat.activity === 'cancelling' ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    void chat.stop()
                  }}
                  disabled={chat.activity === 'cancelling'}
                  aria-label="Stop response"
                  className="size-10 rounded-full p-0"
                >
                  <span className="flex size-[30px] items-center justify-center rounded-full bg-foreground text-background">
                    <Square className="size-3 fill-current" aria-hidden="true" />
                  </span>
                </Button>
              ) : (
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  disabled={!canSend || !chat.draft.trim()}
                  aria-label="Send message"
                  className="size-10 rounded-full p-0 disabled:opacity-60"
                >
                  <span className="flex size-[30px] items-center justify-center rounded-full bg-foreground text-background">
                    {chat.activity === 'connecting' || chat.activity === 'sending' ? (
                      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <ArrowUp className="size-4" aria-hidden="true" />
                    )}
                  </span>
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
