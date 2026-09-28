import { Bot } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'

export function AgentsPage() {
  return (
    <EmptyState
      icon={<Bot className="size-5" />}
      title="No agents yet"
      description="Agent management will arrive in a future release."
    />
  )
}
