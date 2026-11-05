import { encode } from '@msgpack/msgpack'
import { S3ndError } from '@s3nd/core'
import { itinerary as demoItinerary } from '@/lib/itinerary-data'
import { compressItinerary } from '@/lib/share'
import {
  MAX_STAY_KEY_LENGTH,
  MAX_TEMPLATE_DAYS,
  MAX_TEMPLATE_DAY_ACTIVITIES,
  MAX_TEMPLATE_PRIVATE_STAYS,
  MAX_TEMPLATE_TITLE_LENGTH,
} from '@/lib/template-model'
import {
  RETIRED_BODY,
  TEMPLATE_MAX_BODY_BYTES,
  TEMPLATE_MAX_INFLATED_BYTES,
  TEMPLATE_MAX_PAYLOAD_CHARS,
  TEMPLATE_MAX_STRING_BYTES,
  TEMPLATE_NOT_CONFIGURED,
  nestingTooDeep,
  openTemplateStore,
  parseIndexPage,
  parseTemplatePatch,
  parseTemplatePublish,
  parseTemplateUpdate,
  readJsonBody,
  templateErrorReply,
  templateErrorResponse,
  tooManyTemplateRequests,
} from '@/lib/template-request'
import { TemplateStoreError } from '@/lib/template-store'
import {
  activity,
  compressedBytes,
  compressedZeros,
  day,
  hotel,
  japanTrip,
  transport,
} from './helpers/template-fixtures'

let data: string

beforeAll(async () => {
  data = await compressItinerary(japanTrip())
})

function failure(result: { ok: boolean }) {
  return result.ok ? null : result
}

const TOO_LARGE = {
  ok: false,
  status: 413,
  error: 'Itinéraire trop volumineux pour être publié.',
}

/** Un voyage de `count` journées ordinaires. */
function longTrip(count: number) {
  return Array.from({ length: count }, (_, index) =>
    day(index + 1, { date: '2026-04-01' }),
  )
}

/** Une journée dont les activités sont `count` objets vides : un octet chacun en msgpack. */
function dayWithEmptyActivities(count: number): string {
  const empty = {}
  return compressedBytes(
    encode([{ ...day(1), activities: new Array<object>(count).fill(empty) }]),
  )
}

/**
 * Un itinéraire valable dont une clé ignorée (`extra`) cache `depth` niveaux
 * imbriqués : `opener` ouvre chaque niveau, nil au fond. La journée en
 * ajoute deux (la liste des journées, puis la journée elle-même).
 */
function nestedInIgnoredKey(depth: number, opener: number[]): string {
  const placeholder = 'PLACEHOLDER-PROFONDEUR'
  const bytes = Buffer.from(encode([{ ...day(1), extra: placeholder }]))
  const marker = Buffer.from(encode(placeholder))
  const at = bytes.indexOf(marker)
  const levels = Buffer.from(Array.from({ length: depth }, () => opener).flat())
  return compressedBytes(
    Buffer.concat([
      bytes.subarray(0, at),
      levels,
      Buffer.from([0xc0]),
      bytes.subarray(at + marker.length),
    ]),
  )
}

/** 0x91 : tableau d'un élément. */
const ONE_ITEM_ARRAY = [0x91]
/** 0x81 0x00 : objet d'une entrée, de clé 0. */
const ONE_ENTRY_MAP = [0x81, 0x00]

describe('décompression bornée', () => {
  // 64 Mio de zéros : 87 Ko une fois compressés, bien sous les 2 Mo.
  let bomb: string

  beforeAll(() => {
    bomb = compressedZeros(64 * 1024 * 1024)
  })

  it('refuse avec un 413 une bombe de décompression, à la publication comme à la mise à jour', () => {
    expect(bomb.length).toBeLessThan(TEMPLATE_MAX_PAYLOAD_CHARS / 10)
    expect(
      failure(parseTemplatePublish({ data: bomb, country: 'JP' })),
    ).toEqual(TOO_LARGE)
    expect(failure(parseTemplateUpdate({ data: bomb }))).toEqual(TOO_LARGE)
  })

  it('refuse un itinéraire qui se décompresse au-delà de la borne, même d’un octet', () => {
    expect(
      failure(
        parseTemplatePublish({
          data: compressedZeros(TEMPLATE_MAX_INFLATED_BYTES + 1),
          country: 'JP',
        }),
      ),
    ).toEqual(TOO_LARGE)
  })

  it('refuse une bombe d’objets msgpack avant de les construire', () => {
    // 1,5 million d'activités vides tiennent sous la borne de décompression.
    const objects = dayWithEmptyActivities(1_500_000)
    expect(objects.length).toBeLessThan(10_000)
    expect(
      failure(parseTemplatePublish({ data: objects, country: 'JP' })),
    ).toEqual(TOO_LARGE)
    expect(failure(parseTemplateUpdate({ data: objects }))).toEqual(TOO_LARGE)
  })

  it(`refuse plus de ${MAX_TEMPLATE_DAYS} journées, et les accepte jusque-là`, async () => {
    const longest = await compressItinerary(longTrip(MAX_TEMPLATE_DAYS))
    const parsed = parseTemplatePublish({ data: longest, country: 'JP' })
    expect(parsed.ok && parsed.data.itinerary).toHaveLength(MAX_TEMPLATE_DAYS)

    const tooLong = await compressItinerary(longTrip(MAX_TEMPLATE_DAYS + 1))
    expect(
      failure(parseTemplatePublish({ data: tooLong, country: 'JP' })),
    ).toEqual(TOO_LARGE)
  })

  it(`refuse une journée de plus de ${MAX_TEMPLATE_DAY_ACTIVITIES} activités`, async () => {
    const activities = Array.from(
      { length: MAX_TEMPLATE_DAY_ACTIVITIES + 1 },
      (_, index) => activity({ id: `act-${index}` }),
    )
    const crowded = await compressItinerary([day(1, { activities })])
    expect(failure(parseTemplateUpdate({ data: crowded }))).toEqual(TOO_LARGE)
  })

  it('refuse un texte démesuré dans l’itinéraire', async () => {
    const [first] = japanTrip()
    const wordy = await compressItinerary([
      { ...first, notes: 'x'.repeat(TEMPLATE_MAX_STRING_BYTES + 1) },
    ])
    expect(
      failure(parseTemplatePublish({ data: wordy, country: 'JP' })),
    ).toEqual(TOO_LARGE)
  })

  it('refuse une imbrication profonde cachée dans une clé ignorée, en tableaux comme en objets', () => {
    for (const opener of [ONE_ITEM_ARRAY, ONE_ENTRY_MAP]) {
      // 2 Mio d'imbrication coûtaient ~340 Mo de tas avant d'être ignorés.
      const deep = nestedInIgnoredKey(1_000_000, opener)
      expect(deep.length).toBeLessThan(10_000)
      const started = performance.now()
      expect(
        failure(parseTemplatePublish({ data: deep, country: 'JP' })),
      ).toEqual(TOO_LARGE)
      expect(failure(parseTemplateUpdate({ data: deep }))).toEqual(TOO_LARGE)
      expect(performance.now() - started).toBeLessThan(500)
    }
  })

  it('accepte 8 niveaux d’imbrication et refuse le 9ᵉ', () => {
    for (const opener of [ONE_ITEM_ARRAY, ONE_ENTRY_MAP]) {
      const eight = parseTemplatePublish({
        data: nestedInIgnoredKey(6, opener),
        country: 'JP',
      })
      expect(eight.ok).toBe(true)
      // La clé ignorée ne survit pas à la remise en forme.
      expect(eight.ok && eight.data.itinerary[0]).not.toHaveProperty('extra')
      expect(
        failure(
          parseTemplatePublish({
            data: nestedInIgnoredKey(7, opener),
            country: 'JP',
          }),
        ),
      ).toEqual(TOO_LARGE)
    }
  })

  it('accepte le voyage de démo, le plus riche de l’app', async () => {
    const parsed = parseTemplatePublish({
      data: await compressItinerary(demoItinerary),
      country: 'CN',
    })
    expect(parsed.ok && parsed.data.itinerary).toHaveLength(
      demoItinerary.length,
    )
  })

  it('mesure l’imbrication sans se tromper de longueur sur aucun type msgpack', () => {
    // Chaque scalaire, chaîne, binaire et extension, puis 3 niveaux au bout :
    // une seule longueur mal sautée désynchroniserait la lecture de la fin.
    const values = [
      0,
      -1,
      200,
      -200,
      70_000,
      -70_000,
      5_000_000_000,
      -5_000_000_000,
      1.5,
      null,
      true,
      false,
      'a',
      'é'.repeat(40),
      'x'.repeat(300),
      'y'.repeat(70_000),
      new Uint8Array(3),
      new Uint8Array(300),
      new Uint8Array(70_000),
      new Date(0),
      new Date(1_700_000_000_123),
      Array.from({ length: 20 }, (_, i) => i),
      Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, i])),
    ]
    expect(nestingTooDeep(encode(values), 2)).toBe(false)
    expect(nestingTooDeep(encode([...values, [[1]]]), 2)).toBe(true)
    expect(nestingTooDeep(encode([...values, [[1]]]), 3)).toBe(false)
    expect(nestingTooDeep(encode([[[1]]]), 2)).toBe(true)
    expect(nestingTooDeep(encode([[[1]]]), 3)).toBe(false)
    // Les conteneurs vides n'ouvrent aucun niveau.
    expect(nestingTooDeep(encode([[[]], {}]), 2)).toBe(false)
    // Un tampon tronqué lève : l'appelant répond 400.
    expect(() => nestingTooDeep(encode([[1, 2, 3]]).subarray(0, 3), 8)).toThrow(
      RangeError,
    )
    expect(
      failure(
        parseTemplatePublish({
          data: compressedBytes(Buffer.from([0x92, 0x91])),
          country: 'JP',
        }),
      ),
    ).toMatchObject({ status: 400 })
  })

  it('refuse des octets qui ne sont pas un itinéraire', () => {
    const illegible = {
      ok: false,
      status: 400,
      error: 'Itinéraire illisible.',
    }
    // Du msgpack valide, mais pas une liste de journées.
    expect(
      failure(
        parseTemplatePublish({
          data: compressedBytes(encode({ jours: 3 })),
          country: 'JP',
        }),
      ),
    ).toEqual(illegible)
    // Du DEFLATE valide, mais pas du msgpack.
    expect(
      failure(
        parseTemplatePublish({
          data: compressedBytes(new Uint8Array([0xc1])),
          country: 'JP',
        }),
      ),
    ).toEqual(illegible)
  })
})

describe('forme des valeurs décodées', () => {
  /** Ce qu'un client forgé peut envoyer : msgpack transporte NaN, objets et tableaux partout. */
  function forged(days: unknown[]): string {
    return compressedBytes(encode(days))
  }

  const ILLEGIBLE = { ok: false, status: 400, error: 'Itinéraire illisible.' }

  it('retire les valeurs mal typées, à la publication comme à la mise à jour', () => {
    const data = forged([
      {
        ...day(1),
        notes: { texte: 'Kenji' },
        highlights: ['Shibuya', 7],
        images: [
          { url: 'javascript:alert(1)', caption: 'piège' },
          { url: 'https://example.com/tokyo.jpg', caption: 'Tokyo' },
        ],
        activities: [
          { ...activity({ id: 'act-objet' }), name: { fr: 'Temple' } },
          {
            ...activity({ id: 'act-ok' }),
            price: Number.NaN,
            coordinates: ['35.6', '139.6'],
            images: ['javascript:alert(1)'],
          },
        ],
        transport: { ...transport(), type: 'ferry' },
        accommodation: { id: 'acc-1', name: 'Ryokan Sawanoya', price: 'cher' },
      },
    ])
    const expected = [
      {
        ...day(1),
        highlights: ['Shibuya'],
        images: [{ url: 'https://example.com/tokyo.jpg', caption: 'Tokyo' }],
        activities: [{ ...activity({ id: 'act-ok' }), images: [] }],
        // Un ferry n'est pas retiré : il devient un trajet en bateau.
        transport: { ...transport(), type: 'boat' },
        accommodation: {
          id: 'acc-1',
          name: 'Ryokan Sawanoya',
          address: '',
          bookingUrl: '',
          checkIn: '',
          checkOut: '',
        },
      },
    ]

    const published = parseTemplatePublish({ data, country: 'JP' })
    expect(published.ok && published.data.itinerary).toEqual(expected)
    const updated = parseTemplateUpdate({ data })
    expect(updated.ok && updated.data.itinerary).toEqual(expected)
  })

  it('garde un hébergement et un transport bien formés', () => {
    const data = forged([
      day(1, { accommodation: hotel(), transport: transport() }),
    ])
    const parsed = parseTemplateUpdate({ data })
    expect(parsed.ok && parsed.data.itinerary).toEqual([
      day(1, { accommodation: hotel(), transport: transport() }),
    ])
  })

  it.each([
    ['des coordonnées en texte', { coordinates: ['35.6', '139.6'] }],
    ['des coordonnées NaN', { coordinates: [Number.NaN, 0] }],
    ['un numéro de jour infini', { dayNumber: Number.POSITIVE_INFINITY }],
    ['un titre objet', { title: { fr: 'Jour 2' } }],
    ['une ville nulle', { city: null }],
  ])('refuse en 400 une journée avec %s', (_label, change) => {
    const data = forged([day(1), { ...day(2), ...change }])
    expect(failure(parseTemplatePublish({ data, country: 'JP' }))).toEqual(
      ILLEGIBLE,
    )
    expect(failure(parseTemplateUpdate({ data }))).toEqual(ILLEGIBLE)
  })
})

describe('parseTemplatePublish', () => {
  it('décompresse l’itinéraire et applique les réglages par défaut de l’écran A3', () => {
    const parsed = parseTemplatePublish({ data, country: 'JP' })
    expect(parsed).toEqual({
      ok: true,
      data: {
        itinerary: japanTrip(),
        title: null,
        authorName: null,
        country: 'JP',
        options: { includeNotes: false, includePrices: true, privateStays: [] },
        indexable: true,
      },
    })
  })

  it('garde les choix de l’auteur, titre et prénom nettoyés', () => {
    const parsed = parseTemplatePublish({
      data,
      country: 'JP',
      title: '  Japon   en 3 jours ',
      authorName: '  Yanis ',
      options: { includeNotes: true },
      indexable: false,
    })
    expect(parsed.ok && parsed.data).toMatchObject({
      title: 'Japon en 3 jours',
      authorName: 'Yanis',
      options: { includeNotes: true, includePrices: true, privateStays: [] },
      indexable: false,
    })
  })

  it('garde les hébergements privés, dédoublonnés, dans l’ordre reçu', () => {
    const parsed = parseTemplatePublish({
      data,
      country: 'JP',
      options: {
        privateStays: ['cheztantelurdes', '#acc-7', 'cheztantelurdes'],
      },
    })
    expect(parsed.ok && parsed.data.options).toEqual({
      includeNotes: false,
      includePrices: true,
      privateStays: ['cheztantelurdes', '#acc-7'],
    })
  })

  it('refuse des hébergements privés mal formés (400), sans rien publier', () => {
    const tooMany = Array.from(
      { length: MAX_TEMPLATE_PRIVATE_STAYS + 1 },
      (_, index) => `#acc-${index}`,
    )
    for (const privateStays of [
      'cheztantelurdes',
      [42],
      [''],
      ['Chez Marie'],
      ['x'.repeat(MAX_STAY_KEY_LENGTH + 1)],
      tooMany,
      null,
      { 0: 'chezmarie' },
    ]) {
      expect(
        failure(
          parseTemplatePublish({
            data,
            country: 'JP',
            options: { privateStays },
          }),
        ),
      ).toEqual({
        ok: false,
        status: 400,
        error: 'Hébergements privés invalides.',
      })
    }
    // À la borne, tout passe.
    const bounded = Array.from(
      { length: MAX_TEMPLATE_PRIVATE_STAYS },
      (_, index) => `#acc-${index}`,
    )
    bounded[0] = 'x'.repeat(MAX_STAY_KEY_LENGTH)
    const parsed = parseTemplatePublish({
      data,
      country: 'JP',
      options: { privateStays: bounded },
    })
    expect(parsed.ok && parsed.data.options.privateStays).toEqual(bounded)
  })

  it('borne le titre à 120 caractères', () => {
    const parsed = parseTemplatePublish({
      data,
      country: 'JP',
      title: 'x'.repeat(500),
    })
    expect(parsed.ok && parsed.data.title).toHaveLength(120)
  })

  it('ne coupe jamais un emoji en deux à la borne du titre ou du prénom', () => {
    const parsed = parseTemplatePublish({
      data,
      country: 'PT',
      title: `${'a'.repeat(119)}😀`,
      authorName: `${'b'.repeat(39)}😀`,
    })
    expect(parsed.ok && parsed.data).toMatchObject({
      title: 'a'.repeat(119),
      authorName: 'b'.repeat(39),
    })
    const updated = parseTemplateUpdate({
      data,
      title: `${'c'.repeat(119)}🗾`,
    })
    expect(updated.ok && updated.data.title).toBe('c'.repeat(119))
    // Un emoji qui tient entier sous la borne reste.
    const fits = parseTemplatePublish({
      data,
      country: 'PT',
      title: `${'a'.repeat(118)}😀`,
    })
    expect(fits.ok && fits.data.title).toBe(`${'a'.repeat(118)}😀`)
  })

  it('remplace une moitié de paire isolée envoyée telle quelle', () => {
    const parsed = parseTemplatePublish(
      JSON.parse(
        `{"data":"${data}","country":"PT","title":"Porto \\ud83d","authorName":"\\udc00Rui"}`,
      ),
    )
    expect(parsed.ok && parsed.data).toMatchObject({
      title: 'Porto \ufffd',
      authorName: '\ufffdRui',
    })
  })

  it('exige un itinéraire lisible et non vide', async () => {
    expect(failure(parseTemplatePublish({ country: 'JP' }))).toMatchObject({
      status: 400,
    })
    expect(
      failure(
        parseTemplatePublish({ data: 'pas-un-itineraire', country: 'JP' }),
      ),
    ).toEqual({ ok: false, status: 400, error: 'Itinéraire illisible.' })
    const empty = await compressItinerary([])
    expect(
      failure(parseTemplatePublish({ data: empty, country: 'JP' })),
    ).toEqual({
      ok: false,
      status: 400,
      error: 'Le modèle doit contenir au moins une journée.',
    })
  })

  it('refuse un payload de plus de 2 Mo avec un 413', () => {
    const huge = 'a'.repeat(TEMPLATE_MAX_PAYLOAD_CHARS + 1)
    expect(
      failure(parseTemplatePublish({ data: huge, country: 'JP' })),
    ).toEqual({
      ok: false,
      status: 413,
      error: 'Itinéraire trop volumineux pour être publié.',
    })
  })

  it('exige un pays ISO connu', () => {
    for (const country of [undefined, '', 'jp', 'ZZ', 'Japon', 81]) {
      expect(failure(parseTemplatePublish({ data, country }))).toEqual({
        ok: false,
        status: 400,
        error: 'Pays du voyage invalide.',
      })
    }
  })

  it('refuse des champs du mauvais type', () => {
    const cases = [
      { title: 42 },
      { authorName: ['Yanis'] },
      { options: 'toutes' },
      { options: { includePrices: 'oui' } },
      { indexable: 'true' },
    ]
    for (const extra of cases) {
      expect(
        failure(parseTemplatePublish({ data, country: 'JP', ...extra })),
      ).toMatchObject({ status: 400 })
    }
    expect(failure(parseTemplatePublish(null))).toMatchObject({ status: 400 })
    expect(failure(parseTemplatePublish([data]))).toMatchObject({ status: 400 })
  })
})

describe('parseTemplateUpdate', () => {
  it('laisse absents le titre et les réglages non envoyés', () => {
    const parsed = parseTemplateUpdate({ data })
    expect(parsed).toEqual({ ok: true, data: { itinerary: japanTrip() } })
  })

  it('distingue un titre effacé d’un titre absent', () => {
    const parsed = parseTemplateUpdate({ data, title: '   ' })
    expect(parsed.ok && parsed.data).toHaveProperty('title', null)
  })

  it('ne garde que les réglages envoyés : les autres restent ceux publiés', () => {
    const parsed = parseTemplateUpdate({
      data,
      options: { includePrices: false },
    })
    // Ni `includeNotes` ni `privateStays` : le store garde ceux de la méta.
    expect(parsed.ok && parsed.data.options).toEqual({ includePrices: false })
  })

  it('distingue des hébergements privés absents d’une liste vide', () => {
    const cleared = parseTemplateUpdate({ data, options: { privateStays: [] } })
    expect(cleared.ok && cleared.data.options).toEqual({ privateStays: [] })
    const sent = parseTemplateUpdate({
      data,
      options: { privateStays: ['chezmarie', 'chezmarie'] },
    })
    expect(sent.ok && sent.data.options).toEqual({
      privateStays: ['chezmarie'],
    })
    expect(
      failure(
        parseTemplateUpdate({
          data,
          options: { privateStays: ['Chez Marie'] },
        }),
      ),
    ).toEqual({
      ok: false,
      status: 400,
      error: 'Hébergements privés invalides.',
    })
    expect(
      failure(parseTemplateUpdate({ data, options: { includeNotes: null } })),
    ).toMatchObject({ status: 400 })
  })

  it('refuse une mise à jour sans itinéraire', () => {
    expect(failure(parseTemplateUpdate({ title: 'Japon' }))).toMatchObject({
      status: 400,
    })
  })
})

describe('parseTemplatePatch', () => {
  it('lit la visibilité et le prénom', () => {
    expect(parseTemplatePatch({ indexable: false })).toEqual({
      ok: true,
      data: { indexable: false },
    })
    expect(parseTemplatePatch({ authorName: ' Léa ' })).toEqual({
      ok: true,
      data: { authorName: 'Léa' },
    })
  })

  it('efface le prénom avec null', () => {
    expect(parseTemplatePatch({ authorName: null })).toEqual({
      ok: true,
      data: { authorName: null },
    })
  })

  it('refuse un changement vide ou mal typé', () => {
    expect(failure(parseTemplatePatch({}))).toEqual({
      ok: false,
      status: 400,
      error: 'Aucun réglage à modifier.',
    })
    expect(failure(parseTemplatePatch({ indexable: 'non' }))).toMatchObject({
      status: 400,
    })
    expect(failure(parseTemplatePatch({ authorName: 7 }))).toMatchObject({
      status: 400,
    })
  })

  it('lit le titre comme à la publication : espaces resserrées, borné sans couper un emoji', () => {
    expect(parseTemplatePatch({ title: '  Le Japon \n en vrai ' })).toEqual({
      ok: true,
      data: { title: 'Le Japon en vrai' },
    })
    const long = `${'a'.repeat(MAX_TEMPLATE_TITLE_LENGTH - 1)}🗾 fin`
    expect(parseTemplatePatch({ title: long })).toEqual({
      ok: true,
      data: { title: 'a'.repeat(MAX_TEMPLATE_TITLE_LENGTH - 1) },
    })
    expect(
      parseTemplatePatch({ title: 'Japon', indexable: true, authorName: null }),
    ).toEqual({
      ok: true,
      data: { title: 'Japon', indexable: true, authorName: null },
    })
  })

  it('un titre vide ou nul sera tiré des étapes ; un titre qui n’est pas un texte est refusé', () => {
    for (const title of ['', '   ', null]) {
      expect(parseTemplatePatch({ title })).toEqual({
        ok: true,
        data: { title: null },
      })
    }
    for (const title of [42, ['Japon'], { fr: 'Japon' }, true]) {
      expect(failure(parseTemplatePatch({ title }))).toEqual({
        ok: false,
        status: 400,
        error: 'Titre du modèle invalide.',
      })
    }
  })
})

describe('parseIndexPage', () => {
  it('prend la page 0 sans paramètre, et toute page entière positive', () => {
    expect(parseIndexPage(null)).toEqual({ ok: true, data: 0 })
    for (const [value, page] of [
      ['0', 0],
      ['1', 1],
      ['42', 42],
      ['999999', 999_999],
    ] as const) {
      expect(parseIndexPage(value)).toEqual({ ok: true, data: page })
    }
  })

  it('refuse en 400 tout le reste', () => {
    for (const value of [
      '',
      '-1',
      '+1',
      '1.5',
      '1e3',
      '01',
      ' 1',
      'abc',
      '1000000',
      '0x10',
    ]) {
      expect(failure(parseIndexPage(value))).toEqual({
        ok: false,
        status: 400,
        error: 'Page de l’index invalide.',
      })
    }
  })
})

describe('readJsonBody', () => {
  it('refuse d’emblée un corps annoncé trop lourd', async () => {
    const request = new Request('http://localhost/api/templates', {
      method: 'POST',
      body: '{}',
      headers: { 'Content-Length': String(TEMPLATE_MAX_BODY_BYTES + 1) },
    })
    expect(await readJsonBody(request)).toMatchObject({
      ok: false,
      status: 413,
    })
  })

  it('refuse un JSON illisible', async () => {
    const request = new Request('http://localhost/api/templates', {
      method: 'POST',
      body: '{data:',
    })
    expect(await readJsonBody(request)).toEqual({
      ok: false,
      status: 400,
      error: 'Requête illisible.',
    })
  })

  /**
   * Un envoi chunked : un flux, sans `Content-Length`. `pulled()` dit combien
   * de morceaux le serveur a demandés.
   */
  function streamedRequest(parts: (string | Uint8Array)[]) {
    const encoder = new TextEncoder()
    let pulled = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulled >= parts.length) return controller.close()
        const part = parts[pulled++]
        controller.enqueue(
          typeof part === 'string' ? encoder.encode(part) : part,
        )
      },
    })
    const request = new Request('http://localhost/api/templates', {
      method: 'POST',
      body,
      duplex: 'half',
    } as RequestInit)
    expect(request.headers.get('content-length')).toBeNull()
    return Object.assign(request, { pulled: () => pulled })
  }

  it('refuse en 413 un corps chunked trop lourd, sans le lire jusqu’au bout', async () => {
    const chunk = 'x'.repeat(1024 * 1024)
    const parts = [
      '{"data":"',
      ...Array.from({ length: 40 }, () => chunk),
      '"}',
    ]
    const request = streamedRequest(parts)
    expect(await readJsonBody(request)).toEqual(TOO_LARGE)
    // Le plafond (2 Mio + 64 Kio) tombe au 4ᵉ morceau : le reste n'est pas lu.
    expect(request.pulled()).toBeLessThan(6)
  })

  it('accepte un corps chunked sous le plafond, découpé n’importe où', async () => {
    const text = JSON.stringify({ data, country: 'JP', title: 'Été 🗾' })
    const bytes = new TextEncoder().encode(text)
    // Coupé au milieu d'un caractère multi-octets.
    const cut = text.indexOf('🗾') + 2
    const request = streamedRequest([
      bytes.subarray(0, cut),
      bytes.subarray(cut),
    ])
    expect(await readJsonBody(request)).toEqual({
      ok: true,
      data: { data, country: 'JP', title: 'Été 🗾' },
    })
  })

  it('refuse en 400 un corps chunked illisible ou vide', async () => {
    const illegible = { ok: false, status: 400, error: 'Requête illisible.' }
    expect(await readJsonBody(streamedRequest(['{"data":', '']))).toEqual(
      illegible,
    )
    expect(await readJsonBody(streamedRequest([]))).toEqual(illegible)
    expect(
      await readJsonBody(
        new Request('http://localhost/api/templates', { method: 'POST' }),
      ),
    ).toEqual(illegible)
  })

  it('lit un corps qui commence par une marque d’ordre des octets, comme request.json()', async () => {
    expect(await readJsonBody(streamedRequest(['\ufeff{"a":1}']))).toEqual({
      ok: true,
      data: { a: 1 },
    })
  })
})

describe('templateErrorReply', () => {
  it('traduit les refus du store en statuts HTTP', () => {
    const statuses = (
      [
        'missing',
        'retired',
        'forbidden',
        'conflict',
        'invalid',
        'index',
        'versions',
      ] as const
    ).map(
      (code) =>
        templateErrorReply(new TemplateStoreError(code), 'Échec.').status,
    )
    expect(statuses).toEqual([404, 410, 403, 409, 400, 503, 503])
  })

  it('demande de réessayer un retrait que l’index public n’a pas suivi', () => {
    expect(
      templateErrorReply(new TemplateStoreError('index'), 'Échec.'),
    ).toEqual({
      status: 503,
      body: {
        error:
          'Le modèle n’a pas pu être retiré de la liste publique de tripbrain.fr. Réessaie.',
      },
    })
  })

  it('demande de réessayer un retrait dont le contenu n’a pas été effacé, sans mot que les métriques prendraient pour un autre échec', () => {
    const reply = templateErrorReply(
      new TemplateStoreError('versions'),
      'Échec.',
    )
    expect(reply).toEqual({
      status: 503,
      body: {
        error:
          'Le modèle est retiré, mais son contenu n’a pas pu être effacé. Réessaie.',
      },
    })
    expect(reply.body.error).not.toMatch(/code|expir/i)
  })

  it('signale un modèle retiré par son statut', () => {
    expect(
      templateErrorReply(new TemplateStoreError('retired'), 'Échec.').body,
    ).toEqual(RETIRED_BODY)
  })

  it('traduit les erreurs s3nd attendues, et le reste en 500', () => {
    expect(
      templateErrorReply(new S3ndError('FILE_TOO_LARGE', 'trop gros'), 'Échec.')
        .status,
    ).toBe(413)
    expect(
      templateErrorReply(new S3ndError('SNAPSHOT_TOO_NEW', 'v2'), 'Échec.')
        .status,
    ).toBe(409)
    expect(
      templateErrorReply(new S3ndError('UPLOAD_FAILED', 'réseau'), 'Échec.'),
    ).toEqual({ status: 500, body: { error: 'Échec.' } })
    expect(templateErrorReply(new Error('boum'), 'Échec.').status).toBe(500)
  })

  it('ne met jamais un échec en cache, et journalise les 500', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = templateErrorResponse(new Error('boum'), 'Échec.')
    expect(response.status).toBe(500)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ error: 'Échec.' })
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
  })
})

describe('openTemplateStore', () => {
  it('répond 503 quand R2 n’est pas configuré', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = openTemplateStore(() => {
      throw new Error('Variable d’environnement manquante : R2_BUCKET_NAME')
    })
    expect(result).toBeInstanceOf(Response)
    if (!(result instanceof Response)) return
    expect(result.status).toBe(503)
    expect(await result.json()).toEqual({ error: TEMPLATE_NOT_CONFIGURED })
    logged.mockRestore()
  })
})

describe('messages d’erreur', () => {
  // `analytics/metrics.ts` classe les échecs d'après ces sous-chaînes : un
  // message de modèle qui les contiendrait fausserait la mesure.
  it('ne contiennent ni « code » ni « expir »', async () => {
    const messages = [
      TEMPLATE_NOT_CONFIGURED,
      RETIRED_BODY.error,
      ...(
        [
          'missing',
          'retired',
          'forbidden',
          'conflict',
          'invalid',
          'index',
          'versions',
        ] as const
      ).map((code) => new TemplateStoreError(code).message),
      templateErrorReply(new S3ndError('FILE_TOO_LARGE', ''), '').body.error,
      templateErrorReply(new S3ndError('SNAPSHOT_TOO_NEW', ''), '').body.error,
    ]
    const rejected = [
      parseTemplatePublish(null),
      parseTemplatePublish({ country: 'JP' }),
      parseTemplatePublish({ data: 'x', country: 'JP' }),
      parseTemplatePublish({
        data: 'a'.repeat(TEMPLATE_MAX_PAYLOAD_CHARS + 1),
      }),
      parseTemplatePublish({ data, country: 'ZZ' }),
      parseTemplatePublish({ data, country: 'JP', title: 1 }),
      parseTemplatePublish({ data, country: 'JP', authorName: 1 }),
      parseTemplatePublish({ data, country: 'JP', options: 1 }),
      parseTemplatePublish({
        data,
        country: 'JP',
        options: { privateStays: 'chezmarie' },
      }),
      parseTemplatePublish({ data, country: 'JP', indexable: 1 }),
      parseTemplatePublish({
        data: await compressItinerary([]),
        country: 'JP',
      }),
      parseTemplatePublish({ data: compressedZeros(4_000_000), country: 'JP' }),
      parseTemplatePatch({}),
      parseTemplatePatch({ title: 1 }),
      parseIndexPage('-1'),
    ]
    for (const result of rejected) {
      if (!result.ok) messages.push(result.error)
    }
    expect(messages.length).toBeGreaterThan(15)
    for (const message of messages) {
      expect(message.toLowerCase()).not.toMatch(/code|expir/)
      // Décision du propriétaire : l'app tutoie, partout.
      expect(message).not.toMatch(
        /\bvous\b|\bvotre\b|\bvos\b|réessayez|mettez|relancez|vérifiez/i,
      )
    }
    expect(
      templateErrorReply(new S3ndError('SNAPSHOT_TOO_NEW', ''), '').body.error,
    ).toBe(
      'Ce modèle vient d’une version plus récente de TripBrain. Mets l’application à jour.',
    )
    expect(await tooManyTemplateRequests(30).json()).toEqual({
      error: 'Trop de tentatives. Réessaie dans un instant.',
    })
  })
})
