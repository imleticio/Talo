import { ArrowUpRight, CodeXml, Compass, Lightbulb } from 'lucide-react'

const starters = [
  {
    title: 'Explore an idea',
    description: 'Find a clear direction for a rough thought.',
    icon: Lightbulb,
    prompt:
      'Help me explore an idea. Ask me what I have in mind, then help me shape it into something concrete.',
  },
  {
    title: 'Make a plan',
    description: 'Break something ambitious into next steps.',
    icon: Compass,
    prompt:
      'Help me make a practical plan. Ask me about my goal and constraints, then break it into clear, manageable steps.',
  },
  {
    title: 'Review some code',
    description: 'Get a fresh perspective on what you built.',
    icon: CodeXml,
    prompt:
      'Help me review some code for correctness, clarity, and maintainability. Ask me to share the code and what it should do.',
  },
]

type ChatStartersProps = {
  disabled: boolean
  onChoose: (prompt: string) => void
}

export function ChatStarters({ disabled, onChoose }: ChatStartersProps) {
  return (
    <section aria-label="Suggested prompts" className="chat-starters mt-6">
      <p className="mb-3 px-1 text-xs font-medium text-muted-foreground">A few ways to begin</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {starters.map(({ title, description, icon: Icon, prompt }) => (
          <button
            key={title}
            type="button"
            disabled={disabled}
            onClick={() => onChoose(prompt)}
            className="chat-starter group flex min-w-0 items-start gap-3 rounded-xl border p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-default disabled:opacity-50 sm:flex-col"
          >
            <span className="flex shrink-0 items-center justify-between sm:w-full">
              <Icon className="size-4 text-muted-foreground" strokeWidth={1.6} aria-hidden="true" />
              <ArrowUpRight
                className="hidden size-3.5 text-muted-foreground transition-colors group-hover:text-foreground sm:block"
                strokeWidth={1.6}
                aria-hidden="true"
              />
            </span>
            <span className="block min-w-0">
              <span className="block text-sm font-medium text-foreground">{title}</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                {description}
              </span>
            </span>
          </button>
        ))}
      </div>
      <p className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span>
          <kbd className="font-sans">Enter</kbd> to send
        </span>
        <span className="h-3 w-px bg-border" aria-hidden="true" />
        <span>
          <kbd className="font-sans">Shift + Enter</kbd> for a new line
        </span>
      </p>
    </section>
  )
}
