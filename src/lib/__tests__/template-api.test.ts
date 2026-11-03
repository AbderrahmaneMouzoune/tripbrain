import type { DayItinerary } from '@/lib/itinerary-data'
import { decompressItinerary } from '@/lib/share'
import {
  TemplateForbiddenError,
  TemplateInvalidError,
  TemplateNotFoundError,
  TemplateRetiredError,
  TemplateTooLargeError,
  TemplateUnavailableError,
  createOwnerTokenForClient,
  fetchTemplate,
  isPublicTemplate,
  patchTemplate,
  publishTemplate,
  retireTemplate,
  templateFailureReason,
  templateTakeFailureReason,
  updateTemplate,
  type TemplatePublishInput,
} from '@/lib/template-api'
import type { PublicTemplate } from '@/lib/template-model'
import { isOwnerToken } from '@/lib/template-token'
import { POST } from '@/app/api/templates/route'
import {
  DELETE,
  GET as getTemplate,
  PATCH,
  PUT,
} from '@/app/api/templates/[id]/route'
import { memoryTemplateBucket } from './helpers/memory-template-bucket'
import { japanTrip, transport } from './helpers/template-fixtures'

// Pour le parcours complet, `fetch` est branché sur les vraies routes, qui
// parlent à un faux bucket en mémoire.
vi.mock('@/lib/template-bucket', async () => {
  const { memoryTemplateBucket } =
    await import('./helpers/memory-template-bucket')
  return { getTemplateStore: () => memoryTemplateBucket }
})

const bucket = memoryTemplateBucket

const ID = '0123456789abcdef'
const TOKEN = 'T'.repeat(43)

const INPUT: TemplatePublishInput = {
  title: 'Japon en trois jours',
  authorName: 'Yanis',
  country: 'JP',
  options: { includeNotes: false, includePrices: true },
  indexable: true,
}

function template(overrides: Partial<PublicTemplate> = {}): PublicTemplate {
  return {
    id: ID,
    slug: 'japon-3-jours-tokyo-kyoto',
    version: 1,
    title: 'Japon en trois jours',
    authorName: 'Yanis',
    country: 'JP',
    indexable: true,
    includesNotes: false,
    includesPrices: true,
    dayCount: 3,
    cities: ['Tokyo', 'Kyoto'],
    tripYear: 2026,
    publishedAt: '2026-11-03T10:00:00.000Z',
    updatedAt: '2026-11-03T10:00:00.000Z',
    listed: true,
    itinerary: japanTrip(),
    ...overrides,
  }
}

/** `fetch` qui répond toujours la même chose et garde la requête reçue. */
function respondWith(body: unknown, status = 200) {
  const mock = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  )
  vi.stubGlobal('fetch', mock)
  return mock
}

function sentRequest(mock: ReturnType<typeof respondWith>): Request {
  const [input, init] = mock.mock.calls[0]
  return new Request(new URL(String(input), 'http://localhost'), init)
}

/** Le Japon, avec un trajet chargé de tout ce qu'une carte d'embarquement porte. */
function tripWithBoardingPass(): DayItinerary[] {
  const [first, second, third] = japanTrip()
  return [
    first,
    second,
    {
      ...third,
      transport: transport({
        bookingReference: 'PNR8XK',
        seat: '12A',
        gate: 'B12',
        terminal: '2E',
        status: 'booked',
        price: 95,
        currency: 'EUR',
        notes: 'Billets dans le mail de Léa.',
      }),
    },
  ]
}

/** `fetch` du navigateur, servi par les routes de l'app. */
async function serverFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const request = new Request(new URL(String(input), 'http://localhost'), init)
  const [, , id] = new URL(request.url).pathname.split('/').filter(Boolean)
  if (!id) return POST(request)
  const context = { params: Promise.resolve({ id }) }
  switch (request.method) {
    case 'PUT':
      return PUT(request, context)
    case 'PATCH':
      return PATCH(request, context)
    case 'DELETE':
      return DELETE(request, context)
    default:
      return getTemplate(request, context)
  }
}

beforeEach(() => {
  bucket.reset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('publishTemplate', () => {
  it('envoie l’itinéraire nettoyé et compressé, sans cache', async () => {
    const fetchMock = respondWith(
      { template: template(), ownerToken: TOKEN },
      201,
    )

    const result = await publishTemplate(japanTrip(), INPUT)

    expect(result).toEqual({
      template: template(),
      ownerToken: TOKEN,
      created: true,
    })
    const request = sentRequest(fetchMock)
    expect(request.method).toBe('POST')
    expect(new URL(request.url).pathname).toBe('/api/templates')
    expect(request.cache).toBe('no-store')
    expect(request.headers.get('Authorization')).toBeNull()
    const body = await request.json()
    expect(body).toMatchObject({
      title: 'Japon en trois jours',
      authorName: 'Yanis',
      country: 'JP',
      options: { includeNotes: false, includePrices: true },
      indexable: true,
    })
    // Ce qui ne doit pas partir ne quitte pas le téléphone.
    const sent: DayItinerary[] = decompressItinerary(body.data)
    expect(sent[0].notes).toBeUndefined()
    expect(sent[0].accommodation?.bookingReference).toBeUndefined()
    expect(sent[2].transport?.seat).toBeUndefined()
    expect(sent[0].accommodation?.price).toBe(540)
  })

  it('remonte le message du serveur en cas d’échec', async () => {
    respondWith({ error: 'Pays du voyage invalide.' }, 400)
    await expect(publishTemplate(japanTrip(), INPUT)).rejects.toThrow(
      'Pays du voyage invalide.',
    )
  })

  it('refuse une réponse sans jeton ou sans modèle valide', async () => {
    respondWith({ template: template() }, 201)
    await expect(publishTemplate(japanTrip(), INPUT)).rejects.toThrow(
      'Réponse du serveur illisible.',
    )
    respondWith({ template: { id: ID }, ownerToken: TOKEN }, 201)
    await expect(publishTemplate(japanTrip(), INPUT)).rejects.toThrow(
      'Réponse du serveur illisible.',
    )
  })

  it('laisse remonter une panne réseau telle quelle', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    await expect(publishTemplate(japanTrip(), INPUT)).rejects.toBeInstanceOf(
      TypeError,
    )
  })
})

describe('publication rejouable', () => {
  it('createOwnerTokenForClient tire 32 octets de crypto.getRandomValues, en base64url de 43 caractères', () => {
    const random = vi.spyOn(crypto, 'getRandomValues')
    const tokens = Array.from({ length: 200 }, createOwnerTokenForClient)
    expect(random).toHaveBeenCalledTimes(200)
    expect(random.mock.calls[0][0]).toHaveLength(32)
    random.mockRestore()
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(isOwnerToken(token)).toBe(true)
      expect(Buffer.from(token, 'base64url')).toHaveLength(32)
    }
    expect(new Set(tokens).size).toBe(tokens.length)
  })

  it('envoie le jeton du téléphone dans Authorization, et dit si le modèle vient d’être créé', async () => {
    const token = createOwnerTokenForClient()
    const created = respondWith(
      { template: template(), ownerToken: token },
      201,
    )
    const first = await publishTemplate(japanTrip(), INPUT, {
      ownerToken: token,
    })
    expect(first).toEqual({
      template: template(),
      ownerToken: token,
      created: true,
    })
    const request = sentRequest(created)
    expect(request.headers.get('Authorization')).toBe(`Bearer ${token}`)
    expect(request.headers.get('Content-Type')).toBe('application/json')
    expect(await request.text()).not.toContain(token)

    respondWith({ template: template(), ownerToken: token }, 200)
    const again = await publishTemplate(japanTrip(), INPUT, {
      ownerToken: token,
    })
    expect(again.created).toBe(false)
  })

  it('refuse une réponse dont le jeton n’est pas celui envoyé', async () => {
    respondWith({ template: template(), ownerToken: TOKEN }, 201)
    await expect(
      publishTemplate(japanTrip(), INPUT, {
        ownerToken: createOwnerTokenForClient(),
      }),
    ).rejects.toThrow('Réponse du serveur illisible.')
  })

  it('contre les routes : une réponse perdue puis rejouée ne publie qu’un modèle', async () => {
    const token = createOwnerTokenForClient()
    let lose = true
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await serverFetch(input, init)
        if (lose) {
          // Le serveur a publié, mais la réponse n'arrive jamais (tunnel).
          lose = false
          throw new TypeError('Failed to fetch')
        }
        return response
      }),
    )

    await expect(
      publishTemplate(japanTrip(), INPUT, { ownerToken: token }),
    ).rejects.toBeInstanceOf(TypeError)
    const retried = await publishTemplate(japanTrip(), INPUT, {
      ownerToken: token,
    })

    expect(retried.created).toBe(false)
    expect(retried.ownerToken).toBe(token)
    expect(bucket.keys().filter((key) => key.endsWith('/meta'))).toEqual([
      `${retried.template.id}/meta`,
    ])
    expect((await fetchTemplate(retried.template.id)).id).toBe(
      retried.template.id,
    )
  })
})

describe('fetchTemplate', () => {
  it('lit le modèle sans cache', async () => {
    const fetchMock = respondWith({ template: template() })
    expect(await fetchTemplate(ID)).toEqual(template())
    const request = sentRequest(fetchMock)
    expect(new URL(request.url).pathname).toBe(`/api/templates/${ID}`)
    expect(request.cache).toBe('no-store')
  })

  it('distingue un modèle absent d’un modèle retiré', async () => {
    respondWith({ error: 'Ce modèle n’existe pas.' }, 404)
    await expect(fetchTemplate(ID)).rejects.toBeInstanceOf(
      TemplateNotFoundError,
    )
    respondWith({ status: 'retired', error: 'Ce modèle a été retiré.' }, 410)
    await expect(fetchTemplate(ID)).rejects.toBeInstanceOf(TemplateRetiredError)
  })

  it('ne contacte pas le serveur pour un id mal formé', async () => {
    const fetchMock = respondWith({ template: template() })
    await expect(fetchTemplate('../index')).rejects.toBeInstanceOf(
      TemplateNotFoundError,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuse un modèle sans itinéraire', async () => {
    respondWith({ template: template({ itinerary: [] }) })
    await expect(fetchTemplate(ID)).rejects.toThrow(
      'Réponse du serveur illisible.',
    )
  })
})

describe('écritures de l’auteur', () => {
  it('envoie le jeton dans l’en-tête Authorization, jamais dans l’URL ni le corps', async () => {
    const fetchMock = respondWith({ template: template({ version: 2 }) })

    await updateTemplate(ID, TOKEN, japanTrip(), {
      options: { includeNotes: true, includePrices: true },
    })

    const request = sentRequest(fetchMock)
    expect(request.method).toBe('PUT')
    expect(request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`)
    expect(request.url).not.toContain(TOKEN)
    const body = await request.text()
    expect(body).not.toContain(TOKEN)
    expect(JSON.parse(body)).not.toHaveProperty('title')
  })

  it('envoie un nouveau titre par PATCH, ou `null` pour le tirer des étapes', async () => {
    const fetchMock = respondWith({ template: template({ title: 'Japon' }) })
    await patchTemplate(ID, TOKEN, { title: 'Japon' })
    const request = sentRequest(fetchMock)
    expect(request.method).toBe('PATCH')
    expect(await request.json()).toEqual({ title: 'Japon' })

    const cleared = respondWith({ template: template() })
    await patchTemplate(ID, TOKEN, { title: null })
    expect(await sentRequest(cleared).json()).toEqual({ title: null })
  })

  it('traduit 401 et 403 en TemplateForbiddenError', async () => {
    respondWith(
      { error: 'Cet appareil n’est pas autorisé à modifier ce modèle.' },
      403,
    )
    await expect(
      patchTemplate(ID, TOKEN, { indexable: false }),
    ).rejects.toBeInstanceOf(TemplateForbiddenError)
    respondWith(
      { error: 'Cet appareil n’est pas autorisé à modifier ce modèle.' },
      401,
    )
    await expect(retireTemplate(ID, TOKEN)).rejects.toBeInstanceOf(
      TemplateForbiddenError,
    )
  })

  it('retire un modèle', async () => {
    const fetchMock = respondWith({ status: 'retired' })
    await expect(retireTemplate(ID, TOKEN)).resolves.toBeUndefined()
    expect(sentRequest(fetchMock).method).toBe('DELETE')
  })

  it('nettoie aussi une mise à jour : rien de ce que l’auteur a exclu ne quitte le téléphone', async () => {
    const fetchMock = respondWith({ template: template({ version: 2 }) })
    const options = { includeNotes: false, includePrices: false }

    await updateTemplate(ID, TOKEN, tripWithBoardingPass(), { options })

    const body = await sentRequest(fetchMock).json()
    // Les réglages partent avec : le serveur nettoie avec les mêmes.
    expect(body.options).toEqual(options)
    const sent = JSON.stringify(decompressItinerary(body.data))
    for (const key of [
      'bookingReference',
      'seat',
      'gate',
      'terminal',
      'status',
      'notes',
      'price',
      'currency',
    ]) {
      expect(sent).not.toContain(`"${key}"`)
    }
    expect(sent).not.toContain('PNR8XK')
    expect(sent).not.toContain('4021553117')
    expect(sent).not.toContain('080-3312-4471')
  })

  it('envoie les notes d’une mise à jour quand l’auteur les a incluses', async () => {
    const fetchMock = respondWith({ template: template({ version: 2 }) })

    await updateTemplate(ID, TOKEN, tripWithBoardingPass(), {
      options: { includeNotes: true, includePrices: true },
    })

    const body = await sentRequest(fetchMock).json()
    const [first, , third] = decompressItinerary(body.data)
    expect(first.notes).toContain('Kenji')
    expect(third.transport?.notes).toBe('Billets dans le mail de Léa.')
    expect(third.transport?.price).toBe(95)
    expect(third.transport?.seat).toBeUndefined()
  })
})

/** `fetch` qui répond un corps brut, comme une limite de la plateforme. */
function respondWithText(text: string, status: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(text, { status })),
  )
}

/** L'erreur que lève `run`, pour en vérifier la classe et le message. */
async function caught(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run()
  } catch (error) {
    return error
  }
  throw new Error('Aucune erreur levée.')
}

function networkDown() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }),
  )
}

describe('erreurs typées', () => {
  const publish = () => publishTemplate(japanTrip(), INPUT)

  it('traduit 413 en TemplateTooLargeError, avec le message du serveur', async () => {
    respondWith({ error: 'Itinéraire trop volumineux pour être publié.' }, 413)
    const error = await caught(publish)
    expect(error).toBeInstanceOf(TemplateTooLargeError)
    expect(error).toMatchObject({
      status: 413,
      message: 'Itinéraire trop volumineux pour être publié.',
    })
  })

  it('donne un message français à un 413 de la plateforme, sans JSON', async () => {
    respondWithText('Request Entity Too Large', 413)
    const error = await caught(publish)
    expect(error).toBeInstanceOf(TemplateTooLargeError)
    expect((error as Error).message).toBe(
      'Itinéraire trop volumineux pour être publié.',
    )
  })

  it('traduit 503, y compris l’index public qui n’a pas suivi, en TemplateUnavailableError', async () => {
    const indexMessage =
      'Le modèle n’a pas pu être retiré de la liste publique de tripbrain.fr. Réessayez.'
    respondWith({ error: indexMessage }, 503)
    const retired = await caught(() => retireTemplate(ID, TOKEN))
    expect(retired).toBeInstanceOf(TemplateUnavailableError)
    expect(retired).toMatchObject({ status: 503, message: indexMessage })

    respondWith(
      {
        error: 'La publication de modèles n’est pas configurée sur ce serveur.',
      },
      503,
    )
    const published = await caught(publish)
    expect(published).toBeInstanceOf(TemplateUnavailableError)
    expect((published as Error).message).toBe(
      'La publication de modèles n’est pas configurée sur ce serveur.',
    )
  })

  it('range aussi 429, 502 et 504 parmi les indisponibilités', async () => {
    for (const status of [429, 502, 504]) {
      respondWithText('<html>Gateway</html>', status)
      const error = await caught(() =>
        patchTemplate(ID, TOKEN, { indexable: false }),
      )
      expect(error).toBeInstanceOf(TemplateUnavailableError)
      expect(error).toMatchObject({ status })
      expect((error as Error).message).toMatch(/Réessayez/)
    }
  })

  it('traduit 400 en TemplateInvalidError, avec le message du serveur', async () => {
    respondWith({ error: 'Itinéraire illisible.' }, 400)
    const error = await caught(() =>
      updateTemplate(ID, TOKEN, japanTrip(), { options: INPUT.options }),
    )
    expect(error).toBeInstanceOf(TemplateInvalidError)
    expect((error as Error).message).toBe('Itinéraire illisible.')
  })

  it('laisse les autres échecs en Error, avec le message du serveur', async () => {
    respondWith({ error: 'Le modèle a changé entre-temps. Réessayez.' }, 409)
    const error = await caught(publish)
    expect(error).not.toBeInstanceOf(TemplateUnavailableError)
    expect((error as Error).message).toBe(
      'Le modèle a changé entre-temps. Réessayez.',
    )
  })
})

describe('templateFailureReason', () => {
  it.each([
    [413, 'too_large'],
    [503, 'unavailable'],
    [429, 'unavailable'],
    [400, 'invalid'],
    [409, 'unknown'],
    [500, 'unknown'],
    [403, 'unknown'],
  ] as const)('classe un %i en « %s »', async (status, reason) => {
    respondWith({ error: 'Message du serveur sans rapport.' }, status)
    const error = await caught(() => publishTemplate(japanTrip(), INPUT))
    expect(templateFailureReason(error)).toBe(reason)
  })

  it('classe une panne réseau en « network_error »', async () => {
    networkDown()
    const error = await caught(() => publishTemplate(japanTrip(), INPUT))
    expect(templateFailureReason(error)).toBe('network_error')
  })

  it('ne lit jamais le message : seule la classe compte', () => {
    expect(templateFailureReason(new Error('Itinéraire trop volumineux'))).toBe(
      'unknown',
    )
    expect(templateFailureReason(new TemplateTooLargeError('autre'))).toBe(
      'too_large',
    )
    expect(
      templateFailureReason(new Error('Réponse du serveur illisible.')),
    ).toBe('unknown')
    expect(templateFailureReason(null)).toBe('unknown')
  })
})

describe('templateTakeFailureReason', () => {
  it.each([
    [404, 'not_found'],
    [410, 'retired'],
    [500, 'unknown'],
    [503, 'unknown'],
  ] as const)('classe un %i en « %s »', async (status, reason) => {
    respondWith({ error: 'Message du serveur.' }, status)
    const error = await caught(() => fetchTemplate(ID))
    expect(templateTakeFailureReason(error)).toBe(reason)
  })

  it('classe une panne réseau en « network_error », une réponse illisible en « unknown »', async () => {
    networkDown()
    expect(
      templateTakeFailureReason(await caught(() => fetchTemplate(ID))),
    ).toBe('network_error')
    respondWith({ template: { id: ID } })
    expect(
      templateTakeFailureReason(await caught(() => fetchTemplate(ID))),
    ).toBe('unknown')
  })

  it('classe un id mal formé en « not_found », sans appel au serveur', async () => {
    const fetchMock = respondWith({ template: template() })
    expect(
      templateTakeFailureReason(await caught(() => fetchTemplate('../index'))),
    ).toBe('not_found')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('isPublicTemplate', () => {
  it('reconnaît un modèle complet', () => {
    expect(isPublicTemplate(template())).toBe(true)
  })

  it('refuse un modèle incomplet ou mal typé', () => {
    expect(isPublicTemplate(null)).toBe(false)
    expect(isPublicTemplate(template({ id: 'pas-un-id' }))).toBe(false)
    expect(isPublicTemplate(template({ version: 0 }))).toBe(false)
    expect(isPublicTemplate({ ...template(), listed: 'oui' })).toBe(false)
    expect(isPublicTemplate({ ...template(), cities: 'Tokyo' })).toBe(false)
  })
})

describe('parcours complet contre les routes', () => {
  it('reçoit des routes une erreur typée : 413 pour un texte démesuré, 503 quand l’index ne suit pas', async () => {
    vi.stubGlobal('fetch', vi.fn(serverFetch))
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Une note de 40 Ko passe la compression, pas la borne du serveur.
    const [first] = japanTrip()
    const tooLarge = await caught(() =>
      publishTemplate([{ ...first, notes: 'x'.repeat(40_000) }], {
        ...INPUT,
        options: { includeNotes: true, includePrices: true },
      }),
    )
    expect(tooLarge).toBeInstanceOf(TemplateTooLargeError)
    expect((tooLarge as Error).message).toBe(
      'Itinéraire trop volumineux pour être publié.',
    )
    expect(templateFailureReason(tooLarge)).toBe('too_large')

    const { template: published, ownerToken } = await publishTemplate(
      japanTrip(),
      INPUT,
    )
    bucket.beforePut = (key) => {
      if (key.startsWith('index/')) throw new Error('R2 indisponible')
    }
    const error = await caught(() => retireTemplate(published.id, ownerToken))
    expect(error).toBeInstanceOf(TemplateUnavailableError)
    expect(templateFailureReason(error)).toBe('unavailable')
    bucket.beforePut = null
    await expect(
      retireTemplate(published.id, ownerToken),
    ).resolves.toBeUndefined()
    logged.mockRestore()
  })

  it('publie, met à jour, renomme, masque puis retire', async () => {
    vi.stubGlobal('fetch', vi.fn(serverFetch))

    const { template: published, ownerToken } = await publishTemplate(
      japanTrip(),
      INPUT,
    )
    expect(published.version).toBe(1)
    expect((await fetchTemplate(published.id)).title).toBe(
      'Japon en trois jours',
    )

    const updated = await updateTemplate(
      published.id,
      ownerToken,
      japanTrip().slice(0, 2),
      {
        options: {
          includeNotes: published.includesNotes,
          includePrices: published.includesPrices,
        },
      },
    )
    expect(updated.version).toBe(2)
    expect(updated.dayCount).toBe(2)
    // Le serveur ne garde que la version publiée.
    expect(
      bucket.keys().filter((key) => key.startsWith(`${published.id}/v/`)),
    ).toEqual([`${published.id}/v/2`])

    const renamed = await patchTemplate(published.id, ownerToken, {
      title: 'Le Japon, version courte',
    })
    expect(renamed).toMatchObject({
      title: 'Le Japon, version courte',
      version: 2,
    })

    const hidden = await patchTemplate(published.id, ownerToken, {
      indexable: false,
      authorName: null,
    })
    expect(hidden.listed).toBe(false)
    expect(hidden.authorName).toBeNull()

    await expect(
      patchTemplate(published.id, 'x'.repeat(43), { indexable: true }),
    ).rejects.toBeInstanceOf(TemplateForbiddenError)

    await retireTemplate(published.id, ownerToken)
    await expect(fetchTemplate(published.id)).rejects.toBeInstanceOf(
      TemplateRetiredError,
    )
    // Retirer deux fois ne fait pas d'erreur.
    await expect(
      retireTemplate(published.id, ownerToken),
    ).resolves.toBeUndefined()
  })
})
