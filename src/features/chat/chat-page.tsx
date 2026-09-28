import { ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function ChatPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-5 pt-8 pb-[clamp(2.5rem,5vh,4rem)] sm:px-8">
      <h1 className="sr-only">Chat</h1>
      <div className="w-full max-w-3xl">
        <div className="chat-composer flex min-h-30 flex-col rounded-2xl border p-4">
          <label htmlFor="chat-message" className="sr-only">
            Message
          </label>
          <Textarea
            id="chat-message"
            placeholder="Ask anything…"
            disabled
            className="min-h-10 flex-1 resize-none border-0 bg-transparent p-0 text-base leading-relaxed shadow-none placeholder:text-muted-foreground/80 disabled:cursor-not-allowed disabled:bg-transparent disabled:opacity-100 focus-visible:ring-0 md:text-base dark:bg-transparent dark:disabled:bg-transparent"
          />
          <div className="flex items-center justify-between gap-4 pt-1">
            <span
              role="status"
              className="inline-flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-muted-foreground"
            >
              <span
                className="size-1.5 shrink-0 rounded-full bg-muted-foreground/70"
                aria-hidden="true"
              />
              <span className="truncate">No provider connected</span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled
              aria-label="Send message (unavailable)"
              className="size-10 rounded-full p-0 disabled:opacity-60"
            >
              <span className="flex size-[30px] items-center justify-center rounded-full bg-foreground text-background">
                <ArrowUp className="size-4" aria-hidden="true" />
              </span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
