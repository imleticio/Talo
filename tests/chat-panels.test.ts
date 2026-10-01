import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addChatPanel,
  groupChatPanel,
  removePanelFromGroups,
  visibleChatPanels,
} from '../src/features/chat/chat-panels-state.ts'
import { readChatDrag } from '../src/features/chat/chat-drag.ts'

test('dropping adds chats alongside the target without duplicating visible chats', () => {
  const valid = ['a', 'b', 'c']
  const two = addChatPanel([], valid, 'b', 'a')
  assert.deepEqual(two, ['a', 'b'])
  assert.deepEqual(addChatPanel(two, valid, 'c', 'a'), ['a', 'c', 'b'])
  assert.deepEqual(addChatPanel(two, valid, 'b', 'a'), two)
  assert.deepEqual(addChatPanel([], valid, 'a', 'a'), ['a'])
})

test('the preview side determines placement and existing panels can move without duplicates', () => {
  const valid = ['a', 'b', 'c']
  assert.deepEqual(addChatPanel(['a', 'b'], valid, 'c', 'b', 'left'), ['a', 'c', 'b'])
  assert.deepEqual(addChatPanel(['a', 'b'], valid, 'c', 'b', 'right'), ['a', 'b', 'c'])
  assert.deepEqual(addChatPanel(['a', 'b', 'c'], valid, 'c', 'a', 'left'), ['c', 'a', 'b'])
})

test('switching to an outside tab hides the group and returning restores the same panels', () => {
  const panels = ['a', 'b']
  const valid = ['a', 'b', 'c']
  assert.deepEqual(visibleChatPanels(panels, valid, 'c'), ['c'])
  assert.deepEqual(visibleChatPanels(panels, valid, 'a'), ['a', 'b'])
  assert.deepEqual(visibleChatPanels(panels, valid, 'b'), ['a', 'b'])
  assert.deepEqual(panels, ['a', 'b'])
})

test('separate split groups retain their own panels and moving a chat never duplicates it', () => {
  const valid = ['a', 'b', 'c', 'd']
  const first = groupChatPanel([], valid, 'b', 'a')
  const both = groupChatPanel(first, valid, 'd', 'c')
  assert.deepEqual(both, [
    ['a', 'b'],
    ['c', 'd'],
  ])
  assert.deepEqual(groupChatPanel(both, valid, 'b', 'c', 'left'), [['b', 'c', 'd']])
  assert.deepEqual(removePanelFromGroups(both, 'a'), [['c', 'd']])
  assert.deepEqual(groupChatPanel(both, valid, 'missing', 'c'), both)
})

test('closed and unknown chats cannot be added and stale panel ids are discarded', () => {
  assert.deepEqual(addChatPanel(['deleted', 'a'], ['a', 'b'], 'b', 'a'), ['a', 'b'])
  assert.deepEqual(addChatPanel(['a'], ['a'], 'unknown', 'a'), ['a'])
})

test('closing or hiding panels collapses to the active chat without leaving empty columns', () => {
  assert.deepEqual(visibleChatPanels(['closed', 'a'], ['a', 'b'], 'b'), ['b'])
  assert.deepEqual(visibleChatPanels(['a', 'b'], ['a', 'b', 'c'], 'c'), ['c'])
  assert.deepEqual(visibleChatPanels(['a', 'b'], ['a', 'b'], 'a'), ['a', 'b'])
})

test('drag payloads support tabs and sidebar conversations and ignore external data', () => {
  assert.deepEqual(readChatDrag('{"tabId":"a"}'), { tabId: 'a' })
  assert.deepEqual(readChatDrag('{"conversationId":"b"}'), { conversationId: 'b' })
  for (const value of ['null', '{}', '[]', '{"tabId":1}', 'external text']) {
    assert.equal(readChatDrag(value), null)
  }
})
