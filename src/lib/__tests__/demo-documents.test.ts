import { describe, it, expect } from 'vitest'
import {
  CONTENT_WIDTH,
  DEMO_DOCUMENT_ID_PREFIX,
  buildPdf,
  createDemoDocuments,
  textWidth,
  wrapText,
} from '../demo-documents'

/** Every string drawn by the PDF writer, with the font it is drawn with. */
function drawnLines(raw: string) {
  return [
    ...raw.matchAll(
      /\/(F1|F2) ([\d.]+) Tf 1 0 0 1 \d+ [\d.-]+ Tm \((.*?)\) Tj/g,
    ),
  ].map(([, font, size, text]) => ({
    text,
    size: Number(size),
    bold: font === 'F2',
  }))
}

describe('buildPdf', () => {
  const pdf = buildPdf({
    title: 'Billet électronique',
    subtitle: 'Air China · Paris CDG - Shanghai PVG',
    lines: [
      { text: 'Référence : X7K2QP', bold: true },
      { rule: true },
      { text: 'Parenthèses (et antislash \\) échappés' },
    ],
  })
  const raw = Buffer.from(pdf).toString('latin1')

  it('starts with a PDF header and ends with the EOF marker', () => {
    expect(raw.startsWith('%PDF-1.4')).toBe(true)
    expect(raw.trimEnd().endsWith('%%EOF')).toBe(true)
  })

  it('declares every object in the cross-reference table', () => {
    const objectCount = (raw.match(/^\d+ 0 obj$/gm) ?? []).length
    expect(objectCount).toBe(7)
    expect(raw).toContain(`xref\n0 ${objectCount + 1}`)
    expect(raw).toContain(`/Size ${objectCount + 1}`)
  })

  it('points the xref entries at the real object offsets', () => {
    const entries = [...raw.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) =>
      Number(m[1]),
    )
    expect(entries).toHaveLength(7)
    entries.forEach((offset, index) => {
      expect(raw.slice(offset)).toMatch(new RegExp(`^${index + 1} 0 obj`))
    })
  })

  it('announces the exact byte length of the content stream', () => {
    const length = Number(/\/Length (\d+) >>\nstream\n/.exec(raw)?.[1])
    const start = raw.indexOf('stream\n') + 'stream\n'.length
    const stream = raw.slice(start, raw.indexOf('endstream', start))
    expect(stream).toHaveLength(length)
  })

  it('escapes the characters that would break a literal string', () => {
    expect(raw).toContain(
      '(Parenth\xe8ses \\(et antislash \\\\\\) \xe9chapp\xe9s)',
    )
  })

  it('encodes accents and typographic characters as WinAnsi bytes', () => {
    expect(raw).toContain('Billet \xe9lectronique') // é → 0xE9
    expect(raw).toContain('Air China \xb7 Paris') // · → 0xB7
    expect(raw).not.toContain('?') // no unmappable character
  })
})

describe('createDemoDocuments', () => {
  const documents = createDemoDocuments(1_000_000_000_000)

  it('provides a varied set of example travel documents', () => {
    expect(documents.length).toBeGreaterThanOrEqual(6)
    const types = new Set(documents.map((d) => d.type))
    expect(types).toContain('application/pdf')
    expect(types).toContain('image/svg+xml')
    expect(types).toContain('text/plain')
  })

  it('uses stable, prefixed ids so re-seeding never duplicates them', () => {
    const ids = documents.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => id.startsWith(DEMO_DOCUMENT_ID_PREFIX))).toBe(true)
    expect(createDemoDocuments(42).map((d) => d.id)).toEqual(ids)
  })

  it('gives every document a unique name and a non-empty blob', () => {
    const names = documents.map((d) => d.name)
    expect(new Set(names).size).toBe(names.length)
    for (const doc of documents) {
      expect(doc.size).toBeGreaterThan(0)
      expect(doc.blob.size).toBe(doc.size)
      expect(doc.name).toMatch(/\.(pdf|svg|txt)$/)
    }
  })

  it('staggers timestamps so the newest-first sort keeps the declared order', () => {
    const addedAt = documents.map((d) => d.addedAt)
    const sorted = [...addedAt].sort((a, b) => b - a)
    expect(addedAt).toEqual(sorted)
    expect(addedAt[0]).toBe(1_000_000_000_000)
  })
})

describe('wrapText', () => {
  it('leaves a line that already fits untouched', () => {
    expect(wrapText('Vol CA934 · 34A', 11, false, CONTENT_WIDTH)).toEqual([
      'Vol CA934 · 34A',
    ])
  })

  it('splits a long paragraph into lines that fit the content width', () => {
    const paragraph =
      'Retrait des billets au guichet avec le passeport, ou passage direct au portillon avec le passeport utilisé pour la réservation. Arriver 40 min avant le départ.'
    const lines = wrapText(paragraph, 10, false, CONTENT_WIDTH)

    expect(lines.length).toBeGreaterThan(1)
    expect(lines.join(' ')).toBe(paragraph)
    for (const line of lines) {
      expect(textWidth(line, 10, false)).toBeLessThanOrEqual(CONTENT_WIDTH)
    }
  })

  it('always returns at least one line', () => {
    expect(wrapText('', 10, false, CONTENT_WIDTH)).toEqual([''])
  })
})

describe('generated demo files', () => {
  it('never draws PDF text past the right margin', async () => {
    for (const doc of createDemoDocuments()) {
      if (doc.type !== 'application/pdf') continue

      const raw = Buffer.from(await doc.blob.arrayBuffer()).toString('latin1')
      const lines = drawnLines(raw)
      expect(lines.length).toBeGreaterThan(0)

      for (const line of lines) {
        expect(
          textWidth(line.text, line.size, line.bold),
          `${doc.name}: "${line.text}"`,
        ).toBeLessThanOrEqual(CONTENT_WIDTH)
      }
    }
  })

  it('produces a well-formed boarding pass and contact sheet', async () => {
    const svg = createDemoDocuments().find((d) => d.type === 'image/svg+xml')!
    const markup = await svg.blob.text()
    expect(markup.trimStart().startsWith('<svg xmlns=')).toBe(true)
    expect(markup.trimEnd().endsWith('</svg>')).toBe(true)
    expect(markup).toContain('BJSKYRR') // booking reference of the demo flight

    const txt = createDemoDocuments().find((d) => d.type === 'text/plain')!
    const contacts = await txt.blob.text()
    expect(contacts).toContain('Police')
    expect(contacts).toContain('démonstration')
  })
})
