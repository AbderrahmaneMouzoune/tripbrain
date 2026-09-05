import { describe, it, expect } from 'vitest'
import {
  DOCUMENTS_SHARE_MAX_BYTES,
  documentsTotalSize,
  packDocuments,
  receivedDocumentsSize,
  unpackDocuments,
} from '@/lib/document-share'
import { SHARE_MAX_PAYLOAD_CHARS } from '@/lib/share'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeDocument(name: string, content: string, type = 'text/plain') {
  const blob = new Blob([content], { type })
  return { name, type, size: blob.size, blob }
}

async function textOf(blob: Blob): Promise<string> {
  return new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('documentsTotalSize', () => {
  it('additionne le poids des documents choisis', () => {
    expect(documentsTotalSize([{ size: 10 }, { size: 32 }])).toBe(42)
  })

  it('vaut zéro sans document', () => {
    expect(documentsTotalSize([])).toBe(0)
  })
})

describe('packDocuments', () => {
  it('refuse une sélection vide plutôt que d’envoyer une archive creuse', async () => {
    await expect(packDocuments([])).rejects.toThrow(
      'Choisissez au moins un document à partager.',
    )
  })

  it('produit un payload base64url, sans caractère à échapper dans une URL', async () => {
    const payload = await packDocuments([
      makeDocument('billet.txt', 'Vol Paris → Oulan-Bator'),
    ])

    expect(payload.length).toBeGreaterThan(0)
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('refuse une sélection qui dépasse ce qu’un partage peut porter', async () => {
    // Des octets tirés au hasard : ni le ZIP ni le base64 ne les feront
    // maigrir, contrairement à un motif qui se répète.
    const bytes = new Uint8Array(DOCUMENTS_SHARE_MAX_BYTES + 1024)
    for (let offset = 0; offset < bytes.length; offset += 65536) {
      crypto.getRandomValues(bytes.subarray(offset, offset + 65536))
    }
    const blob = new Blob([bytes], { type: 'application/octet-stream' })

    await expect(
      packDocuments([
        { name: 'gros.bin', type: blob.type, size: blob.size, blob },
      ]),
    ).rejects.toThrow(/Sélection trop volumineuse/)
  })
})

describe('unpackDocuments', () => {
  it('restitue les documents emballés, contenu compris', async () => {
    const payload = await packDocuments([
      makeDocument('billet.txt', 'Vol Paris → Oulan-Bator'),
      makeDocument('hotel.txt', 'Nuit du 12 au 13'),
    ])

    const documents = await unpackDocuments(payload)

    expect(documents.map((d) => d.name)).toEqual(['billet.txt', 'hotel.txt'])
    expect(documents[0].type).toBe('text/plain')
    await expect(textOf(documents[0].blob)).resolves.toBe(
      'Vol Paris → Oulan-Bator',
    )
  })

  it('préserve un contenu binaire à l’octet près', async () => {
    const bytes = new Uint8Array([0, 255, 12, 7, 128, 64])
    const blob = new Blob([bytes], { type: 'application/octet-stream' })
    const payload = await packDocuments([
      { name: 'photo.bin', type: blob.type, size: blob.size, blob },
    ])

    const [document] = await unpackDocuments(payload)
    const restored = new Uint8Array(await document.blob.arrayBuffer())

    expect([...restored]).toEqual([...bytes])
  })

  it('refuse un payload qui n’est pas une archive de documents', async () => {
    await expect(unpackDocuments('pas-une-archive')).rejects.toThrow(
      'Données de partage illisibles ou incomplètes.',
    )
  })
})

describe('receivedDocumentsSize', () => {
  it('mesure des documents reçus, dont la taille est celle du contenu', async () => {
    const payload = await packDocuments([
      makeDocument('a.txt', 'douze octets'),
      makeDocument('b.txt', '!'),
    ])

    const documents = await unpackDocuments(payload)
    expect(receivedDocumentsSize(documents)).toBe(
      documents[0].blob.size + documents[1].blob.size,
    )
  })
})

describe('DOCUMENTS_SHARE_MAX_BYTES', () => {
  it('reste sous le plafond du payload, base64 compris', () => {
    // base64 pèse quatre tiers de ce qu'il encode : un lot pile à la limite
    // doit encore tenir dans ce que l'API accepte.
    expect(Math.ceil((DOCUMENTS_SHARE_MAX_BYTES * 4) / 3)).toBeLessThanOrEqual(
      SHARE_MAX_PAYLOAD_CHARS.documents,
    )
  })
})
