import type { SkillReference } from './composer-references'

export function editorText(node: Node, trimTrailingBreak = false): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/\u00a0/gu, ' ')
  if (node instanceof HTMLElement) {
    if (node.dataset.skill) return `$${node.dataset.skill}`
    if (node.dataset.editorTail) return ''
    if (node.tagName === 'BR') return '\n'
  }
  const children = Array.from(node.childNodes)
  if (trimTrailingBreak) {
    while (children.at(-1)?.nodeType === Node.TEXT_NODE && children.at(-1)?.textContent === '')
      children.pop()
  }
  if (trimTrailingBreak && children.at(-1) instanceof HTMLBRElement) children.pop()
  return children
    .map((child, index) => {
      const block = child instanceof HTMLElement && /^(DIV|P)$/u.test(child.tagName)
      return `${block && index > 0 ? '\n' : ''}${editorText(child, trimTrailingBreak)}`
    })
    .join('')
}

export function readComposerEditor(editor: HTMLElement) {
  return editorText(editor, true)
}

export function selectedComposerText(editor: HTMLElement) {
  const selection = window.getSelection()
  if (
    !selection?.rangeCount ||
    selection.isCollapsed ||
    !selection.anchorNode ||
    !selection.focusNode ||
    !editor.contains(selection.anchorNode) ||
    !editor.contains(selection.focusNode)
  )
    return null
  return editorText(selection.getRangeAt(0).cloneContents())
}

export function prefixAt(editor: HTMLElement, node: Node, offset: number) {
  const range = document.createRange()
  range.selectNodeContents(editor)
  range.setEnd(node, offset)
  return range.cloneContents()
}

export function composerSelection(editor: HTMLElement) {
  const selection = window.getSelection()
  const text = readComposerEditor(editor)
  if (!selection?.focusNode || !editor.contains(selection.focusNode)) {
    return { value: text, cursor: text.length, afterSkill: false, collapsed: true }
  }
  const prefix = prefixAt(editor, selection.focusNode, selection.focusOffset)
  let last: Node | undefined = Array.from(prefix.childNodes).findLast(
    (node) => (node instanceof HTMLElement && node.dataset.skill) || Boolean(node.textContent),
  )
  while (last instanceof HTMLElement && !last.dataset.skill && last.lastChild) last = last.lastChild
  const cursor = Math.min(editorText(prefix).length, text.length)
  return {
    value: text,
    cursor,
    afterSkill:
      last instanceof HTMLElement &&
      Boolean(last.dataset.skill) &&
      text.slice(0, cursor).endsWith(`$${last.dataset.skill}`),
    collapsed: selection.isCollapsed,
  }
}

function selectionPoint(editor: HTMLElement, position: number): [Node, number] {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.parentElement?.closest('[data-skill]')) return NodeFilter.FILTER_REJECT
      return node.nodeType === Node.TEXT_NODE ||
        node instanceof HTMLBRElement ||
        (node instanceof HTMLElement && node.dataset.skill)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP
    },
  })
  let node: Node | null
  while ((node = walker.nextNode())) {
    const parent = node.parentNode!
    const index = Array.from(parent.childNodes).indexOf(node as ChildNode)
    const start = editorText(prefixAt(editor, parent, index)).length
    const length = editorText(node).length
    if (position < start || position > start + length) continue
    if (node.nodeType === Node.TEXT_NODE) return [node, position - start]
    return [parent, index + (position > start ? 1 : 0)]
  }
  return [editor, editor.childNodes.length]
}

export function setComposerSelection(editor: HTMLElement, start: number, end = start) {
  const range = document.createRange()
  range.setStart(...selectionPoint(editor, start))
  range.setEnd(...selectionPoint(editor, end))
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

export function deleteComposerSkill(editor: HTMLElement, backwards: boolean) {
  const selection = composerSelection(editor)
  if (!selection.collapsed) return false
  for (const token of editor.querySelectorAll<HTMLElement>('[data-skill]')) {
    const parent = token.parentNode!
    const index = Array.from(parent.childNodes).indexOf(token)
    const start = editorText(prefixAt(editor, parent, index)).length
    const end = start + token.dataset.skill!.length + 1
    if (selection.cursor !== (backwards ? end : start)) continue
    setComposerSelection(editor, start, end)
    return document.execCommand('delete')
  }
  return false
}

export function skillToken(name: string, label: string) {
  const token = document.createElement('span')
  token.className = 'composer-skill-token'
  token.dataset.skill = name
  token.contentEditable = 'false'
  token.title = `$${name}`
  token.setAttribute('role', 'img')
  token.setAttribute('aria-label', `Skill: ${label}`)
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  for (const [key, value] of Object.entries({
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.75',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  }))
    icon.setAttribute(key, value)
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', 'M21 8l-9-5-9 5v8l9 5 9-5V8Z M3 8l9 5 9-5 M12 13v8 M7.5 5.5l9 5')
  icon.append(path)
  token.append(icon, document.createTextNode(label))
  return token
}

export function insertComposerSkill(
  editor: HTMLElement,
  reference: SkillReference,
  addSpace = true,
) {
  editor.focus({ preventScroll: true })
  setComposerSelection(editor, reference.start, reference.end)
  // Native editing commands keep skill insertion in the browser's undo history.
  return document.execCommand(
    'insertHTML',
    false,
    `${skillToken(reference.name, reference.label).outerHTML}${addSpace ? ' ' : ''}`,
  )
}
