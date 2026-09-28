import type { ReactNode } from 'react'

type EmptyStateProps = {
  icon: ReactNode
  title: string
  description: string
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-start justify-center px-8 py-16">
      <div className="mb-6 flex size-9 items-center justify-center rounded-lg border border-border bg-white/4 text-muted-foreground">
        {icon}
      </div>
      <h1 className="text-2xl font-medium tracking-[-0.04em]">{title}</h1>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  )
}
