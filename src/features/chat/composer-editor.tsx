import { useEffect, useLayoutEffect, type ComponentProps, type RefObject } from 'react'
import type { SkillReference } from './composer-references'
import {
  composerSelection,
  editorText,
  prefixAt,
  readComposerEditor,
  selectedComposerText,
  setComposerSelection,
  skillToken,
} from './composer-editor-dom'

export function ComposerEditor({
  editorRef,
  value,
  skills,
  composing,
  onValueChange,
  onCursorChange,
  ...props
}: Omit<ComponentProps<'div'>, 'children' | 'onInput' | 'onPaste' | 'onCopy' | 'onCut'> & {
  editorRef: RefObject<HTMLDivElement | null>
  value: string
  skills: SkillReference[]
  composing: boolean
  onValueChange: (value: string) => void
  onCursorChange: (selection: ReturnType<typeof composerSelection>) => void
}) {
  const signature = JSON.stringify(skills)
  useLayoutEffect(() => {
    const editor = editorRef.current
    if (!editor || composing) return
    const references: SkillReference[] = JSON.parse(signature)
    const current = Array.from(editor.querySelectorAll<HTMLElement>('[data-skill]')).map(
      (token) => ({
        name: token.dataset.skill,
        start: editorText(
          prefixAt(
            editor,
            token.parentNode!,
            Array.from(token.parentNode!.childNodes).indexOf(token),
          ),
        ).length,
      }),
    )
    if (
      readComposerEditor(editor) === value &&
      current.length === references.length &&
      current.every(
        (token, index) =>
          token.name === references[index].name && token.start === references[index].start,
      )
    )
      return
    const focused = document.activeElement === editor
    const caret = composerSelection(editor).cursor
    const fragment = document.createDocumentFragment()
    let offset = 0
    for (const reference of references) {
      fragment.append(
        document.createTextNode(value.slice(offset, reference.start)),
        skillToken(reference.name, reference.label),
      )
      offset = reference.end
    }
    fragment.append(document.createTextNode(value.slice(offset)))
    if (value.endsWith('\n')) {
      const tail = document.createElement('br')
      tail.dataset.editorTail = 'true'
      fragment.append(tail)
    }
    editor.replaceChildren(fragment)
    if (focused) setComposerSelection(editor, Math.min(caret, value.length))
  }, [value, signature, composing, editorRef])

  useEffect(() => {
    const updateCursor = () => {
      const editor = editorRef.current
      if (editor && document.activeElement === editor) onCursorChange(composerSelection(editor))
    }
    document.addEventListener('selectionchange', updateCursor)
    return () => document.removeEventListener('selectionchange', updateCursor)
  }, [editorRef, onCursorChange])

  return (
    <div
      {...props}
      ref={editorRef}
      data-composer-editor
      data-empty={!value}
      suppressContentEditableWarning
      onInput={(event) => {
        onCursorChange(composerSelection(event.currentTarget))
        onValueChange(readComposerEditor(event.currentTarget))
      }}
      onPaste={(event) => {
        event.preventDefault()
        document.execCommand('insertText', false, event.clipboardData.getData('text/plain'))
      }}
      onCopy={(event) => {
        const text = selectedComposerText(event.currentTarget)
        if (text === null) return
        event.preventDefault()
        event.clipboardData.setData('text/plain', text)
      }}
      onCut={(event) => {
        const text = selectedComposerText(event.currentTarget)
        if (text === null) return
        event.preventDefault()
        event.clipboardData.setData('text/plain', text)
        document.execCommand('delete')
      }}
    />
  )
}
