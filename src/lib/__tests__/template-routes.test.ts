import { compressItinerary } from '@/lib/share'
import { getTemplateStore } from '@/lib/template-bucket'
import {
  TEMPLATE_INDEX_KEYS,
  isTemplateIndexKey,
  templateMetaKey,
  templateVersionKey,
} from '@/lib/template-store'
import { createOwnerToken } from '@/lib/template-token'
import { POST } from '@/app/api/templates/route'
import {
  DELETE,
  GET as getTemplate,
  PATCH,
  PUT,
} from '@/app/api/templates/[id]/route'
import { GET as getBySlug } from '@/app/api/templates/by-slug/[slug]/route'
import { GET as getIndex } from '@/app/api/templates/index/route'
import type { DayItinerary } from '@/lib/itinerary-data'
import { memoryTemplateBucket } from './helpers/memory-template-bucket'
import {
  compressedZeros,
  day,
  japanTrip,
  lisbonDay,
} from './helpers/template-fixtures'

// Les routes parlent à un faux bucket en mémoire au lieu de R2.
vi.mock('@/lib/template-bucket', async () => {
  const { memoryTemplateBucket } =
    await import('./helpers/memory-template-bucket')
  return { getTemplateStore: vi.fn(() => memoryTemplateBucket) }
})

const bucket = memoryTemplateBucket

const LISTING_CACHE = 'public, s-maxage=300, stale-while-revalidate=300'

// Chaque requête vient d'une IP différente : les limiteurs des routes vivent
// le temps du fichier, ils ne doivent pas se déclencher par accident.
let clients = 0
function clientIp(): string {
  clients += 1
  return `203.0.113.${clients}`
}

function jsonRequest(
  url: string,
  method: string,
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(`http://localhost${url}`, {
    method,
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': clientIp(),
      ...headers,
    },
  })
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

function idContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

function retire(id: string, token: string) {
  return DELETE(
    new Request(`http://localhost/api/templates/${id}`, {
      method: 'DELETE',
      headers: { ...bearer(token), 'X-Forwarded-For': clientIp() },
    }),
    idContext(id),
  )
}

async function publishBody(
  itinerary: DayItinerary[] = japanTrip(),
  extra: Record<string, unknown> = {},
) {
  return {
    data: await compressItinerary(itinerary),
    country: 'JP',
    title: 'Japon en trois jours',
    authorName: 'Yanis',
    ...extra,
  }
}

async function publish(
  itinerary?: DayItinerary[],
  extra?: Record<string, unknown>,
) {
  const response = await POST(
    jsonRequest('/api/templates', 'POST', await publishBody(itinerary, extra)),
  )
  expect(response.status).toBe(201)
  const body = await response.json()
  return { template: body.template, ownerToken: String(body.ownerToken) }
}

function read(id: string) {
  return getTemplate(
    new Request(`http://localhost/api/templates/${id}`),
    idContext(id),
  )
}

function readBySlug(slug: string) {
  return getBySlug(
    new Request(`http://localhost/api/templates/by-slug/${slug}`),
    { params: Promise.resolve({ slug }) },
  )
}

/** `GET /api/templates/index`, avec sa requête (`?page=1`) au besoin. */
function readIndex(query = '') {
  return getIndex(new Request(`http://localhost/api/templates/index${query}`))
}

async function indexIds(): Promise<string[]> {
  const response = await readIndex()
  const body = await response.json()
  return body.entries.map((entry: { id: string }) => entry.id)
}

function versionKeysOf(id: string): string[] {
  return bucket.keys().filter((key) => key.startsWith(`${id}/v/`))
}

beforeEach(() => {
  bucket.reset()
  vi.mocked(getTemplateStore).mockClear()
})

describe('cycle de vie d’un modèle', () => {
  it('publie, lit, met à jour, masque puis retire', async () => {
    // Publication
    const response = await POST(
      jsonRequest('/api/templates', 'POST', await publishBody()),
    )
    expect(response.status).toBe(201)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    const published = await response.json()
    const { id, slug } = published.template
    const token: string = published.ownerToken
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(published.template).toMatchObject({
      version: 1,
      slug: 'japon-3-jours-tokyo-kyoto',
      title: 'Japon en trois jours',
      authorName: 'Yanis',
      country: 'JP',
      listed: true,
      dayCount: 3,
    })
    expect(published.template).not.toHaveProperty('ownerTokenHash')
    expect(published.template).not.toHaveProperty('retiredAt')
    // Nettoyé par le serveur même si le téléphone ne l'a pas fait.
    expect(published.template.itinerary[0].notes).toBeUndefined()
    expect(
      published.template.itinerary[2].transport.bookingReference,
    ).toBeUndefined()

    // Lecture publique, jamais en cache : c'est ce que l'app reprend
    const got = await read(id)
    expect(got.status).toBe(200)
    expect(got.headers.get('Cache-Control')).toBe('no-store')
    const gotBody = await got.json()
    expect(gotBody.template).toEqual(published.template)
    expect(JSON.stringify(gotBody)).not.toContain(token)

    const bySlug = await readBySlug(slug)
    expect(bySlug.status).toBe(200)
    expect(bySlug.headers.get('Cache-Control')).toBe(LISTING_CACHE)
    expect((await bySlug.json()).template.id).toBe(id)
    expect(await indexIds()).toEqual([id])

    // Mise à jour : version 2, la version 1 supprimée, et un slug à 2 jours
    const updated = await PUT(
      jsonRequest(
        `/api/templates/${id}`,
        'PUT',
        { data: await compressItinerary(japanTrip().slice(0, 2)) },
        bearer(token),
      ),
      idContext(id),
    )
    expect(updated.status).toBe(200)
    const updatedBody = await updated.json()
    expect(updatedBody.template).toMatchObject({
      version: 2,
      dayCount: 2,
      slug: 'japon-2-jours-tokyo',
      title: 'Japon en trois jours',
    })
    expect(versionKeysOf(id)).toEqual([templateVersionKey(id, 2)])
    // L'ancien slug mène au modèle, avec son slug actuel.
    const oldSlug = await readBySlug(slug)
    expect(oldSlug.status).toBe(200)
    expect((await oldSlug.json()).template.slug).toBe('japon-2-jours-tokyo')

    // Masqué : plus de page tripbrain.fr, toujours joignable par son id
    const patched = await PATCH(
      jsonRequest(
        `/api/templates/${id}`,
        'PATCH',
        { indexable: false },
        bearer(token),
      ),
      idContext(id),
    )
    expect(patched.status).toBe(200)
    expect((await patched.json()).template).toMatchObject({
      indexable: false,
      listed: false,
      version: 2,
    })
    expect((await readBySlug(slug)).status).toBe(404)
    expect((await readBySlug('japon-2-jours-tokyo')).status).toBe(404)
    expect(await indexIds()).toEqual([])
    expect((await read(id)).status).toBe(200)

    // Retrait
    const retired = await DELETE(
      new Request(`http://localhost/api/templates/${id}`, {
        method: 'DELETE',
        headers: { ...bearer(token), 'X-Forwarded-For': clientIp() },
      }),
      idContext(id),
    )
    expect(retired.status).toBe(200)
    expect(await retired.json()).toEqual({ status: 'retired' })

    const gone = await read(id)
    expect(gone.status).toBe(410)
    expect(gone.headers.get('Cache-Control')).toBe('no-store')
    expect(await gone.json()).toMatchObject({ status: 'retired' })
    // Masqué avant d'être retiré : il n'avait plus de page, il n'en a
    // toujours pas. Un 410 dirait qu'il a existé.
    const goneBySlug = await readBySlug(slug)
    expect(goneBySlug.status).toBe(404)
    expect(versionKeysOf(id)).toEqual([])
  })

  it('répond 410 par son slug pour un modèle retiré alors qu’il était listé', async () => {
    const { template, ownerToken } = await publish()
    expect((await retire(template.id, ownerToken)).status).toBe(200)
    const gone = await readBySlug(template.slug)
    expect(gone.status).toBe(410)
    expect(gone.headers.get('Cache-Control')).toBe(LISTING_CACHE)
  })
})

describe('cache des lectures', () => {
  it('ne met jamais en cache le modèle lu par son id : 200, 404 et 410', async () => {
    const { template, ownerToken } = await publish()
    const statuses: [number, string | null][] = []
    for (const response of [
      await read(template.id),
      await read('0123456789abcdef'),
    ]) {
      statuses.push([response.status, response.headers.get('Cache-Control')])
    }
    await retire(template.id, ownerToken)
    const gone = await read(template.id)
    statuses.push([gone.status, gone.headers.get('Cache-Control')])
    expect(statuses).toEqual([
      [200, 'no-store'],
      [404, 'no-store'],
      [410, 'no-store'],
    ])
  })

  it('répond par un ancien slug comme par l’actuel : 200 en cache, puis 410 sur les deux', async () => {
    const { template, ownerToken } = await publish()
    const updated = await PUT(
      jsonRequest(
        `/api/templates/${template.id}`,
        'PUT',
        { data: await compressItinerary([...japanTrip(), day(4)]) },
        bearer(ownerToken),
      ),
      idContext(template.id),
    )
    const current = (await updated.json()).template.slug
    expect(current).toBe('japon-4-jours-tokyo-kyoto')

    const old = await readBySlug(template.slug)
    expect(old.status).toBe(200)
    expect(old.headers.get('Cache-Control')).toBe(LISTING_CACHE)
    expect((await old.json()).template).toMatchObject({
      id: template.id,
      slug: current,
    })

    await retire(template.id, ownerToken)
    for (const slug of [template.slug, current]) {
      const gone = await readBySlug(slug)
      expect(gone.status).toBe(410)
      expect(gone.headers.get('Cache-Control')).toBe(LISTING_CACHE)
    }
    // Les deux slugs ne restent dans le bucket que sous leur empreinte.
    const everything = JSON.stringify(
      bucket.keys().map((key) => [key, bucket.peek(key)]),
    )
    for (const slug of [template.slug, current]) {
      expect(everything).not.toContain(slug)
    }
  })
})

describe('hébergements privés', () => {
  const KEY = 'cheztantelurdes'
  const ADDRESS = '12 rue des Lilas, 3e étage'

  function familyTrip(): DayItinerary[] {
    const stay = {
      id: 'acc-tante',
      name: 'Chez Tante Lurdes',
      address: ADDRESS,
      bookingUrl: '',
      checkIn: '2026-04-01',
      checkOut: '2026-04-03',
    }
    const trip = japanTrip()
    trip[0] = { ...trip[0], accommodation: stay }
    trip[1] = { ...trip[1], accommodation: { ...stay } }
    return trip
  }

  function put(id: string, body: unknown, token: string) {
    return PUT(
      jsonRequest(`/api/templates/${id}`, 'PUT', body, bearer(token)),
      idContext(id),
    )
  }

  it('une mise à jour sans la liste masque encore les mêmes ; une liste mal formée répond 400', async () => {
    const { template, ownerToken } = await publish(familyTrip(), {
      options: { privateStays: [KEY] },
    })
    expect(template).not.toHaveProperty('privateStays')
    expect(template.itinerary[0].accommodation.address).toBe('')

    const updated = await put(
      template.id,
      {
        data: await compressItinerary(familyTrip()),
        options: { includeNotes: true },
      },
      ownerToken,
    )
    const text = await updated.text()
    expect(updated.status, text).toBe(200)
    expect(text).not.toContain('Lilas')
    expect(text).not.toContain('privateStays')

    const refused = await put(
      template.id,
      {
        data: await compressItinerary(familyTrip()),
        options: { privateStays: 'cheztantelurdes' },
      },
      ownerToken,
    )
    expect(refused.status).toBe(400)
    expect(await refused.json()).toEqual({
      error: 'Hébergements privés invalides.',
    })
    expect(versionKeysOf(template.id)).toEqual([`${template.id}/v/2`])
  })
})

describe('autorisation des écritures', () => {
  it('répond 401 sans jeton ou avec un en-tête mal formé', async () => {
    const { template } = await publish()
    const missing = await PATCH(
      jsonRequest(`/api/templates/${template.id}`, 'PATCH', {
        indexable: false,
      }),
      idContext(template.id),
    )
    expect(missing.status).toBe(401)
    const malformed = await PUT(
      jsonRequest(`/api/templates/${template.id}`, 'PUT', await publishBody(), {
        Authorization: 'Bearer 1234',
      }),
      idContext(template.id),
    )
    expect(malformed.status).toBe(401)
    expect((await read(template.id)).status).toBe(200)
  })

  it('vérifie le jeton avant de décompresser le corps d’une mise à jour', async () => {
    const { template, ownerToken } = await publish()
    const bomb = { data: compressedZeros(64 * 1024 * 1024) }

    // Un jeton bien formé mais faux : refusé avant toute décompression,
    // sinon la réponse serait un 413.
    const forged = await PUT(
      jsonRequest(
        `/api/templates/${template.id}`,
        'PUT',
        bomb,
        bearer('x'.repeat(43)),
      ),
      idContext(template.id),
    )
    expect(forged.status).toBe(403)

    // Avec le bon jeton, la même bombe est refusée par la borne.
    const owned = await PUT(
      jsonRequest(
        `/api/templates/${template.id}`,
        'PUT',
        bomb,
        bearer(ownerToken),
      ),
      idContext(template.id),
    )
    expect(owned.status).toBe(413)
    expect(bucket.peek(templateVersionKey(template.id, 2))).toBeUndefined()
  })

  it('répond 403 avec le jeton d’un autre modèle, sans rien modifier', async () => {
    const { template } = await publish()
    const other = await publish()

    const forbidden = await DELETE(
      new Request(`http://localhost/api/templates/${template.id}`, {
        method: 'DELETE',
        headers: { ...bearer(other.ownerToken), 'X-Forwarded-For': clientIp() },
      }),
      idContext(template.id),
    )

    expect(forbidden.status).toBe(403)
    const body = await forbidden.json()
    expect(Object.keys(body)).toEqual(['error'])
    expect((await read(template.id)).status).toBe(200)
  })

  it('répond 404 pour un modèle inconnu, 410 pour un modèle retiré', async () => {
    const { template, ownerToken } = await publish()
    const unknown = await PATCH(
      jsonRequest(
        '/api/templates/0123456789abcdef',
        'PATCH',
        { indexable: false },
        bearer(ownerToken),
      ),
      idContext('0123456789abcdef'),
    )
    expect(unknown.status).toBe(404)

    await DELETE(
      new Request(`http://localhost/api/templates/${template.id}`, {
        method: 'DELETE',
        headers: { ...bearer(ownerToken), 'X-Forwarded-For': clientIp() },
      }),
      idContext(template.id),
    )
    const late = await PUT(
      jsonRequest(
        `/api/templates/${template.id}`,
        'PUT',
        await publishBody(),
        bearer(ownerToken),
      ),
      idContext(template.id),
    )
    expect(late.status).toBe(410)
    expect(await late.json()).toMatchObject({ status: 'retired' })
  })
})

describe('validation des publications', () => {
  it('refuse un pays invalide', async () => {
    const response = await POST(
      jsonRequest(
        '/api/templates',
        'POST',
        await publishBody(japanTrip(), { country: 'XX' }),
      ),
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Pays du voyage invalide.' })
    expect(bucket.keys()).toEqual([])
  })

  it('refuse un itinéraire de plus de 2 Mo avec un 413', async () => {
    const response = await POST(
      jsonRequest('/api/templates', 'POST', {
        data: 'a'.repeat(2 * 1024 * 1024 + 1),
        country: 'JP',
      }),
    )
    expect(response.status).toBe(413)
  })

  it('refuse une bombe de décompression avec un 413, sans rien écrire', async () => {
    const response = await POST(
      jsonRequest('/api/templates', 'POST', {
        data: compressedZeros(64 * 1024 * 1024),
        country: 'JP',
      }),
    )
    expect(response.status).toBe(413)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(bucket.keys()).toEqual([])
  })

  it('traduit en 413 un snapshot refusé par la limite du bucket', async () => {
    bucket.maxSize = 200
    const response = await POST(
      jsonRequest('/api/templates', 'POST', await publishBody()),
    )
    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({
      error: 'Itinéraire trop volumineux pour être publié.',
    })
  })

  it('refuse un corps illisible', async () => {
    const response = await POST(
      new Request('http://localhost/api/templates', {
        method: 'POST',
        body: 'pas du json',
        headers: { 'X-Forwarded-For': clientIp() },
      }),
    )
    expect(response.status).toBe(400)
  })

  it('limite les publications à 10 par minute et par IP', async () => {
    const body = await publishBody()
    const statuses: number[] = []
    for (let i = 0; i < 11; i++) {
      const response = await POST(
        jsonRequest('/api/templates', 'POST', body, {
          'X-Forwarded-For': '198.51.100.7',
        }),
      )
      statuses.push(response.status)
    }
    expect(statuses.slice(0, 10).every((status) => status === 201)).toBe(true)
    expect(statuses[10]).toBe(429)
  })

  it('répond 503 quand R2 n’est pas configuré', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getTemplateStore).mockImplementationOnce(() => {
      throw new Error('Variable d’environnement manquante : R2_BUCKET_NAME')
    })
    const response = await POST(
      jsonRequest('/api/templates', 'POST', await publishBody()),
    )
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: 'La publication de modèles n’est pas configurée sur ce serveur.',
    })
    logged.mockRestore()
  })
})

describe('forme des valeurs', () => {
  it('publie un itinéraire forgé en retirant les valeurs mal typées', async () => {
    const forged = [
      {
        ...day(1),
        activities: [
          { id: 'act-objet', name: { fr: 'Temple' }, type: 'visit' },
          {
            id: 'act-ok',
            name: 'Temple Senso-ji',
            type: 'visit',
            price: 'gratuit',
          },
        ],
        images: [{ url: 'javascript:alert(1)', caption: 'piège' }],
      },
      day(2, { city: 'Kyoto' }),
    ] as unknown as DayItinerary[]

    const { template } = await publish(forged)

    expect(template.itinerary[0].activities).toEqual([
      { id: 'act-ok', name: 'Temple Senso-ji', type: 'visit' },
    ])
    expect(template.itinerary[0]).not.toHaveProperty('images')
    const stored = JSON.stringify(
      bucket.peek(templateVersionKey(template.id, 1)),
    )
    expect(stored).not.toContain('javascript:')
    expect(stored).not.toContain('act-objet')
  })

  it('refuse en 400 une journée aux coordonnées en texte, sans rien écrire', async () => {
    const forged = [
      { ...day(1), coordinates: ['35.6', '139.6'] },
    ] as unknown as DayItinerary[]
    const response = await POST(
      jsonRequest('/api/templates', 'POST', await publishBody(forged)),
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Itinéraire illisible.' })
    expect(bucket.keys()).toEqual([])
  })

  it('ne change jamais le pays d’une mise à jour, et tire le slug du contenu, même s’ils sont envoyés', async () => {
    const { template, ownerToken } = await publish()
    const response = await PUT(
      jsonRequest(
        `/api/templates/${template.id}`,
        'PUT',
        {
          data: await compressItinerary([
            day(1, { city: 'Lisbonne' }),
            day(2, { city: 'Porto' }),
          ]),
          country: 'PT',
          slug: 'portugal-2-jours-lisbonne-porto',
        },
        bearer(ownerToken),
      ),
      idContext(template.id),
    )
    expect(response.status).toBe(200)
    expect((await response.json()).template).toMatchObject({
      slug: 'japon-2-jours-lisbonne-porto',
      country: 'JP',
      cities: ['Lisbonne', 'Porto'],
      dayCount: 2,
    })
    expect((await readBySlug('portugal-2-jours-lisbonne-porto')).status).toBe(
      404,
    )
  })
})

describe('visibilité', () => {
  it('garde hors de l’index et du slug un modèle d’une journée, même visible', async () => {
    const { template } = await publish(lisbonDay(), {
      country: 'PT',
      indexable: true,
    })
    expect(template.listed).toBe(false)
    expect(await indexIds()).toEqual([])
    expect((await readBySlug(template.slug)).status).toBe(404)
    expect((await read(template.id)).status).toBe(200)
  })

  it('liste un modèle visible de deux jours', async () => {
    const { template } = await publish([day(1), day(2, { city: 'Kyoto' })])
    expect(template.listed).toBe(true)
    const response = await readIndex()
    expect(response.headers.get('Cache-Control')).toBe(LISTING_CACHE)
    expect((await response.json()).entries).toEqual([
      {
        id: template.id,
        slug: 'japon-2-jours-tokyo-kyoto',
        title: 'Japon en trois jours',
        country: 'JP',
        dayCount: 2,
        cities: ['Tokyo', 'Kyoto'],
        updatedAt: template.updatedAt,
      },
    ])
  })
})

describe('lectures publiques', () => {
  it('répond 404 sans toucher au bucket pour un id ou un slug mal formé', async () => {
    expect((await read('INDEX')).status).toBe(404)
    expect((await readBySlug('japon')).status).toBe(404)
    expect(getTemplateStore).not.toHaveBeenCalled()
  })

  it('répond 404 pour un modèle inconnu, sans cache', async () => {
    const response = await read('0123456789abcdef')
    expect(response.status).toBe(404)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('répond 409 pour un modèle écrit par une version plus récente', async () => {
    const { template } = await publish()
    bucket.poke(
      templateMetaKey(template.id),
      bucket.peek(templateMetaKey(template.id)),
      { version: 99 },
    )
    const response = await read(template.id)
    expect(response.status).toBe(409)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('renvoie un index vide tant que rien n’est publié', async () => {
    const response = await readIndex()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ entries: [], nextPage: null })
    expect(bucket.keys()).toEqual([])
  })

  it('répond 500 sans cache sur un index illisible, au lieu d’une liste vide', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    bucket.poke(TEMPLATE_INDEX_KEYS[3], { notEntries: true })
    const response = await readIndex()
    expect(response.status).toBe(500)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({
      error: 'Lecture des modèles impossible. Réessaie.',
    })
    logged.mockRestore()
  })
})

describe('retrait et index public', () => {
  it('répond 410 à un PATCH qui croise un retrait, jamais 500', async () => {
    const { template, ownerToken } = await publish()
    const realGet = bucket.getSnapshot.bind(bucket)
    let raced = false
    // Le retrait aboutit au moment où le PATCH relit la version publiée.
    const spy = vi
      .spyOn(bucket, 'getSnapshot')
      .mockImplementation(async (key, options) => {
        if (!raced && key === templateVersionKey(template.id, 1)) {
          raced = true
          expect((await retire(template.id, ownerToken)).status).toBe(200)
        }
        return realGet(key, options)
      })

    const response = await PATCH(
      jsonRequest(
        `/api/templates/${template.id}`,
        'PATCH',
        { indexable: false },
        bearer(ownerToken),
      ),
      idContext(template.id),
    )
    spy.mockRestore()

    expect(raced).toBe(true)
    expect(response.status).toBe(410)
    expect(await response.json()).toMatchObject({ status: 'retired' })
  })

  it('répond 503 sans cache quand l’index n’a pas suivi, et le retrait rejoué aboutit', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { template, ownerToken } = await publish()
    bucket.beforePut = (key) => {
      if (isTemplateIndexKey(key)) throw new Error('R2 indisponible')
    }

    const failed = await retire(template.id, ownerToken)
    expect(failed.status).toBe(503)
    expect(failed.headers.get('Cache-Control')).toBe('no-store')
    expect((await failed.json()).error).toMatch(/Réessaie/)
    expect(await indexIds()).toEqual([template.id])

    bucket.beforePut = null
    const retried = await retire(template.id, ownerToken)
    expect(retried.status).toBe(200)
    expect(await indexIds()).toEqual([])
    logged.mockRestore()
  })

  it('répond 503 quand le contenu n’a pas été effacé, et le retrait rejoué l’efface', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { template, ownerToken } = await publish()
    const versionKeys = () =>
      bucket.keys().filter((key) => key.startsWith(`${template.id}/v/`))
    bucket.beforeDelete = () => {
      throw new Error('R2 indisponible')
    }

    const failed = await retire(template.id, ownerToken)
    expect(failed.status).toBe(503)
    expect(failed.headers.get('Cache-Control')).toBe('no-store')
    expect(await failed.json()).toEqual({
      error:
        'Le modèle est retiré, mais son contenu n’a pas pu être effacé. Réessaie.',
    })
    expect((await read(template.id)).status).toBe(410)
    expect(await indexIds()).toEqual([])
    expect(versionKeys()).toEqual([templateVersionKey(template.id, 1)])

    bucket.beforeDelete = null
    const retried = await retire(template.id, ownerToken)
    expect(retried.status).toBe(200)
    expect(versionKeys()).toEqual([])
    logged.mockRestore()
  })
})

describe('publication rejouable : jeton tiré par le téléphone', () => {
  async function publishWith(
    token: string,
    itinerary?: DayItinerary[],
  ): Promise<Response> {
    return POST(
      jsonRequest(
        '/api/templates',
        'POST',
        await publishBody(itinerary),
        bearer(token),
      ),
    )
  }

  function metaKeys(): string[] {
    return bucket.keys().filter((key) => key.endsWith('/meta'))
  }

  it('201 au premier envoi, 200 et le même modèle au second : un seul modèle', async () => {
    const token = createOwnerToken()
    const first = await publishWith(token)
    expect(first.status).toBe(201)
    expect(first.headers.get('Cache-Control')).toBe('no-store')
    const firstBody = await first.json()
    expect(firstBody.ownerToken).toBe(token)

    const second = await publishWith(token)
    expect(second.status).toBe(200)
    expect(second.headers.get('Cache-Control')).toBe('no-store')
    const secondBody = await second.json()
    expect(secondBody).toEqual(firstBody)
    expect(metaKeys()).toEqual([templateMetaKey(firstBody.template.id)])
    expect(await indexIds()).toEqual([firstBody.template.id])
  })

  it('réponse perdue : l’envoi rejoué termine la publication interrompue, sans doublon', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const token = createOwnerToken()
    // La connexion tombe pendant l'écriture de la méta : le téléphone ne
    // reçoit qu'une erreur.
    let failMeta = true
    bucket.beforePut = (key) => {
      if (failMeta && key.endsWith('/meta')) {
        failMeta = false
        throw new Error('ECONNRESET')
      }
    }
    const lost = await publishWith(token)
    expect(lost.status).toBe(500)
    expect(metaKeys()).toEqual([])

    const retried = await publishWith(token)
    expect(retried.status).toBe(201)
    const { template, ownerToken } = await retried.json()
    expect(ownerToken).toBe(token)
    expect(template.slug).toBe('japon-3-jours-tokyo-kyoto')
    expect((await read(template.id)).status).toBe(200)

    const again = await publishWith(token)
    expect(again.status).toBe(200)
    expect(metaKeys()).toEqual([templateMetaKey(template.id)])
    expect(versionKeysOf(template.id)).toEqual([
      templateVersionKey(template.id, template.version),
    ])
    logged.mockRestore()
  })

  it('deux jetons différents publient deux modèles', async () => {
    const a = await (await publishWith(createOwnerToken())).json()
    const b = await (await publishWith(createOwnerToken())).json()
    expect(a.template.id).not.toBe(b.template.id)
    expect(b.template.slug).toBe('japon-3-jours-tokyo-kyoto-2')
    expect(metaKeys()).toHaveLength(2)
  })

  it('répond 401 à un en-tête Authorization mal formé, sans toucher au bucket', async () => {
    for (const authorization of [
      'Bearer 1234',
      `Basic ${createOwnerToken()}`,
      `Bearer ${createOwnerToken()}x`,
      'Bearer',
      '',
    ]) {
      const response = await POST(
        jsonRequest('/api/templates', 'POST', await publishBody(), {
          Authorization: authorization,
        }),
      )
      expect(response.status, authorization).toBe(401)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(await response.json()).toEqual({
        error: 'Cet appareil n’est pas autorisé à modifier ce modèle.',
      })
    }
    expect(getTemplateStore).not.toHaveBeenCalled()
    expect(bucket.keys()).toEqual([])
  })

  it('sans en-tête, le serveur tire le jeton : chaque envoi publie un modèle', async () => {
    const a = await publish()
    const b = await publish()
    expect(a.ownerToken).not.toBe(b.ownerToken)
    expect(a.template.id).not.toBe(b.template.id)
  })
})

describe('PATCH du titre', () => {
  function patchTitle(id: string, token: string, title: unknown) {
    return PATCH(
      jsonRequest(`/api/templates/${id}`, 'PATCH', { title }, bearer(token)),
      idContext(id),
    )
  }

  it('renomme sans nouvelle version, et l’index suit', async () => {
    const { template, ownerToken } = await publish()
    const response = await patchTitle(
      template.id,
      ownerToken,
      '  Le Japon  en vrai ',
    )
    expect(response.status).toBe(200)
    expect((await response.json()).template).toMatchObject({
      title: 'Le Japon en vrai',
      version: 1,
      slug: template.slug,
    })
    const index = await (await readIndex()).json()
    expect(index.entries[0].title).toBe('Le Japon en vrai')
  })

  it('tire le titre des étapes s’il est vide, et refuse un titre qui n’est pas un texte', async () => {
    const { template, ownerToken } = await publish()
    const derived = await patchTitle(template.id, ownerToken, '')
    expect((await derived.json()).template.title).toBe('Tokyo et Kyoto')
    const invalid = await patchTitle(template.id, ownerToken, 42)
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual({
      error: 'Titre du modèle invalide.',
    })
  })
})

describe('mise à jour : versions précédentes', () => {
  it('répond 503 quand les versions précédentes n’ont pas été effacées, et la mise à jour rejouée les efface', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { template, ownerToken } = await publish()
    bucket.beforeDelete = () => {
      throw new Error('R2 indisponible')
    }
    const update = async () =>
      PUT(
        jsonRequest(
          `/api/templates/${template.id}`,
          'PUT',
          { data: await compressItinerary(japanTrip()) },
          bearer(ownerToken),
        ),
        idContext(template.id),
      )

    const failed = await update()
    expect(failed.status).toBe(503)
    expect(failed.headers.get('Cache-Control')).toBe('no-store')
    expect(await failed.json()).toEqual({
      error:
        'Le modèle est à jour, mais ses versions précédentes n’ont pas pu être effacées. Réessaie.',
    })
    expect((await (await read(template.id)).json()).template.version).toBe(2)

    bucket.beforeDelete = null
    const retried = await update()
    expect(retried.status).toBe(200)
    expect(versionKeysOf(template.id)).toEqual([
      templateVersionKey(template.id, 3),
    ])
    logged.mockRestore()
  })
})

describe('index par pages', () => {
  it('répond par pages : `nextPage` dit la suivante, `null` après la dernière', async () => {
    const { template } = await publish()
    const first = await readIndex('?page=0')
    expect(first.status).toBe(200)
    expect(first.headers.get('Cache-Control')).toBe(LISTING_CACHE)
    expect(await first.json()).toEqual({
      entries: [expect.objectContaining({ id: template.id })],
      nextPage: null,
    })
    const beyond = await readIndex('?page=1')
    expect(beyond.status).toBe(200)
    expect(await beyond.json()).toEqual({ entries: [], nextPage: null })
  })

  it('répond 400 sans cache à une page invalide, sans toucher au bucket', async () => {
    for (const page of ['-1', '1.5', 'abc', '01', '', '1e3', '1000000']) {
      const response = await readIndex(`?page=${page}`)
      expect(response.status, page).toBe(400)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(await response.json()).toEqual({
        error: 'Page de l’index invalide.',
      })
    }
    expect(getTemplateStore).not.toHaveBeenCalled()
  })
})
