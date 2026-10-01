import { useLayoutEffect, useRef } from 'react'
import { ArrowUp, LoaderCircle, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { Message } from '@/services/persistence'
import type { ChatConversation } from './use-chat-conversation'
import { ModelPicker } from './model-picker'
import { BranchPicker } from './branch-picker'
import { ReasoningPicker } from './reasoning-picker'
import { ChatWelcome } from './chat-welcome'
import { ChatThinking } from './chat-thinking'
import { useChatViewTransition } from './use-chat-view-transition'

function ChatMessage({ message, chat }: { message: Message; chat: ChatConversation }) {
  const isAssistant = message.role === 'assistant'
  const streaming = chat.live?.messageId === message.id
  const content = streaming && chat.live ? chat.live.text || message.content : message.content
  const status = streaming ? 'streaming' : message.status

  return (
    <li className={`flex shrink-0 ${isAssistant ? 'justify-start' : 'justify-end'}`}>
      <div
        data-message-id={message.id}
        data-message-role={message.role}
        className={
          isAssistant
            ? 'chat-assistant-message w-full min-w-0 text-[15px] leading-7 text-foreground'
            : 'chat-user-message max-w-[90%] min-w-0 rounded-[20px] px-4 py-2.5 text-[15px] leading-relaxed sm:max-w-[80%]'
        }
      >
        <p className="whitespace-pre-wrap wrap-break-word">{content}</p>
        {isAssistant && (status !== 'completed' || (streaming && chat.live?.tool)) && (
          <p role="status" className="mt-2 text-xs text-muted-foreground">
            {streaming && chat.live?.tool ? `Tool: ${chat.live.tool} · ` : ''}
            {status === 'streaming'
              ? chat.activity === 'cancelling'
                ? 'Deteniendo…'
                : 'Responding…'
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
  const scrollViewport = useRef<HTMLDivElement>(null)
  const followLatest = useRef(true)
  const previousConversation = useRef({ activeId: chat.activeId, loading: chat.loadingHistory })
  const submitting = useRef(false)
  const response =
    chat.live?.text ||
    chat.messages.find((message) => message.id === chat.live?.messageId)?.content ||
    ''
  const waiting = chat.activity !== 'idle' && !response.trim()
  const hasTranscript = chat.messages.length > 0 || chat.live !== null || waiting
  const { rootRef, composerRef, transcriptRef, beginSend } = useChatViewTransition({
    hasTranscript,
    loadingHistory: chat.loadingHistory,
    activeId: chat.activeId,
  })
  const canSend =
    chat.listenerReady &&
    chat.activity === 'idle' &&
    !chat.deletingId &&
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
    const previous = previousConversation.current
    previousConversation.current = { activeId: chat.activeId, loading: chat.loadingHistory }
    if (previous.activeId !== chat.activeId || (previous.loading && !chat.loadingHistory)) {
      followLatest.current = true
    }
    const viewport = scrollViewport.current
    if (viewport && followLatest.current) viewport.scrollTop = viewport.scrollHeight
  }, [chat.activeId, chat.loadingHistory, chat.messages, chat.live?.text, chat.live?.tool])

  useLayoutEffect(() => {
    const viewport = scrollViewport.current
    const transcript = transcriptRef.current
    if (!viewport || !transcript) return
    const observer = new ResizeObserver(() => {
      if (followLatest.current) viewport.scrollTop = viewport.scrollHeight
    })
    observer.observe(viewport)
    observer.observe(transcript)
    return () => observer.disconnect()
  }, [hasTranscript, transcriptRef])

  async function send() {
    if (!canSend || !chat.draft.trim() || submitting.current) return
    submitting.current = true
    followLatest.current = true
    const viewport = scrollViewport.current
    if (viewport) viewport.scrollTop = viewport.scrollHeight
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
      data-has-transcript={hasTranscript}
      className={`chat-page relative isolate flex min-h-0 flex-1 flex-col items-center overflow-hidden pt-6 pb-[clamp(1.25rem,2.5vh,2rem)] ${hasTranscript ? '' : 'justify-center'}`}
    >
      {hasTranscript && (
        <div
          ref={scrollViewport}
          className="chat-scroll-viewport min-h-0 w-full flex-1 overflow-y-auto"
          onScroll={(event) => {
            const viewport = event.currentTarget
            followLatest.current =
              viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 72
          }}
        >
          <ol
            ref={transcriptRef}
            aria-label="Conversation"
            aria-live="polite"
            className="chat-transcript mx-auto flex w-full max-w-3xl flex-col gap-7 pt-3 pb-7"
          >
            {messages.map((message) =>
              waiting &&
              message.id === chat.live?.messageId &&
              message.role === 'assistant' ? null : (
                <ChatMessage key={message.id} message={message} chat={chat} />
              ),
            )}
            {waiting && (
              <ChatThinking
                key="chat-pending-response"
                cancelling={chat.activity === 'cancelling'}
                tool={chat.live?.tool ?? null}
              />
            )}
          </ol>
        </div>
      )}
      <div key="composer" className="chat-composer-area flex max-w-3xl shrink-0 flex-col">
        {!hasTranscript && !chat.loadingHistory && <ChatWelcome />}
        {!hasTranscript && chat.loadingHistory && (
          <p role="status" className="mb-8 text-center text-sm text-muted-foreground">
            Loading conversation…
          </p>
        )}
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
                  disabled={chat.activity !== 'idle' || Boolean(chat.deletingId)}
                  onClick={() => {
                    void chat.retrySession()
                  }}
                >
                  Retry
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={chat.activity !== 'idle' || Boolean(chat.deletingId)}
                  onClick={chat.newChat}
                >
                  New chat
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={chat.activity !== 'idle' || Boolean(chat.deletingId)}
                onClick={() => {
                  void chat.refreshStatus()
                }}
              >
                Retry
              </Button>
            )}
          </div>
        )}
        <BranchPicker disabled={chat.tabs.some((tab) => tab.activity !== 'idle')} />
        <form
          ref={composerRef}
          onSubmit={submit}
          className="chat-composer flex min-h-30 shrink-0 flex-col rounded-3xl border p-4"
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
          <div className="flex items-end justify-between gap-2 pt-1 sm:gap-4">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <ModelPicker key={chat.activity === 'idle' ? 'idle' : 'busy'} chat={chat} />
              <ReasoningPicker
                key={`reasoning-${chat.activity === 'idle' ? 'idle' : 'busy'}`}
                chat={chat}
              />
              {(chat.connection === 'not_installed' || chat.connection === 'error') && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={chat.activity !== 'idle' || Boolean(chat.deletingId)}
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
