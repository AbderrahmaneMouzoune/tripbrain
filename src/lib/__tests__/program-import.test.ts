import { describe, expect, it } from 'vitest'
import type { DayItinerary } from '@/lib/itinerary-data'
import {
  buildImportPrompt,
  buildRefinePrompt,
  IMPORT_JSON_SHAPE,
} from '@/lib/generator/itinerary-prompt'
import {
  toDayItineraries,
  type GeneratedItinerary,
} from '@/lib/generator/itinerary-schema'
import {
  checkProgramText,
  docxXmlToText,
  ProgramFileError,
  programFileKind,
  readProgramFile,
} from '@/lib/generator/program-file'
import {
  importGaps,
  importRequestSchema,
  importSummary,
  MAX_IMPORT_DAYS,
  MAX_PROGRAM_TEXT_LENGTH,
  readImportedItinerary,
} from '@/lib/generator/program-import'
import { refineRequestSchema } from '@/lib/generator/requests'

const day = (over: Record<string, unknown> = {}) => ({
  date: '2027-05-12',
  city: 'Lisbonne',
  title: 'Alfama',
  activities: [{ name: 'Château São Jorge', type: 'visit' }],
  ...over,
})

const answer = (days: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    tripTitle: 'Lisbonne et Porto',
    summary: 'Une semaine au Portugal.',
    ...extra,
    days,
  })

describe('importRequestSchema', () => {
  const text = 'Jour 1 : Lisbonne, Alfama et château. Jour 2 : Sintra.'

  it('accepte un texte, avec ou sans date de départ', () => {
    expect(
      importRequestSchema.safeParse({
        mode: 'import',
        source: { kind: 'text', text },
      }).success,
    ).toBe(true)
    // Un voyage déjà fait s'importe aussi : la date passée est permise.
    expect(
      importRequestSchema.safeParse({
        mode: 'import',
        source: { kind: 'text', text },
        startDate: '2019-07-01',
      }).success,
    ).toBe(true)
  })

  it('refuse un texte trop court, trop long, ou une date illisible', () => {
    const parse = (source: unknown, startDate?: string) =>
      importRequestSchema.safeParse({ mode: 'import', source, startDate })
        .success
    expect(parse({ kind: 'text', text: 'Lisbonne' })).toBe(false)
    expect(
      parse({ kind: 'text', text: 'a'.repeat(MAX_PROGRAM_TEXT_LENGTH + 1) }),
    ).toBe(false)
    expect(parse({ kind: 'text', text }, '12/05/2027')).toBe(false)
  })

  it('n’accepte en PDF que ce qui commence comme un PDF', () => {
    const parse = (data: string) =>
      importRequestSchema.safeParse({
        mode: 'import',
        source: { kind: 'pdf', data },
      }).success
    expect(parse(btoa('%PDF-1.7 contenu'))).toBe(true)
    expect(parse(btoa('PK zip déguisé'))).toBe(false)
  })
})

describe('readImportedItinerary', () => {
  it('garde les dates du programme quand il en donne', () => {
    const result = readImportedItinerary(
      answer([day(), day({ date: '2027-05-13', city: 'Sintra' })], {
        datesFound: true,
      }),
      { startDate: '2030-01-01', today: '2026-11-11' },
    )
    expect(result.itinerary?.days.map((d) => d.date)).toEqual([
      '2027-05-12',
      '2027-05-13',
    ])
    expect(result.datesAssumed).toBe(false)
  })

  it('part de la date saisie quand le programme n’a pas de dates', () => {
    const result = readImportedItinerary(
      answer([day(), day()], { datesFound: false }),
      { startDate: '2027-08-01', today: '2026-11-11' },
    )
    expect(result.itinerary?.days.map((d) => d.date)).toEqual([
      '2027-08-01',
      '2027-08-02',
    ])
    expect(result.datesAssumed).toBe(false)
  })

  it('part d’aujourd’hui, et le dit, quand aucune date n’existe', () => {
    const result = readImportedItinerary(
      answer([day({ date: 'inconnue' })], { datesFound: false }),
      { today: '2026-11-11' },
    )
    expect(result.itinerary?.days[0].date).toBe('2026-11-11')
    expect(result.datesAssumed).toBe(true)
  })

  it('ne croit pas datesFound quand la première date est illisible', () => {
    const result = readImportedItinerary(
      answer([day({ date: '12 mai' })], { datesFound: true }),
      { today: '2026-11-11' },
    )
    expect(result.itinerary?.days[0].date).toBe('2026-11-11')
    expect(result.datesAssumed).toBe(true)
  })

  it('rend les dates consécutives même si le modèle laisse un trou', () => {
    const result = readImportedItinerary(
      answer([day(), day({ date: '2027-05-15' })], { datesFound: true }),
    )
    expect(result.itinerary?.days[1].date).toBe('2027-05-13')
  })

  it('réunit les nuits consécutives du même hébergement en un séjour', () => {
    const stay = { name: 'Lisboa Plaza', checkIn: '1999-01-01' }
    const result = readImportedItinerary(
      answer(
        [
          day({ accommodation: stay }),
          day({ accommodation: { name: 'lisboa plaza ' } }),
          day({ accommodation: { name: 'Casa do Porto' } }),
          day(),
        ],
        { datesFound: true },
      ),
    )
    const stays = result.itinerary?.days.map((d) => d.accommodation)
    expect(stays?.[0]).toMatchObject({
      checkIn: '2027-05-12',
      checkOut: '2027-05-14',
    })
    expect(stays?.[1]).toMatchObject({
      checkIn: '2027-05-12',
      checkOut: '2027-05-14',
    })
    expect(stays?.[2]).toMatchObject({
      checkIn: '2027-05-14',
      checkOut: '2027-05-15',
    })
    expect(stays?.[3]).toBeUndefined()
  })

  it('reconnaît un document qui n’est pas un programme', () => {
    const result = readImportedItinerary('{"error":"not_a_program"}')
    expect(result.notAProgram).toBe(true)
    expect(result.itinerary).toBeNull()
  })

  it('rend null pour une réponse illisible, sans la prendre pour un refus', () => {
    const result = readImportedItinerary('Désolé, je ne peux pas.')
    expect(result.itinerary).toBeNull()
    expect(result.notAProgram).toBe(false)
  })

  it('écarte les journées au-delà du plafond et les compte', () => {
    const days = Array.from({ length: MAX_IMPORT_DAYS + 3 }, () => day())
    const result = readImportedItinerary(answer(days, { datesFound: true }))
    expect(result.itinerary?.days).toHaveLength(MAX_IMPORT_DAYS)
    expect(result.droppedDays).toBe(3)
  })
})

describe('toDayItineraries (import)', () => {
  it('porte l’hébergement et marque le contenu comme importé', () => {
    const { itinerary } = readImportedItinerary(
      answer(
        [
          day({
            accommodation: {
              name: 'Lisboa Plaza',
              address: 'Travessa do Salitre 7',
              bookingReference: 'AB12',
            },
          }),
        ],
        { datesFound: true },
      ),
    )
    const [first] = toDayItineraries(itinerary!, 'import')
    expect(first.source).toBe('import')
    expect(first.activities[0].source).toBe('import')
    expect(first.accommodation).toMatchObject({
      id: 'acc-1',
      name: 'Lisboa Plaza',
      address: 'Travessa do Salitre 7',
      bookingUrl: '',
      bookingReference: 'AB12',
      checkIn: '2027-05-12',
      checkOut: '2027-05-13',
      source: 'import',
    })
  })

  it('reste « ai » par défaut, pour le générateur', () => {
    const { itinerary } = readImportedItinerary(
      answer([day()], { datesFound: true }),
    )
    expect(toDayItineraries(itinerary!)[0].source).toBe('ai')
  })
})

describe('importGaps', () => {
  const build = (days: unknown[]): DayItinerary[] =>
    toDayItineraries(
      readImportedItinerary(answer(days, { datesFound: true })).itinerary!,
      'import',
    )
  const coords = { lat: 38.7, lng: -9.1 }
  const full = (over: Record<string, unknown> = {}) =>
    day({ coordinates: coords, accommodation: { name: 'Hôtel' }, ...over })

  it('ne relève rien sur un programme complet', () => {
    // La dernière journée est celle du retour : pas de nuit attendue.
    const days = build([full(), full({ accommodation: undefined })])
    expect(importGaps(days)).toEqual([])
  })

  it('relève nuits sans hébergement, journées vides et trajets sans heure', () => {
    const days = build([
      full(),
      full({ accommodation: undefined, activities: [] }),
      full({
        accommodation: undefined,
        transport: { type: 'train', from: 'Lisbonne', to: 'Porto' },
      }),
      full({ accommodation: undefined }),
    ])
    const points = importGaps(days)
    expect(points.map((point) => point.id)).toEqual([
      'empty-days',
      'lodging',
      'transport-times',
    ])
    expect(points[0].summary).toBe('J2 sans activité')
    expect(points[1].summary).toBe('manquant pour 2 nuits (J2 à J3)')
    expect(points[2].summary).toBe('1 trajet sans horaire')
  })

  it('signale en premier une lecture coupée et des dates supposées', () => {
    const days = build([full(), full({ accommodation: undefined })])
    const points = importGaps(days, { truncated: true, datesAssumed: true })
    expect(points.map((point) => point.id)).toEqual(['truncated', 'dates'])
    expect(points[1].summary).toContain('12 mai 2027')
  })

  it('signale les villes absentes et les lieux hors carte', () => {
    const days = build([
      full({ city: '' }),
      full({ coordinates: undefined, accommodation: undefined }),
    ])
    expect(importGaps(days).map((point) => point.id)).toEqual([
      'cities',
      'day-coordinates',
    ])
  })

  it('résume ce qui a été repris', () => {
    const days = build([
      full({ transport: { type: 'plane', from: 'Paris', to: 'Lisbonne' } }),
      full({ accommodation: undefined }),
    ])
    expect(importSummary(days)).toBe(
      '2 jours, 2 activités, 1 trajet, 1 nuit d’hébergement',
    )
  })
})

describe('buildImportPrompt', () => {
  const dates = { fallbackStart: '2027-08-01', today: '2026-11-11' }

  it('encadre le texte du programme et impose la fidélité', () => {
    const prompt = buildImportPrompt(
      { kind: 'text', text: '  Jour 1 : Lisbonne  ' },
      dates,
    )
    expect(prompt.user).toContain(
      '<programme>\nJour 1 : Lisbonne\n</programme>',
    )
    expect(prompt.user).toContain('2027-08-01')
    expect(prompt.user).toContain('2026-11-11')
    expect(prompt.system).toContain('N’ajoute rien')
    expect(prompt.system).toContain('{"error":"not_a_program"}')
    expect(prompt.system).toContain(IMPORT_JSON_SHAPE)
    expect(prompt.document).toBeUndefined()
  })

  it('joint le PDF au lieu de le recopier dans le message', () => {
    const prompt = buildImportPrompt({ kind: 'pdf', data: 'JVBERi0x' }, dates)
    expect(prompt.document).toEqual({
      mediaType: 'application/pdf',
      data: 'JVBERi0x',
    })
    expect(prompt.user).not.toContain('JVBERi0x')
  })

  it('décrit les hébergements et datesFound dans la structure', () => {
    expect(IMPORT_JSON_SHAPE).toContain('"datesFound":true,"days":[')
    expect(IMPORT_JSON_SHAPE).toContain('"accommodation":{"name"')
  })
})

describe('affinage d’un programme importé', () => {
  const itinerary = {
    tripTitle: 'Lisbonne',
    summary: 'Trois jours.',
    days: [day({ date: '2019-07-01' })],
  } as GeneratedItinerary

  it('accepte un voyage passé et le drapeau imported', () => {
    const parsed = refineRequestSchema.safeParse({
      itinerary,
      instruction: 'Le jour 1 est à Porto',
      startDate: '2019-07-01',
      imported: true,
    })
    expect(parsed.success).toBe(true)
  })

  it('utilise les consignes de fidélité et la structure d’import', () => {
    const base = buildRefinePrompt(itinerary, 'x', '2019-07-01')
    const imported = buildRefinePrompt(itinerary, 'x', '2019-07-01', {
      imported: true,
    })
    expect(imported.system).not.toBe(base.system)
    expect(imported.system).toContain('"accommodation"')
    expect(base.system).not.toContain('"accommodation"')
  })
})

describe('lecture des fichiers', () => {
  it('reconnaît les formats pris en charge', () => {
    expect(programFileKind('Voyage.PDF')).toBe('pdf')
    expect(programFileKind('programme.docx')).toBe('docx')
    expect(programFileKind('planning.xlsx')).toBe('xlsx')
    expect(programFileKind('notes.txt')).toBe('text')
    expect(programFileKind('ancien.doc')).toBeNull()
    expect(programFileKind('photo.jpg')).toBeNull()
  })

  it('tire le texte d’un document Word, paragraphes et tableaux', () => {
    const xml =
      '<w:document><w:body>' +
      '<w:p><w:r><w:t>Jour 1 &amp; arrivée</w:t></w:r></w:p>' +
      '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>9h</w:t></w:r></w:p></w:tc>' +
      '<w:tc><w:p><w:r><w:t xml:space="preserve">Train </w:t></w:r><w:r><w:t>Rossio</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
      '<w:p><w:r><w:t>Ligne</w:t><w:br/><w:t>suivante &#233;</w:t></w:r></w:p>' +
      '</w:body></w:document>'
    const text = docxXmlToText(xml)
    expect(text).toContain('Jour 1 & arrivée')
    expect(text).toContain('9h')
    expect(text).toContain('Train Rossio')
    expect(text).toContain('Ligne\nsuivante é')
    expect(text).not.toContain('<')
  })

  it('refuse un texte vide ou démesuré avec un message utile', () => {
    expect(() => checkProgramText('   ')).toThrow(ProgramFileError)
    expect(() =>
      checkProgramText('a'.repeat(MAX_PROGRAM_TEXT_LENGTH + 1)),
    ).toThrow(/trop long/)
    expect(checkProgramText(`  ${'Jour 1 Lisbonne. '.repeat(3)}\r\n`)).toBe(
      'Jour 1 Lisbonne. '.repeat(3).trim(),
    )
  })

  it('lit un fichier texte et encode un PDF', async () => {
    const text = 'Jour 1 : Lisbonne, Alfama, château São Jorge.'
    await expect(
      readProgramFile(new File([text], 'voyage.txt')),
    ).resolves.toEqual({ kind: 'text', text })

    const pdf = await readProgramFile(new File(['%PDF-1.7 abc'], 'voyage.pdf'))
    expect(pdf).toEqual({ kind: 'pdf', data: btoa('%PDF-1.7 abc') })
    expect(
      importRequestSchema.safeParse({ mode: 'import', source: pdf }).success,
    ).toBe(true)
  })

  it('refuse un faux PDF et un format inconnu', async () => {
    await expect(
      readProgramFile(new File(['bonjour'], 'voyage.pdf')),
    ).rejects.toThrow(/PDF lisible/)
    await expect(
      readProgramFile(new File(['x'], 'voyage.doc')),
    ).rejects.toThrow(/PDF/)
    await expect(readProgramFile(new File(['x'], 'photo.jpg'))).rejects.toThrow(
      /Format non pris en charge/,
    )
  })
})
