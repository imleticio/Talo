import { MessageSquare } from 'lucide-react'
import { OpenCodeMark } from './opencode-mark'

// Service identity comes from the linked session, independently of its model provider.
const agentMarks = {
  opencode: OpenCodeMark,
}

export function ChatAgentMark({ agentId }: { agentId?: string | null }) {
  const Mark = agentMarks[agentId as keyof typeof agentMarks] ?? MessageSquare
  return (
    <span className="flex size-3.5 shrink-0 items-center justify-center" title={agentId ?? 'Chat'}>
      <Mark className="size-3 text-muted-foreground/65" />
    </span>
  )
}
