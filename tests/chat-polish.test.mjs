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
  assert.ok(!html.includes('pulse-current-row'))
  assert.ok(html.includes('pulse-group-toggle'))
  state = { ...state, expanded: false }
  state = reduceAgentActivity(state, { type: 'status', text: 'Inspecting repository' })
  assert.ok(renderPulse(state).includes('aria-expanded="false"'))
  assert.ok(!renderPulse(state).includes('pulse-file'))
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
    assert.ok(html.includes(event.type === 'completed' ? 'for 27s' : 'in 27s'))
    assert.ok(html.includes('aria-expanded="false"'))
    assert.ok(!html.includes('pulse-working'))
    const inspected = reduceAgentActivity({ ...ended, expanded: true }, tool, 50000)
    assert.equal(inspected.expanded, true)
    assert.ok(renderPulse(inspected).includes('agent.ts'))
  }
})

test('activity header controls a retained region and empty work stays compact', () => {
  const state = createAgentActivity(1000, 'Model A')
  const html = renderPulse(state)
  const controls = html.match(/aria-controls="([^"]+)"/)?.[1]
  assert.ok(controls)
  assert.ok(html.includes(`id="${controls}"`))
  assert.ok(!html.includes('pulse-current'))
  const collapsed = renderPulse({ ...state, expanded: false })
  assert.match(collapsed, /hidden="" class="pulse-details"/)
})

test('compact action groups retain pending, failure, output and interrupted evidence', () => {
  let state = reduceAgentActivity(createAgentActivity(1000), {
    ...tool,
    state: 'pending',
  })
  assert.ok(renderPulse(state).includes('Queued · Reading'))
  state = reduceAgentActivity(state, {
    ...tool,
    state: 'error',
    output: '<script>failure</script>',
  })
  let html = renderPulse(state)
  assert.ok(html.includes('Failed'))
  assert.ok(html.includes('Inspect error'))
  assert.ok(html.includes('&lt;script&gt;failure&lt;/script&gt;'))
  assert.ok(!html.includes('<script>'))
  state = reduceAgentActivity(state, { ...tool, id: 'another', path: 'other.ts' })
  assert.ok(renderPulse(state).includes('Exploring repository'))
  state = reduceAgentActivity(state, { type: 'cancelled' }, 28000)
  html = renderPulse({ ...state, expanded: true })
  assert.ok(html.includes('Interrupted'))
  assert.ok(!html.includes('Exploring repository'))
  assert.ok(html.includes('Inspect error'))
})

test('waiting requests remain visible and take precedence over running tools', () => {
  let state = reduceAgentActivity(createAgentActivity(1000), tool)
  state = reduceAgentActivity(state, {
    type: 'attention',
    id: 'approval',
    title: 'Approval required',
    detail: 'Continue in your agent harness',
  })
  const html = renderPulse(state)
  assert.ok(html.includes('Waiting'))
  assert.match(html, /class="pulse-current"><span>Approval required<\/span>/)
  assert.ok(html.includes('Continue in your agent harness'))
  assert.ok(html.includes('agent.ts'))
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
