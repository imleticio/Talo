import { FolderKanban } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'

export function ProjectsPage() {
  return (
    <EmptyState
      icon={<FolderKanban className="size-5" />}
      title="No projects yet"
      description="Project management will arrive in a future release."
    />
  )
}
