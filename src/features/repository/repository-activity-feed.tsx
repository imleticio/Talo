import {
  repositoryActivities,
  type ActivityPullRequest,
  type GitWorkspace,
} from './repository-activity'

const activityStyles = {
  merge: { label: 'Merge', color: 'text-purple-700 dark:text-purple-300' },
  commit: { label: 'Commit', color: 'text-emerald-700 dark:text-emerald-300' },
  pr: { label: 'Pull request', color: 'text-blue-700 dark:text-blue-300' },
}

export function RepositoryActivityFeed({
  workspace,
  prs,
  loading,
  localError,
  githubError,
}: {
  workspace: GitWorkspace | null
  prs: ActivityPullRequest[]
  loading: boolean
  localError: string | null
  githubError: string | null
}) {
  const events = repositoryActivities(workspace?.commits ?? [], prs, workspace?.branch ?? null)
  return (
    <section aria-labelledby="recent-activity-heading" className="border-t border-border/60 pt-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 id="recent-activity-heading" className="text-sm font-medium">
          Recent activity
        </h2>
        <span className="text-xs text-muted-foreground">Git &amp; pull requests</span>
      </div>
      {loading && (
        <p role="status" className="mb-3 text-xs text-muted-foreground">
          Refreshing activity…
        </p>
      )}
      {localError && (
        <p role="status" className="mb-3 text-xs text-muted-foreground">
          Local Git unavailable: {localError}
        </p>
      )}
      {githubError && (
        <p role="status" className="mb-3 text-xs text-muted-foreground">
          GitHub activity unavailable: {githubError}
        </p>
      )}
      {!loading && !events.length && (
        <p className="text-sm text-muted-foreground">
          {localError || githubError
            ? 'No activity available from the connected sources.'
            : 'No repository activity yet.'}
        </p>
      )}
      <ol className="repository-activity">
        {events.map((event) => {
          const style = activityStyles[event.type]
          const metadata = event.metadata
          return (
            <li key={event.id} className="relative pb-5 pl-6 last:pb-0">
              <span className={`repository-commit-marker ${style.color}`} aria-hidden="true" />
              <p className="max-w-prose break-words text-sm font-medium">
                {event.title}
                <span
                  className={`ml-2 inline-block px-1.5 py-0.5 align-middle text-[10px] leading-none font-normal ${style.color}`}
                >
                  {style.label}
                  {event.type === 'pr' ? ` ${event.metadata.action}` : ''}
                </span>
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {'number' in metadata && metadata.number && <span>#{metadata.number}</span>}
                {'source' in metadata && metadata.source && (
                  <span>
                    {metadata.source} → {metadata.target}
                  </span>
                )}
                {'hash' in metadata && metadata.hash && (
                  <code title={metadata.hash}>{metadata.hash.slice(0, 7)}</code>
                )}
                {event.author && <span>· {event.author}</span>}
                <span>·</span>
                <time dateTime={event.timestamp} title={new Date(event.timestamp).toLocaleString()}>
                  {new Date(event.timestamp).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </time>
              </p>
              {event.type === 'merge' && event.metadata.commit && (
                <p className="mt-1 max-w-prose break-words text-xs text-muted-foreground">
                  Commit: {event.metadata.commit.message} · {event.metadata.commit.author} ·{' '}
                  <time dateTime={event.metadata.commit.date}>
                    {new Date(event.metadata.commit.date).toLocaleString()}
                  </time>
                </p>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
