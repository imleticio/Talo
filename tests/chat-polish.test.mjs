import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
after(() => server.close())
const { ChatMessage } = await server.ssrLoadModule('/src/features/chat/chat-message.tsx')
const { AgentPulse } = await server.ssrLoadModule('/src/features/chat/agent-pulse.tsx')
const { formatElapsed } = await server.ssrLoadModule('/src/features/chat/elapsed-time.ts')
const { createAgentActivity, reduceAgentActivity } = await server.ssrLoadModule(
  '/src/features/chat/agent-activity.ts',
)
const noop = () => {}
const message = { id: 'reply', role: 'assistant', content: '', status: 'completed' }
const markdown =
  '# Heading\n\n**bold** *italic* `inline`\n\n```ts\nconst value = 1\n```\n\n- One\n- Two\n\n> Quote\n\n[Link](https://example.com)\n\n| A | B |\n| - | - |\n| 1 | 2 |'
const renderMessage = (props) =>
  renderToStaticMarkup(
    createElement(ChatMessage, {
      message,
      live: null,
      onExpandedChange: noop,
      ...props,
    }),
  )

test('completed and streaming replies share safe Markdown rendering', () => {
  const completed = renderMessage({ message: { ...message, content: markdown } })
  const streaming = renderMessage({ live: { messageId: 'reply', text: markdown, tool: null } })
  for (const html of [completed, streaming]) {
    for (const fragment of [
      '<h1>Heading</h1>',
      '<strong>bold</strong>',
      '<em>italic</em>',
      '<code>inline</code>',
      '<pre>',
      '<ul>',
      '<blockquote>',
      '<table>',
      'href="https://example.com"',
      'rel="noopener noreferrer"',
    ]) {
      assert.ok(html.includes(fragment), fragment)
    }
    assert.ok(!html.includes('**bold**'))
  }
  const unsafe = renderMessage({
    message: { ...message, content: '<script>alert(1)</script>\n\n[Bad](javascript:alert(1))' },
  })
  assert.ok(!unsafe.includes('<script'))
  assert.ok(!unsafe.includes('href="javascript:'))
  const user = renderMessage({ message: { ...message, role: 'user', content: '**literal**' } })
  assert.ok(user.includes('**literal**'))
})

test('incomplete streaming Markdown remains renderable through completion', () => {
  for (const text of [
    '**bo',
    '**bold**',
    '```ts\nconst',
    '```ts\nconst value = 1\n```',
    '[Link](https://exam',
    '[Link](https://example.com)',
  ]) {
    assert.doesNotThrow(() => renderMessage({ live: { messageId: 'reply', text, tool: null } }))
  }
})

const tool = {
  type: 'tool',
  id: 'read',
  name: 'read',
  action: 'read',
  title: 'Read file',
  state: 'running',
  path: 'src/agent.ts',
  command: null,
  output: null,
  exitCode: null,
  files: [],
}
const renderPulse = (state, cancelling = false) =>
  renderToStaticMarkup(
    createElement(AgentPulse, {
      state,
      cancelling,
      onExpandedChange: noop,
    }),
  )

test('present opens, manual closure survives events, and terminal states compress with retained history', () => {
  let state = reduceAgentActivity(createAgentActivity(1000, 'Model A'), tool)
  let html = renderPulse(state)
  assert.ok(html.includes('aria-expanded="true"'))
  assert.ok(html.includes('agent.ts'))
  assert.equal((html.match(/Reading/g) ?? []).length, 1)
  state = { ...state, expanded: false }
  state = reduceAgentActivity(state, { type: 'status', text: 'Inspecting repository' })
  assert.ok(renderPulse(state).includes('aria-expanded="false"'))
  assert.ok(!renderPulse(state).includes('agent.ts'))
  assert.ok(renderPulse(state, true).includes('Stopping'))
  for (const event of [
    { type: 'completed' },
    { type: 'cancelled' },
    { type: 'error', message: 'Disconnected' },
  ]) {
    const ended = reduceAgentActivity({ ...state, expanded: true }, event, 28000)
    assert.equal(ended.endedAt, 28000)
    assert.equal(ended.expanded, false)
    html = renderPulse(ended)
    assert.ok(html.includes('in 27s'))
    assert.ok(html.includes('aria-expanded="false"'))
    assert.ok(!html.includes('pulse-working'))
    const inspected = reduceAgentActivity({ ...ended, expanded: true }, tool, 50000)
    assert.equal(inspected.expanded, true)
    assert.ok(renderPulse(inspected).includes('agent.ts'))
  }
})

test('elapsed formatting and model/timing snapshots stay independent per turn', () => {
  assert.equal(formatElapsed(72000), '1m 12s')
  assert.equal(formatElapsed(-1000), '0s')
  const first = reduceAgentActivity(
    createAgentActivity(1000, 'Model A'),
    { type: 'completed' },
    32000,
  )
  const second = reduceAgentActivity(
    createAgentActivity(9000, 'Model B'),
    { type: 'cancelled' },
    17000,
  )
  assert.ok(renderPulse(first).includes('Model A'))
  assert.ok(!renderPulse(first).includes('Model B'))
  assert.equal(first.endedAt - first.startedAt, 31000)
  assert.equal(second.endedAt - second.startedAt, 8000)
  assert.equal(createAgentActivity().expanded, undefined)
})
