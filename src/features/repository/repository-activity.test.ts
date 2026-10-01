/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  repositoryActivities,
  type ActivityPullRequest,
  type GitCommit,
} from './repository-activity.ts'

const commit: GitCommit = {
  hash: 'abc123',
  message: 'Merge PR fix (#42)',
  author: 'Commit author',
  date: '2026-10-01T12:00:00Z',
  parents: ['parent'],
}
const pr: ActivityPullRequest = {
  number: 42,
  title: 'Repository workflow',
  state: 'MERGED',
  createdAt: '2026-10-01T10:00:00Z',
  closedAt: '2026-10-01T13:00:00Z',
  mergedAt: '2026-10-01T13:00:00Z',
  headRefName: 'feature',
  baseRefName: 'main',
  author: { login: 'PR author' },
  mergedBy: { login: 'Merger' },
  mergeCommit: { oid: 'abc123' },
}

test('Git parents, not title keywords, identify merges', () => {
  const normal = repositoryActivities([commit], [], 'feature')
  assert.equal(normal[0].type, 'commit')
  const merge = repositoryActivities(
    [{ ...commit, message: 'Integration', parents: ['a', 'b'] }],
    [],
    'feature',
  )
  assert.equal(merge[0].type, 'merge')
})

test('PR merge is deduplicated against Git while retaining individual commit details', () => {
  const events = repositoryActivities([commit], [pr, pr], 'feature')
  assert.equal(events.length, 2)
  assert.equal(events[0].type, 'merge')
  assert.equal(events[0].timestamp, pr.mergedAt)
  assert.equal(events[0].author, 'Merger')
  if (events[0].type !== 'merge') throw new Error('Expected merge')
  assert.deepEqual(events[0].metadata.commit, commit)
  assert.equal(events[0].metadata.hash, commit.hash)
  assert.equal(events[1].type, 'pr')
  assert.equal(events[1].author, 'PR author')
})

test('closed and open PRs use real lifecycle times without inventing a merge', () => {
  const closed = {
    ...pr,
    state: 'CLOSED' as const,
    mergedAt: null,
    mergedBy: null,
    mergeCommit: null,
  }
  const open = { ...closed, state: 'OPEN' as const, closedAt: null }
  const events = repositoryActivities([commit], [closed], 'feature')
  assert.deepEqual(
    events.map((event) => event.id),
    ['pr:42:closed', 'git:abc123', 'pr:42:opened'],
  )
  assert.equal(events[0].author, null)
  assert.equal(repositoryActivities([], [open], 'feature').length, 1)
  assert.equal(repositoryActivities([], [open, pr], 'feature')[0].type, 'merge')
})

test('unavailable sources and invalid timestamps do not produce fake events', () => {
  assert.deepEqual(repositoryActivities([], [], null), [])
  assert.deepEqual(repositoryActivities([{ ...commit, date: 'invalid' }], [], null), [])
  const events = repositoryActivities([commit], [{ ...pr, mergedAt: 'invalid' }], null)
  assert.ok(events.some((event) => event.type === 'commit'))
})
