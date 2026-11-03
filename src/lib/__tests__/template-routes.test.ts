import { compressItinerary } from '@/lib/share'
import { getTemplateStore } from '@/lib/template-bucket'
import {
  TEMPLATE_INDEX_KEY,
  templateMetaKey,
  templateVersionKey,
} from '@/lib/template-store'
import { POST } from '@/app/api/templates/route'
import {
  DELETE,
  GET as getTemplate,
  PATCH,
  PUT,
} from '@/app/api/templates/[id]/route'
import { GET as getVersion } from '@/app/api/templates/[id]/v/[n]/route'
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

const PUBLIC_CACHE = 'public, s-maxage=60, stale-while-revalidate=300'
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

function readVersion(id: string, n: string) {
  return getVersion(
    new Request(`http://localhost/api/templates/${id}/v/${n}`),
    { params: Promise.resolve({ id, n }) },
  )
}

async function indexIds(): Promise<string[]> {
  const response = await getIndex()
  const body = await response.json()
  return body.entries.map((entry: { id: string }) => entry.id)
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

    // Lecture publique, en cache CDN
    const got = await read(id)
    expect(got.status).toBe(200)
    expect(got.headers.get('Cache-Control')).toBe(PUBLIC_CACHE)
    const gotBody = await got.json()
    expect(gotBody.template).toEqual(published.template)
    expect(JSON.stringify(gotBody)).not.toContain(token)

    const bySlug = await readBySlug(slug)
    expect(bySlug.status).toBe(200)
    expect(bySlug.headers.get('Cache-Control')).toBe(LISTING_CACHE)
    expect((await bySlug.json()).template.id).toBe(id)
    expect(await indexIds()).toEqual([id])

    // Mise à jour : version 2, la version 1 reste lisible
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
      slug,
      title: 'Japon en trois jours',
    })

    const v1 = await readVersion(id, '1')
    expect(v1.status).toBe(200)
    const v1Body = await v1.json()
    expect(v1Body.version).toBe(1)
    expect(v1Body.itinerary).toHaveLength(3)
    expect(Object.keys(v1Body).sort()).toEqual(['itinerary', 'version'])
    expect((await (await readVersion(id, '2')).json()).itinerary).toHaveLength(
      2,
    )
    expect((await readVersion(id, '3')).status).toBe(404)

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
    expect(gone.headers.get('Cache-Control')).toBe(PUBLIC_CACHE)
    expect(await gone.json()).toMatchObject({ status: 'retired' })
    // Masqué avant d'être retiré : il n'avait plus de page, il n'en a
    // toujours pas. Un 410 dirait qu'il a existé.
    const goneBySlug = await readBySlug(slug)
    expect(goneBySlug.status).toBe(404)
    expect((await readVersion(id, '1')).status).toBe(410)
  })

  it('répond 410 par son slug pour un modèle retiré alors qu’il était listé', async () => {
    const { template, ownerToken } = await publish()
    expect((await retire(template.id, ownerToken)).status).toBe(200)
    const gone = await readBySlug(template.slug)
    expect(gone.status).toBe(410)
    expect(gone.headers.get('Cache-Control')).toBe(LISTING_CACHE)
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
    const response = await getIndex()
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
    expect((await readVersion('0123456789abcdef', '0')).status).toBe(404)
    expect((await readVersion('0123456789abcdef', '1.5')).status).toBe(404)
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
    const response = await getIndex()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ entries: [] })
    expect(bucket.peek(TEMPLATE_INDEX_KEY)).toBeUndefined()
  })

  it('répond 500 sans cache sur un index illisible, au lieu d’une liste vide', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    bucket.poke(TEMPLATE_INDEX_KEY, { notEntries: true })
    const response = await getIndex()
    expect(response.status).toBe(500)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({
      error: 'Lecture des modèles impossible. Réessayez.',
    })
    logged.mockRestore()
  })
})

describe('retrait et index public', () => {
  it('répond 503 sans cache quand l’index n’a pas suivi, et le retrait rejoué aboutit', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { template, ownerToken } = await publish()
    bucket.beforePut = (key) => {
      if (key === TEMPLATE_INDEX_KEY) throw new Error('R2 indisponible')
    }

    const failed = await retire(template.id, ownerToken)
    expect(failed.status).toBe(503)
    expect(failed.headers.get('Cache-Control')).toBe('no-store')
    expect((await failed.json()).error).toMatch(/Réessayez/)
    expect(await indexIds()).toEqual([template.id])

    bucket.beforePut = null
    const retried = await retire(template.id, ownerToken)
    expect(retried.status).toBe(200)
    expect(await indexIds()).toEqual([])
    logged.mockRestore()
  })
})
