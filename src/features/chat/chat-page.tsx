import { ArrowUp, Bot, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function ChatPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-5 pt-8 pb-[clamp(2.5rem,5vh,4rem)] sm:px-8">
      <h1 className="sr-only">Chat</h1>
      <div className="w-full max-w-4xl">
        <div className="flex min-h-36 flex-col rounded-3xl border border-white/10 bg-card/90 p-4 shadow-[0_20px_48px_rgba(0,0,0,0.12)] sm:min-h-40 sm:p-5">
          <label htmlFor="chat-message" className="sr-only">
            Message
          </label>
          <Textarea
            id="chat-message"
            placeholder="Ask anything…"
            disabled
            className="min-h-14 flex-1 resize-none border-0 bg-transparent p-0 text-lg leading-relaxed shadow-none placeholder:text-muted-foreground/80 disabled:cursor-not-allowed disabled:bg-transparent disabled:opacity-100 focus-visible:ring-0 md:text-lg dark:bg-transparent dark:disabled:bg-transparent"
          />
          <div className="flex items-center justify-between gap-4 pt-2">
            <div className="flex min-w-0 items-center gap-3 text-sm text-muted-foreground">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled
                aria-label="Attach file (unavailable)"
                className="size-9 rounded-full disabled:opacity-60"
              >
                <Paperclip className="size-5" aria-hidden="true" />
              </Button>
              <span className="flex min-w-0 items-center gap-2">
                <Bot className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">No model connected</span>
              </span>
            </div>
            <Button
              type="button"
              size="icon"
              disabled
              aria-label="Send message (unavailable)"
              className="size-11 rounded-full bg-foreground text-background disabled:opacity-60"
            >
              <ArrowUp className="size-5" aria-hidden="true" />
            </Button>
          </div>
        </div>
        <p className="mt-3 px-4 text-xs text-muted-foreground/80 sm:px-5">
          Chat will be available when an AI provider is connected.
        </p>
      </div>
    </div>
  )
}
