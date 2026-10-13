import assert from 'node:assert/strict'
import test from 'node:test'
import {
  insertReference,
  promptReferences,
  referenceAtCursor,
  skillDisplayName,
  skillReferences,
} from '../src/features/chat/composer-references.ts'

test('finds file and skill triggers at the caret without matching emails or escaped literals', () => {
  assert.deepEqual(referenceAtCursor('Review @src/chat.ts', 12), {
    kind: 'file',
    query: 'src/',
    start: 7,
    end: 19,
  })
  assert.deepEqual(referenceAtCursor('$clean', 6), {
    kind: 'skill',
    query: 'clean',
    start: 0,
    end: 6,
  })
  for (const text of ['mail@example.com', 'price is \\$50', 'done @file.ts ', '@"file name.ts"']) {
    assert.equal(referenceAtCursor(text, text.length), null, text)
  }
  assert.equal(referenceAtCursor('Check\n@', 7)?.kind, 'file')
})

test('visual skill references have friendly names while preserving canonical token ranges', () => {
  const draft = '$thesis-writing review this with $clean-code'
  const references = skillReferences(draft, ['thesis-writing', 'clean-code'])
  assert.deepEqual(
    references.map((reference) => reference.label),
    ['Thesis Writing', 'Clean Code'],
  )
  assert.deepEqual(
    references.map((reference) => draft.slice(reference.start, reference.end)),
    ['$thesis-writing', '$clean-code'],
  )
  assert.equal(skillDisplayName('thesis-writing'), 'Thesis Writing')
  assert.deepEqual(skillReferences(draft, ['thesis-writing', 'clean-code'], references[1].start), [
    references[0],
  ])
})

test('only available full skill identifiers outside code and quoted files become visual references', () => {
  const references = skillReferences(
    '`$clean-code` @"folder $clean-code file.ts" $clean-code-extra $unknown $clean-code',
    ['clean-code'],
  )
  assert.equal(references.length, 1)
  assert.equal(references[0].name, 'clean-code')
  assert.equal(
    references[0].end,
    '`$clean-code` @"folder $clean-code file.ts" $clean-code-extra $unknown $clean-code'.length,
  )
})

test('selection replaces the whole token in the middle of a draft and preserves surrounding text', () => {
  const draft = 'Review @src/old.ts for errors'
  const reference = referenceAtCursor(draft, 12)!
  const inserted = insertReference(draft, reference, 'src/new.ts')
  assert.equal(inserted.draft, 'Review @src/new.ts for errors')
  assert.equal(inserted.draft.slice(inserted.cursor), 'for errors')
  assert.equal(referenceAtCursor(inserted.draft, inserted.cursor), null)
  assert.deepEqual(promptReferences(inserted.draft), { files: ['src/new.ts'], skills: [] })
})

test('quoted paths round-trip spaces, Unicode and special characters without losing the suffix', () => {
  for (const path of [
    'src/chat view.ts',
    'src/acción.ts',
    'src/a"b.ts',
    'src/query?.ts',
    'src/a`b.ts',
    'src/filename.',
  ]) {
    const reference = referenceAtCursor('Check @', 7)!
    const inserted = insertReference('Check @', reference, path)
    assert.deepEqual(promptReferences(inserted.draft), { files: [path], skills: [] })
    assert.equal(referenceAtCursor(inserted.draft, inserted.cursor), null)
  }
})

test('multiple references deduplicate and cash, emails and malformed quoted text stay literal', () => {
  assert.deepEqual(
    promptReferences('$clean-code review @src/chat.ts with $clean-code and @src/chat.ts.'),
    {
      files: ['src/chat.ts'],
      skills: ['clean-code'],
    },
  )
  assert.deepEqual(promptReferences('Costs $50.00; mail@example.com \\@literal @"bad\\q"'), {
    files: [],
    skills: [],
  })
  assert.deepEqual(promptReferences('$37signals-way @"src/chat view.ts" $go-testing'), {
    files: ['src/chat view.ts'],
    skills: ['37signals-way', 'go-testing'],
  })
})

test('markers inside code remain literal and do not open suggestions or attach files', () => {
  assert.equal(referenceAtCursor('Try `$HOME', 10), null)
  assert.deepEqual(
    promptReferences('`$HOME @literal.ts`\n```sh\n$PATH @other.ts\n```\nCheck @src/chat.ts'),
    {
      files: ['src/chat.ts'],
      skills: [],
    },
  )
})
