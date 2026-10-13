export type ComposerReference = {
  kind: 'skill' | 'file'
  query: string
  start: number
  end: number
}

export type SkillReference = { start: number; end: number; name: string; label: string }

export function skillDisplayName(name: string) {
  return name.replace(/[-_]+/gu, ' ').replace(/\b[a-z]/gu, (letter) => letter.toUpperCase())
}

export function skillReferences(
  text: string,
  names: string[],
  editingStart?: number,
): SkillReference[] {
  const available = new Set(names)
  const references: SkillReference[] = []
  for (const match of outsideCode(text).matchAll(
    /(?:^|\s)(?:@"(?:\\.|[^"\\])*"|\$([a-z\d][a-z\d._-]*))/giu,
  )) {
    if (!match[1]) continue
    const start = match.index + match[0].length - match[1].length - 1
    if (available.has(match[1]) && start !== editingStart) {
      references.push({
        start,
        end: start + match[1].length + 1,
        name: match[1],
        label: skillDisplayName(match[1]),
      })
    }
  }
  return references
}

const tokenCharacters = /[^\s@$"'()[\]{}<>,;:!?]*/u

function outsideCode(text: string) {
  return text.replace(/[$@]"(?:\\.|[^"\\])*"|```[\s\S]*?(?:```|$)|`[^`]*(?:`|$)/gu, (part) =>
    part.startsWith('@"') || part.startsWith('$"') ? part : ' '.repeat(part.length),
  )
}

export function referenceAtCursor(text: string, cursor: number): ComposerReference | null {
  const position = Math.max(0, Math.min(cursor, text.length))
  const match = /(?:^|\s)([$@])([^\s@$"'()[\]{}<>,;:!?]*)$/u.exec(
    outsideCode(text.slice(0, position)),
  )
  if (!match) return null
  return {
    kind: match[1] === '$' ? 'skill' : 'file',
    query: match[2],
    start: position - match[2].length - 1,
    end: position + (tokenCharacters.exec(text.slice(position))?.[0].length ?? 0),
  }
}

export function insertReference(text: string, reference: ComposerReference, value: string) {
  const name =
    /[^\p{L}\p{N}_./-]/u.test(value) || value.endsWith('.') ? JSON.stringify(value) : value
  const token = `${reference.kind === 'skill' ? '$' : '@'}${name}`
  const suffix = text.slice(reference.end)
  const separator = suffix.startsWith(' ') ? '' : ' '
  const draft = text.slice(0, reference.start) + token + separator + suffix
  return { draft, cursor: reference.start + token.length + 1 }
}

export function promptReferences(text: string) {
  const files = new Set<string>()
  const skills = new Set<string>()
  const pattern = /(?:^|\s)([$@])("(?:\\.|[^"\\])*"|[^\s@$"'()[\]{}<>,;:!?]+)/gu
  for (const match of outsideCode(text).matchAll(pattern)) {
    let value = match[2]
    if (value.startsWith('"')) {
      try {
        value = JSON.parse(value) as string
      } catch {
        continue
      }
    }
    if (match[1] === '@') files.add(match[2].startsWith('"') ? value : value.replace(/\.+$/u, ''))
    else if (/^[a-z\d][a-z\d._-]*$/i.test(value) && !/^[\d.]+$/.test(value)) skills.add(value)
  }
  return { files: [...files], skills: [...skills] }
}
