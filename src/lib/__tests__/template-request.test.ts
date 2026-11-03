import { encode } from '@msgpack/msgpack'
import { S3ndError } from '@s3nd/core'
import { compressItinerary } from '@/lib/share'
import {
  MAX_TEMPLATE_DAYS,
  MAX_TEMPLATE_DAY_ACTIVITIES,
} from '@/lib/template-model'
import {
  RETIRED_BODY,
  TEMPLATE_MAX_BODY_BYTES,
  TEMPLATE_MAX_INFLATED_BYTES,
  TEMPLATE_MAX_PAYLOAD_CHARS,
  TEMPLATE_MAX_STRING_BYTES,
  TEMPLATE_NOT_CONFIGURED,
  openTemplateStore,
  parseTemplatePatch,
  parseTemplatePublish,
  parseTemplateUpdate,
  readJsonBody,
  templateErrorReply,
  templateErrorResponse,
} from '@/lib/template-request'
import { TemplateStoreError } from '@/lib/template-store'
import {
  activity,
  compressedBytes,
  compressedZeros,
  day,
  japanTrip,
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
        options: { includeNotes: false, includePrices: true },
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
      options: { includeNotes: true, includePrices: true },
      indexable: false,
    })
  })

  it('borne le titre à 120 caractères', () => {
    const parsed = parseTemplatePublish({
      data,
      country: 'JP',
      title: 'x'.repeat(500),
    })
    expect(parsed.ok && parsed.data.title).toHaveLength(120)
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

  it('complète des réglages partiels avec les valeurs par défaut', () => {
    const parsed = parseTemplateUpdate({
      data,
      options: { includePrices: false },
    })
    expect(parsed.ok && parsed.data.options).toEqual({
      includeNotes: false,
      includePrices: false,
    })
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
      ] as const
    ).map(
      (code) =>
        templateErrorReply(new TemplateStoreError(code), 'Échec.').status,
    )
    expect(statuses).toEqual([404, 410, 403, 409, 400, 503])
  })

  it('demande de réessayer un retrait que l’index public n’a pas suivi', () => {
    expect(
      templateErrorReply(new TemplateStoreError('index'), 'Échec.'),
    ).toEqual({
      status: 503,
      body: {
        error:
          'Le modèle n’a pas pu être retiré de la liste publique de tripbrain.fr. Réessayez.',
      },
    })
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
      parseTemplatePublish({ data, country: 'JP', indexable: 1 }),
      parseTemplatePublish({
        data: await compressItinerary([]),
        country: 'JP',
      }),
      parseTemplatePublish({ data: compressedZeros(4_000_000), country: 'JP' }),
      parseTemplatePatch({}),
    ]
    for (const result of rejected) {
      if (!result.ok) messages.push(result.error)
    }
    expect(messages.length).toBeGreaterThan(15)
    for (const message of messages) {
      expect(message.toLowerCase()).not.toMatch(/code|expir/)
    }
  })
})
