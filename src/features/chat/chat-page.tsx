import { ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function ChatPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-5 pt-8 pb-[clamp(2.5rem,5vh,4rem)] sm:px-8">
      <h1 className="sr-only">Chat</h1>
      <div className="w-full max-w-4xl">
        <div className="chat-composer flex min-h-36 flex-col rounded-3xl border p-4 sm:min-h-40 sm:p-5">
          <label htmlFor="chat-message" className="sr-only">
            Message
          </label>
          <Textarea
            id="chat-message"
            placeholder="Ask anything…"
            disabled
            className="min-h-14 flex-1 resize-none border-0 bg-transparent p-0 text-lg leading-relaxed shadow-none placeholder:text-muted-foreground/80 disabled:cursor-not-allowed disabled:bg-transparent disabled:opacity-100 focus-visible:ring-0 md:text-lg dark:bg-transparent dark:disabled:bg-transparent"
          />
          <div className="flex items-end justify-between gap-4 pt-2">
            <span
              role="status"
              className="inline-flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-muted-foreground"
            >
              <span
                className="size-1.5 shrink-0 rounded-full bg-muted-foreground/70"
                aria-hidden="true"
              />
              <span className="truncate">No provider connected</span>
            </span>
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
      </div>
    </div>
  )
}
