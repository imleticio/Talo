import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Box, FileText } from 'lucide-react'
import { Popover } from 'radix-ui'
import { isTauri } from '@tauri-apps/api/core'
import { opencodeFiles, opencodeSkills } from '@/services/agent'
import { toAppError } from '@/services/errors'
import {
  insertReference,
  promptReferences,
  referenceAtCursor,
  skillDisplayName,
  skillReferences,
} from './composer-references'
import { ComposerEditor } from './composer-editor'
import {
  composerSelection,
  deleteComposerSkill,
  insertComposerSkill,
  setComposerSelection,
} from './composer-editor-dom'
import { useRepositoryPath } from './use-repository-path'

type Option = { value: string; label: string; detail: string; source?: string }
type Results = { key: string; items: Option[]; error?: string }

export function ComposerInput({
  id,
  draft,
  disabled,
  fallbackDirectory,
  onDraftChange,
  onSend,
}: {
  id: string
  draft: string
  disabled: boolean
  fallbackDirectory: string | null
  onDraftChange: (draft: string) => void
  onSend: () => void
}) {
  const selectedDirectory = useRepositoryPath()
  const directory = selectedDirectory ?? fallbackDirectory
  const inputRef = useRef<HTMLDivElement>(null)
  const anchorRef = useRef({
    getBoundingClientRect: () =>
      inputRef.current?.closest('form')?.getBoundingClientRect() ??
      inputRef.current?.getBoundingClientRect() ??
      new DOMRect(),
  })
  const activeOptionRef = useRef<HTMLButtonElement>(null)
  const pendingCursor = useRef<number | null>(null)
  const listId = useId()
  const [caret, setCaret] = useState({
    value: draft,
    cursor: draft.length,
    afterSkill: false,
    collapsed: true,
  })
  const cursor = caret.cursor
  const [focused, setFocused] = useState(false)
  const [composing, setComposing] = useState(false)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [selection, setSelection] = useState({ key: '', index: 0 })
  const [results, setResults] = useState<Results | null>(null)
  const [skillCatalogue, setSkillCatalogue] = useState<{
    directory: string | null
    items: Option[]
  } | null>(null)
  const reference =
    caret.value !== draft || caret.afterSkill || !caret.collapsed
      ? null
      : referenceAtCursor(draft, cursor)
  const isSkill = reference?.kind === 'skill'
  const referenceKey = reference ? JSON.stringify([draft, cursor, reference.kind]) : null
  const open =
    focused && !disabled && !composing && reference !== null && dismissed !== referenceKey
  const requestKey =
    open && reference
      ? JSON.stringify([
          reference.kind,
          directory,
          reference.kind === 'file' ? reference.query : '',
        ])
      : promptReferences(draft).skills.length > 0 &&
          (!skillCatalogue || skillCatalogue.directory !== directory)
        ? JSON.stringify(['skill', directory, ''])
        : null
  const query = reference?.query.toLowerCase() ?? ''
  const items =
    results?.key === requestKey
      ? results.items
          .filter(
            (item) =>
              reference?.kind === 'file' ||
              item.value.toLowerCase().includes(query) ||
              item.detail.toLowerCase().includes(query),
          )
          .sort((left, right) => {
            if (!isSkill) return 0
            const rank = (item: Option) =>
              item.value.toLowerCase().startsWith(query)
                ? 0
                : item.value.toLowerCase().includes(query)
                  ? 1
                  : 2
            return rank(left) - rank(right) || left.label.localeCompare(right.label)
          })
          .slice(0, 30)
      : []
  const selectedIndex = Math.min(
    selection.key === referenceKey ? selection.index : 0,
    Math.max(0, items.length - 1),
  )
  const supported = isTauri()
  const error = !supported
    ? 'File and skill suggestions are available in the desktop app.'
    : reference?.kind === 'file' && !directory
      ? 'Choose a repository above to reference its files.'
      : results?.key === requestKey
        ? results.error
        : null
  const loading = !error && requestKey !== null && results?.key !== requestKey

  useEffect(() => {
    if (!requestKey || !supported) return
    const [kind, path, search] = JSON.parse(requestKey) as ['file' | 'skill', string | null, string]
    if (kind === 'file' && !path) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const options: Option[] =
          kind === 'skill'
            ? (await opencodeSkills(path)).map((skill) => ({
                value: skill.name,
                label: skillDisplayName(skill.name),
                detail: skill.description,
                source: skill.location.startsWith('<') ? 'Built-in' : 'Local file',
              }))
            : (await opencodeFiles(path!, search)).map((file) => ({
                value: file,
                label: file.slice(file.lastIndexOf('/') + 1),
                detail: file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : 'Project root',
              }))
        if (!cancelled) {
          if (kind === 'skill') setSkillCatalogue({ directory: path, items: options })
          setResults({ key: requestKey, items: options })
        }
      } catch (reason) {
        if (!cancelled)
          setResults({ key: requestKey, items: [], error: toAppError(reason).message })
      }
    }, 150)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [requestKey, supported])

  useLayoutEffect(() => {
    if (pendingCursor.current === null) return
    const position = pendingCursor.current
    pendingCursor.current = null
    if (inputRef.current) setComposerSelection(inputRef.current, position)
  }, [draft])

  useEffect(() => {
    if (open) activeOptionRef.current?.scrollIntoView({ block: 'nearest' })
  }, [open, selectedIndex, results, referenceKey])

  function choose(option: Option) {
    if (!reference) return
    const inserted = insertReference(draft, reference, option.value)
    pendingCursor.current = inserted.cursor
    setCaret({ value: inserted.draft, cursor: inserted.cursor, afterSkill: false, collapsed: true })
    setDismissed(referenceKey)
    const editor = inputRef.current
    if (editor) {
      if (reference.kind === 'skill') {
        insertComposerSkill(
          editor,
          { ...reference, name: option.value, label: option.label },
          !draft.slice(reference.end).startsWith(' '),
        )
      } else {
        setComposerSelection(editor, reference.start, reference.end)
        const end = inserted.cursor - (draft.slice(reference.end).startsWith(' ') ? 1 : 0)
        document.execCommand('insertText', false, inserted.draft.slice(reference.start, end))
      }
    }
    onDraftChange(inserted.draft)
    inputRef.current?.focus({ preventScroll: true })
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) setDismissed(referenceKey)
      }}
    >
      <Popover.Anchor virtualRef={anchorRef} />
      <ComposerEditor
        editorRef={inputRef}
        id={id}
        value={draft}
        skills={skillReferences(
          draft,
          skillCatalogue?.directory === directory
            ? skillCatalogue.items.map((item) => item.value)
            : [],
          reference?.kind === 'skill' ? reference.start : undefined,
        )}
        composing={composing}
        contentEditable={!disabled}
        tabIndex={disabled ? -1 : 0}
        aria-label="Message"
        aria-multiline="true"
        aria-disabled={disabled}
        role="combobox"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && items.length ? `${listId}-${selectedIndex}` : undefined}
        aria-describedby={`${listId}-hint`}
        onFocus={(event) => {
          setFocused(true)
          setCaret(composerSelection(event.currentTarget))
        }}
        onBlur={() => setFocused(false)}
        onCursorChange={(selection) =>
          setCaret((previous) =>
            previous.value === selection.value &&
            previous.cursor === selection.cursor &&
            previous.afterSkill === selection.afterSkill &&
            previous.collapsed === selection.collapsed
              ? previous
              : selection,
          )
        }
        onValueChange={(value) => {
          setDismissed(null)
          onDraftChange(value)
        }}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={(event) => {
          setComposing(false)
          setCaret(composerSelection(event.currentTarget))
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || composing) return
          if (
            (event.key === 'Backspace' || event.key === 'Delete') &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.altKey &&
            inputRef.current &&
            deleteComposerSkill(inputRef.current, event.key === 'Backspace')
          ) {
            event.preventDefault()
            return
          }
          if (open && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              if (items.length)
                setSelection({
                  key: referenceKey!,
                  index:
                    (selectedIndex + (event.key === 'ArrowDown' ? 1 : -1) + items.length) %
                    items.length,
                })
              return
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              setDismissed(referenceKey)
              return
            }
            if (event.key === 'Enter' || (event.key === 'Tab' && items.length)) {
              event.preventDefault()
              if (items.length) choose(items[selectedIndex])
              return
            }
          }
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            onSend()
          }
        }}
        data-placeholder="Ask anything… @ files, $ skills"
        className="composer-rich-input"
      />
      <span id={`${listId}-hint`} className="sr-only">
        Type @ to reference a project file or $ to select a skill. Use arrow keys to navigate, Enter
        or Tab to select, and Escape to dismiss.
      </span>
      <Popover.Portal>
        <Popover.Content
          side={isSkill ? 'bottom' : 'top'}
          align="start"
          sideOffset={8}
          collisionPadding={16}
          role="presentation"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (event.target === inputRef.current) event.preventDefault()
          }}
          className={`composer-reference-menu z-50 overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground outline-none ${isSkill ? 'composer-skill-menu w-[min(var(--radix-popover-trigger-width),calc(100vw-2rem))]' : 'w-[min(28rem,var(--radix-popover-trigger-width),calc(100vw-2rem))] shadow-lg'}`}
        >
          {!isSkill && (
            <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2 text-xs text-muted-foreground">
              <FileText className="size-3.5" aria-hidden="true" />
              <span>Project files</span>
              {reference?.kind === 'file' && directory && (
                <span className="ml-auto truncate" title={directory}>
                  {directory.split('/').at(-1)}
                </span>
              )}
            </div>
          )}
          <div
            id={listId}
            role="listbox"
            aria-label={reference?.kind === 'skill' ? 'Available skills' : 'Project files'}
            aria-busy={loading}
            className="max-h-[min(16rem,var(--radix-popover-content-available-height))] overflow-y-auto p-1"
          >
            {items.map((item, index) => (
              <button
                key={item.value}
                id={`${listId}-${index}`}
                ref={index === selectedIndex ? activeOptionRef : undefined}
                type="button"
                role="option"
                aria-selected={index === selectedIndex}
                tabIndex={-1}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(item)}
                onPointerMove={() => setSelection({ key: referenceKey!, index })}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left ${isSkill ? 'rounded-full' : 'rounded-xl'} ${index === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'}`}
              >
                {reference?.kind === 'skill' ? (
                  <Box className="size-4 shrink-0" aria-hidden="true" />
                ) : (
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                {isSkill ? (
                  <>
                    <span className="max-w-[45%] shrink-0 truncate text-sm" title={item.label}>
                      {item.label}
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate text-sm text-muted-foreground"
                      title={item.detail}
                    >
                      {item.detail}
                    </span>
                    <span className="ml-auto shrink-0 text-sm text-muted-foreground">
                      {item.source}
                    </span>
                  </>
                ) : (
                  <span className="min-w-0">
                    <span className="block truncate text-sm" title={item.value}>
                      {item.label}
                    </span>
                    <span
                      className="block truncate text-xs text-muted-foreground"
                      title={item.detail}
                    >
                      {item.detail}
                    </span>
                  </span>
                )}
              </button>
            ))}
            {items.length === 0 && (
              <p role="status" className="px-3 py-4 text-xs text-muted-foreground">
                {error ??
                  (loading
                    ? 'Searching…'
                    : reference?.kind === 'skill'
                      ? 'No matching skills.'
                      : 'No matching files.')}
              </p>
            )}
          </div>
          {!isSkill && (
            <div
              aria-hidden="true"
              className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground"
            >
              ↑ ↓ Navigate · Enter Select · Esc Close
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
