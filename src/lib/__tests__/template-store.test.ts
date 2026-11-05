import { createHash } from 'node:crypto'
import { S3ndError, isS3ndError } from '@s3nd/core'
import type { DayItinerary } from '@/lib/itinerary-data'
import {
  createTemplateId,
  isTemplateSlug,
  templateSlug,
  type TemplateMeta,
} from '@/lib/template-model'
import {
  TEMPLATE_INDEX_FULL_ALERT,
  TEMPLATE_INDEX_KEYS,
  TEMPLATE_SCHEMA_VERSION,
  assertTemplateOwner,
  isTemplateIndexKey,
  isTemplateStoreError,
  patchTemplate,
  publishTemplate,
  readIndex,
  readIndexPage,
  readTemplate,
  readTemplateBySlug,
  readTemplateForOperator,
  resyncTemplateIndex,
  retireTemplate,
  retireTemplateAsOperator,
  templateIndexKey,
  TEMPLATE_INDEX_PAGE_SIZE,
  templateMetaKey,
  templateOwnerKey,
  templateSlugKey,
  templateVersionKey,
  updateTemplate,
  type PublishTemplateInput,
  type TemplateBucket,
  type TemplateStoreErrorCode,
} from '@/lib/template-store'
import { createOwnerToken } from '@/lib/template-token'
import { createMemoryTemplateBucket } from './helpers/memory-template-bucket'
import {
  activity,
  day,
  japanTrip,
  lisbonDay,
} from './helpers/template-fixtures'

// Les ids sont tirés au hasard ; un test de collision a besoin d'en imposer.
vi.mock('@/lib/template-model', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/template-model')>()
  return { ...actual, createTemplateId: vi.fn(actual.createTemplateId) }
})

const bucket = createMemoryTemplateBucket()

const PUBLISHED_AT = new Date('2026-11-03T10:00:00.000Z')
const LATER = new Date('2026-11-04T08:30:00.000Z')
const EVEN_LATER = new Date('2026-11-04T09:00:00.000Z')

/** Un id imposé, pour prévoir les slugs qu'il donnera. */
const FIXED_ID = 'k3x9m2abcdefghjk'

function publishInput(
  overrides: Partial<PublishTemplateInput> = {},
): PublishTemplateInput {
  return {
    itinerary: japanTrip(),
    title: 'Deux semaines au Japon',
    authorName: 'Yanis',
    country: 'JP',
    options: { includeNotes: false, includePrices: true, privateStays: [] },
    indexable: true,
    now: PUBLISHED_AT,
    ...overrides,
  }
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function storedMeta(id: string): TemplateMeta {
  return bucket.peek(templateMetaKey(id)) as TemplateMeta
}

async function storeError(
  promise: Promise<unknown>,
): Promise<TemplateStoreErrorCode> {
  try {
    await promise
  } catch (error) {
    if (isTemplateStoreError(error)) return error.code
    throw error
  }
  throw new Error('Aucune erreur levée.')
}

/**
 * La méta stockée n'est plus qu'une pierre tombale : de quoi répondre 410 et
 * autoriser un second retrait, rien d'autre — pas même le slug, qui porte le
 * pays, le nombre de jours et jusqu'à 3 villes (`japon-3-jours-tokyo-kyoto`).
 * Les recherches portent sur tout ce que l'auteur a écrit ou choisi, en
 * minuscules aussi.
 */
function expectErased(meta: TemplateMeta, wasListed = true): void {
  const raw = bucket.peek(templateMetaKey(meta.id))
  expect(raw).toEqual({
    id: meta.id,
    version: expect.any(Number),
    publishedAt: meta.publishedAt,
    retiredAt: '2026-11-04T08:30:00.000Z',
    ownerTokenHash: meta.ownerTokenHash,
    wasListed,
  })
  const json = JSON.stringify(raw).toLowerCase()
  for (const value of [
    meta.slug,
    meta.title,
    'Yanis',
    'Tokyo',
    'Kyoto',
    'Japon',
    `"${meta.country}"`,
  ]) {
    expect(json).not.toContain(value.toLowerCase())
  }
}

/**
 * Aucun de ces slugs n'est lisible dans le bucket, ni dans une clé ni dans
 * une valeur : chacun n'y reste que sous son empreinte (`slugs/<64 hex>`).
 */
function expectNoPlainSlug(...slugs: string[]): void {
  for (const key of bucket.keys()) {
    const json = JSON.stringify(bucket.peek(key))
    for (const slug of slugs) {
      expect(key).not.toContain(slug)
      expect(json).not.toContain(slug)
    }
  }
  for (const key of bucket.keys().filter((key) => key.startsWith('slugs/'))) {
    expect(key).toMatch(/^slugs\/[0-9a-f]{64}$/)
  }
}

/** Toute suppression échoue : R2 en 5xx, ou une clé refusée par DeleteObjects. */
function breakDeletes(): void {
  bucket.beforeDelete = () => {
    throw new Error('R2 indisponible')
  }
}

/** Les versions encore stockées d'un modèle : le contenu de son auteur. */
function versionKeys(id: string): string[] {
  return bucket.keys().filter((key) => key.startsWith(`${id}/v/`))
}

/**
 * Le bucket, avec une requête concurrente glissée juste avant la première
 * lecture (`get`) ou écriture (`put`) de l'index : là où, en production, une
 * autre requête sur le même modèle peut s'intercaler. La requête concurrente
 * parle au bucket directement, et va jusqu'au bout avant de rendre la main.
 */
function racing(
  moment: 'get' | 'put',
  competitor: () => Promise<unknown>,
): TemplateBucket {
  let pending: (() => Promise<unknown>) | null = competitor
  async function race(key: string): Promise<void> {
    if (!isTemplateIndexKey(key) || !pending) return
    const run = pending
    pending = null
    await run()
  }
  return {
    async getSnapshot(key, options) {
      if (moment === 'get') await race(key)
      return bucket.getSnapshot(key, options)
    },
    async putSnapshot(key, data, options) {
      if (moment === 'put') await race(key)
      return bucket.putSnapshot(key, data, options)
    },
    delete: (key) => bucket.delete(key),
  }
}

/** Toute écriture de l'index échoue, comme une panne de R2. */
function breakIndexWrites(): void {
  bucket.beforePut = (key) => {
    if (isTemplateIndexKey(key)) throw new Error('R2 indisponible')
  }
}

/** Un autre serveur réécrit ce morceau d'index : son ETag change. */
function touchIndex(key: string): void {
  bucket.poke(key, bucket.peek(key) ?? { entries: [] })
}

/** Tout l'index tel qu'il est stocké, morceaux confondus. */
function storedIndexJson(): string {
  return JSON.stringify(TEMPLATE_INDEX_KEYS.map((key) => bucket.peek(key)))
}

async function indexIds(): Promise<string[]> {
  return (await readIndex(bucket)).map((entry) => entry.id)
}

beforeEach(() => {
  bucket.reset()
  vi.mocked(createTemplateId).mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('publishTemplate', () => {
  it('écrit la version 1, le slug, la méta et l’index, et ne garde que l’empreinte du jeton', async () => {
    const { meta, template, ownerToken } = await publishTemplate(
      bucket,
      publishInput(),
    )

    expect(ownerToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(meta.ownerTokenHash).toBe(
      createHash('sha256').update(ownerToken).digest('hex'),
    )
    expect(JSON.stringify(bucket.peek(templateMetaKey(meta.id)))).not.toContain(
      ownerToken,
    )
    expect(meta).toMatchObject({
      slug: 'japon-3-jours-tokyo-kyoto',
      version: 1,
      title: 'Deux semaines au Japon',
      authorName: 'Yanis',
      country: 'JP',
      indexable: true,
      dayCount: 3,
      cities: ['Tokyo', 'Kyoto'],
      tripYear: 2026,
      publishedAt: '2026-11-03T10:00:00.000Z',
      updatedAt: '2026-11-03T10:00:00.000Z',
      retiredAt: null,
    })
    expect(bucket.keys()).toEqual(
      [
        `${meta.id}/meta`,
        `${meta.id}/v/1`,
        templateIndexKey(meta.id),
        `slugs/${sha256('japon-3-jours-tokyo-kyoto')}`,
      ].sort(),
    )
    expect(bucket.peek(templateSlugKey(meta.slug))).toEqual({ id: meta.id })
    expect(template).not.toHaveProperty('ownerTokenHash')
    expect(template).not.toHaveProperty('retiredAt')
    expect(template.listed).toBe(true)
  })

  it('écrit la version avant la méta, et la méta avant l’index', async () => {
    const { meta } = await publishTemplate(bucket, publishInput())
    const order = bucket.puts.map((put) => put.key)
    expect(order.indexOf(templateVersionKey(meta.id, 1))).toBeLessThan(
      order.indexOf(templateMetaKey(meta.id)),
    )
    expect(order.indexOf(templateMetaKey(meta.id))).toBeLessThan(
      order.indexOf(templateIndexKey(meta.id)),
    )
  })

  it('ne passe jamais d’expiration et signe chaque snapshot', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: japanTrip(),
    })
    await patchTemplate(bucket, meta.id, ownerToken, { indexable: false })
    await retireTemplate(bucket, meta.id, ownerToken)

    expect(bucket.puts.length).toBeGreaterThan(5)
    for (const { options } of bucket.puts) {
      expect(options).not.toHaveProperty('expiresIn')
      expect(options).toMatchObject({
        app: 'tripbrain',
        version: TEMPLATE_SCHEMA_VERSION,
      })
    }
  })

  it('renettoie l’itinéraire côté serveur avec les réglages choisis', async () => {
    const { template } = await publishTemplate(bucket, publishInput())
    const [first, , third] = template.itinerary

    expect(first.notes).toBeUndefined()
    expect(first.accommodation?.bookingReference).toBeUndefined()
    expect(first.accommodation?.status).toBeUndefined()
    expect(first.accommodation?.price).toBe(540)
    expect(first.activities[0].status).toBeUndefined()
    expect(third.transport?.seat).toBeUndefined()
    expect(third.transport?.notes).toBeUndefined()
    // Les ids survivent : la fusion de la V1.1 s'appuie dessus.
    expect(template.itinerary.map((d) => d.id)).toEqual([
      'day-1',
      'day-2',
      'day-3',
    ])

    const stored = bucket.peek(templateVersionKey(template.id, 1))
    expect(stored).toEqual({
      version: 1,
      title: 'Deux semaines au Japon',
      itinerary: template.itinerary,
    })
  })

  it('retire les prix et garde les notes quand l’auteur le demande', async () => {
    const { meta, template } = await publishTemplate(
      bucket,
      publishInput({
        options: { includeNotes: true, includePrices: false, privateStays: [] },
      }),
    )
    expect(meta.includesNotes).toBe(true)
    expect(meta.includesPrices).toBe(false)
    expect(template.itinerary[0].notes).toContain('Kenji')
    expect(template.itinerary[0].accommodation?.price).toBeUndefined()
    expect(template.itinerary[2].transport?.currency).toBeUndefined()
  })

  it('tire le titre des étapes quand il est vide, et borne un titre trop long', async () => {
    const derived = await publishTemplate(
      bucket,
      publishInput({ title: '   ' }),
    )
    expect(derived.meta.title).toBe('Tokyo et Kyoto')

    const long = await publishTemplate(
      bucket,
      publishInput({ title: `  ${'Japon '.repeat(40)}` }),
    )
    expect(long.meta.title.length).toBeLessThanOrEqual(120)
    expect(long.meta.title.startsWith('Japon Japon')).toBe(true)
    expect(long.meta.title.endsWith(' ')).toBe(false)
  })

  it('ne coupe jamais un emoji en deux, titre saisi, titre tiré des étapes ou prénom', async () => {
    const LONE =
      /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/
    const typed = await publishTemplate(
      bucket,
      publishInput({
        title: `${'a'.repeat(119)}😀`,
        authorName: `${'b'.repeat(39)}😀`,
      }),
    )
    expect(typed.meta).toMatchObject({
      title: 'a'.repeat(119),
      authorName: 'b'.repeat(39),
    })

    const city = `${'x'.repeat(119)}🗾`
    const derived = await publishTemplate(
      bucket,
      publishInput({
        title: '',
        itinerary: [day(1, { city }), day(2, { city })],
      }),
    )
    expect(derived.meta.title).not.toMatch(LONE)
    expect(derived.meta.title.length).toBeLessThanOrEqual(120)

    const lone = await publishTemplate(
      bucket,
      publishInput({ title: 'Porto \ud83d', authorName: '\udc00Rui' }),
    )
    expect(lone.meta).toMatchObject({
      title: 'Porto \ufffd',
      authorName: '\ufffdRui',
    })
    for (const entry of await readIndex(bucket)) {
      expect(entry.title).not.toMatch(LONE)
    }

    const updated = await updateTemplate(
      bucket,
      typed.meta.id,
      typed.ownerToken,
      { itinerary: japanTrip(), title: `${'c'.repeat(119)}🗾`, now: LATER },
    )
    expect(updated.meta.title).toBe('c'.repeat(119))
  })

  it('nettoie le prénom comme celui d’un voyage de groupe', async () => {
    const spaced = await publishTemplate(
      bucket,
      publishInput({ authorName: '  Yanis   B.  ' }),
    )
    expect(spaced.meta.authorName).toBe('Yanis B.')
    const blank = await publishTemplate(
      bucket,
      publishInput({ authorName: ' ' }),
    )
    expect(blank.meta.authorName).toBeNull()
  })

  it('refuse un pays inconnu et un itinéraire vide', async () => {
    expect(
      await storeError(
        publishTemplate(bucket, publishInput({ country: 'ZZ' })),
      ),
    ).toBe('invalid')
    expect(
      await storeError(
        publishTemplate(bucket, publishInput({ itinerary: [] })),
      ),
    ).toBe('invalid')
    expect(bucket.keys()).toEqual([])
  })

  it('suffixe un slug déjà pris, sans jamais réutiliser le premier', async () => {
    const first = await publishTemplate(bucket, publishInput())
    const second = await publishTemplate(bucket, publishInput())
    const third = await publishTemplate(bucket, publishInput())
    expect(first.meta.slug).toBe('japon-3-jours-tokyo-kyoto')
    expect(second.meta.slug).toBe('japon-3-jours-tokyo-kyoto-2')
    expect(third.meta.slug).toBe('japon-3-jours-tokyo-kyoto-3')
  })

  it('passe à un suffixe tiré de l’id après 5 slugs lisibles déjà pris', async () => {
    const slugs: string[] = []
    for (let n = 0; n < 5; n++) {
      slugs.push((await publishTemplate(bucket, publishInput())).meta.slug)
    }
    expect(slugs.at(-1)).toBe('japon-3-jours-tokyo-kyoto-5')

    vi.mocked(createTemplateId).mockReturnValueOnce(FIXED_ID)
    const sixth = await publishTemplate(bucket, publishInput())

    expect(sixth.meta.slug).toBe('japon-3-jours-tokyo-kyoto-k3x9m2')
    expect(isTemplateSlug(sixth.meta.slug)).toBe(true)
    const bySlug = await readTemplateBySlug(bucket, sixth.meta.slug)
    expect(bySlug.status === 'active' && bySlug.template.id).toBe(FIXED_ID)
  })

  it('reste publiable quand vingt modèles partagent déjà le même parcours', async () => {
    const slugs = new Set<string>()
    for (let n = 0; n < 25; n++) {
      const { meta } = await publishTemplate(
        bucket,
        publishInput({ indexable: false }),
      )
      expect(isTemplateSlug(meta.slug)).toBe(true)
      slugs.add(meta.slug)
    }
    expect(slugs.size).toBe(25)
  })

  it('prend l’id entier quand son début est déjà pris', async () => {
    const base = 'japon-3-jours-tokyo-kyoto'
    for (const slug of [base, `${base}-2`, `${base}-3`, `${base}-4`]) {
      bucket.poke(templateSlugKey(slug), { id: createTemplateId() })
    }
    bucket.poke(templateSlugKey(`${base}-5`), { id: createTemplateId() })
    bucket.poke(templateSlugKey(`${base}-k3x9m2`), { id: createTemplateId() })
    vi.mocked(createTemplateId).mockReturnValueOnce(FIXED_ID)

    const { meta } = await publishTemplate(bucket, publishInput())

    expect(meta.slug).toBe(`${base}-${FIXED_ID}`)
    expect(isTemplateSlug(meta.slug)).toBe(true)
  })

  it('renonce sans laisser de version orpheline quand même l’id entier est pris', async () => {
    const base = 'japon-3-jours-tokyo-kyoto'
    const taken = [
      base,
      `${base}-2`,
      `${base}-3`,
      `${base}-4`,
      `${base}-5`,
      `${base}-k3x9m2`,
      `${base}-${FIXED_ID}`,
    ]
    for (const slug of taken) {
      bucket.poke(templateSlugKey(slug), { id: '0123456789abcdef' })
    }
    vi.mocked(createTemplateId).mockReturnValueOnce(FIXED_ID)

    expect(await storeError(publishTemplate(bucket, publishInput()))).toBe(
      'conflict',
    )
    expect(bucket.peek(templateVersionKey(FIXED_ID, 1))).toBeUndefined()
    expect(bucket.peek(templateMetaKey(FIXED_ID))).toBeUndefined()
  })

  it('tire un autre id si le premier est déjà pris', async () => {
    const taken = await publishTemplate(bucket, publishInput())
    vi.mocked(createTemplateId).mockReturnValueOnce(taken.meta.id)

    const next = await publishTemplate(bucket, publishInput())

    expect(next.meta.id).not.toBe(taken.meta.id)
    expect(createTemplateId).toHaveBeenCalledTimes(3)
    // Le modèle déjà publié n'a pas été touché.
    expect(storedMeta(taken.meta.id).ownerTokenHash).toBe(
      taken.meta.ownerTokenHash,
    )
  })

  it('abandonne après 5 ids déjà pris', async () => {
    const taken = await publishTemplate(bucket, publishInput())
    vi.mocked(createTemplateId).mockReturnValue(taken.meta.id)
    await expect(publishTemplate(bucket, publishInput())).rejects.toThrow(
      /5 tirages/,
    )
  })

  it('borne les villes gardées dans la méta et l’index', async () => {
    const itinerary = Array.from({ length: 30 }, (_, index) =>
      day(index + 1, {
        city:
          index === 0 ? 'Llanfairpwllgwyngyll'.repeat(10) : `Ville ${index}`,
      }),
    )

    const { meta } = await publishTemplate(bucket, publishInput({ itinerary }))

    expect(meta.cities).toHaveLength(10)
    expect(meta.cities[0]).toHaveLength(80)
    const [entry] = await readIndex(bucket)
    expect(entry.cities).toEqual(meta.cities)
  })

  it('publie même si l’index ne peut pas être écrit', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    bucket.beforePut = (key) => {
      if (isTemplateIndexKey(key)) throw new Error('R2 indisponible')
    }

    const { meta } = await publishTemplate(bucket, publishInput())

    expect((await readTemplate(bucket, meta.id)).status).toBe('active')
    expect(await readIndex(bucket)).toEqual([])
    expect(logged).toHaveBeenCalled()
  })
})

describe('updateTemplate', () => {
  it('ajoute la version 2, puis supprime la version 1', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    const shorter = japanTrip().slice(0, 2)

    const updated = await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: shorter,
      now: LATER,
    })

    expect(updated.meta).toMatchObject({
      version: 2,
      title: 'Deux semaines au Japon',
      dayCount: 2,
      cities: ['Tokyo'],
      publishedAt: '2026-11-03T10:00:00.000Z',
      updatedAt: '2026-11-04T08:30:00.000Z',
    })
    expect(updated.template.itinerary).toHaveLength(2)
    // La base de fusion de la V1.1 vit sur le téléphone du repreneur : le
    // serveur ne garde que la version publiée.
    expect(versionKeys(meta.id)).toEqual([templateVersionKey(meta.id, 2)])
    const current = await readTemplate(bucket, meta.id)
    expect(current.status === 'active' && current.template.version).toBe(2)
  })

  it('garde les réglages publiés quand la mise à jour n’en donne pas', async () => {
    const { meta, ownerToken } = await publishTemplate(
      bucket,
      publishInput({
        options: {
          includeNotes: false,
          includePrices: false,
          privateStays: [],
        },
      }),
    )
    const { template } = await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: japanTrip(),
    })
    expect(template.includesPrices).toBe(false)
    expect(template.itinerary[0].accommodation?.price).toBeUndefined()
    expect(template.itinerary[0].notes).toBeUndefined()
  })

  it('remplace le titre s’il est donné, le tire des étapes s’il est vide', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    const renamed = await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: japanTrip(),
      title: '  Japon express ',
    })
    expect(renamed.meta.title).toBe('Japon express')
    const derived = await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: japanTrip(),
      title: null,
    })
    expect(derived.meta.title).toBe('Tokyo et Kyoto')
  })

  it('refuse un mauvais jeton, un modèle inconnu et un modèle retiré', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    const other = await publishTemplate(bucket, publishInput())
    const input = { itinerary: japanTrip() }

    expect(
      await storeError(
        updateTemplate(bucket, meta.id, other.ownerToken, input),
      ),
    ).toBe('forbidden')
    expect(
      await storeError(
        updateTemplate(bucket, createTemplateId(), ownerToken, input),
      ),
    ).toBe('missing')
    expect(
      await storeError(updateTemplate(bucket, 'pas-un-id', ownerToken, input)),
    ).toBe('missing')
    await retireTemplate(bucket, meta.id, ownerToken)
    expect(
      await storeError(updateTemplate(bucket, meta.id, ownerToken, input)),
    ).toBe('retired')
    expect(
      bucket.keys().filter((key) => key.startsWith(`${meta.id}/v/`)),
    ).toEqual([])
  })

  it('relit une fois si la méta a changé entre-temps, sans perdre ce changement', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    let raced = false
    bucket.beforePut = (key) => {
      if (key !== templateMetaKey(meta.id) || raced) return
      raced = true
      // Un autre appareil masque le modèle pendant la mise à jour.
      bucket.poke(key, { ...storedMeta(meta.id), indexable: false })
    }

    const updated = await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: japanTrip(),
    })

    expect(updated.meta.version).toBe(2)
    expect(updated.meta.indexable).toBe(false)
    expect(storedMeta(meta.id).version).toBe(2)
    // La version 2 n'a été écrite qu'une fois.
    const versionPuts = bucket.puts.filter(
      (put) => put.key === templateVersionKey(meta.id, 2),
    )
    expect(versionPuts).toHaveLength(1)
  })

  it('renonce au second conflit et ne laisse pas de version orpheline', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    bucket.beforePut = (key) => {
      if (key === templateMetaKey(meta.id)) {
        bucket.poke(key, storedMeta(meta.id))
      }
    }

    expect(
      await storeError(
        updateTemplate(bucket, meta.id, ownerToken, { itinerary: japanTrip() }),
      ),
    ).toBe('conflict')
    expect(bucket.peek(templateVersionKey(meta.id, 2))).toBeUndefined()
    expect(storedMeta(meta.id).version).toBe(1)
  })

  it('saute une version orpheline laissée par une mise à jour interrompue', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    bucket.poke(templateVersionKey(meta.id, 2), {
      version: 2,
      title: 'Interrompue',
      itinerary: japanTrip(),
    })

    const updated = await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: japanTrip().slice(0, 1),
    })

    expect(updated.meta.version).toBe(3)
    const current = await readTemplate(bucket, meta.id)
    expect(current.status === 'active' && current.template.dayCount).toBe(1)
  })

  it('sort de l’index un modèle ramené à une journée', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    expect((await readIndex(bucket)).map((entry) => entry.id)).toEqual([
      meta.id,
    ])

    const updated = await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: [day(1)],
    })

    expect(updated.template.listed).toBe(false)
    expect(await readIndex(bucket)).toEqual([])
  })
})

describe('patchTemplate', () => {
  it('masque le modèle : il sort de l’index et n’est plus joignable par son slug', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())

    const patched = await patchTemplate(bucket, meta.id, ownerToken, {
      indexable: false,
      now: LATER,
    })

    expect(patched.meta.indexable).toBe(false)
    expect(patched.meta.version).toBe(1)
    expect(patched.meta.updatedAt).toBe('2026-11-04T08:30:00.000Z')
    expect(patched.template.listed).toBe(false)
    expect(patched.template.itinerary).toHaveLength(3)
    expect(await readIndex(bucket)).toEqual([])
    expect(await readTemplateBySlug(bucket, meta.slug)).toEqual({
      status: 'missing',
    })
    // Toujours joignable par son id : c'est le lien /m/<id>.
    expect((await readTemplate(bucket, meta.id)).status).toBe('active')
  })

  it('change ou efface le prénom', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    const renamed = await patchTemplate(bucket, meta.id, ownerToken, {
      authorName: ' Léa ',
    })
    expect(renamed.meta.authorName).toBe('Léa')
    const erased = await patchTemplate(bucket, meta.id, ownerToken, {
      authorName: null,
    })
    expect(erased.meta.authorName).toBeNull()
    expect(erased.meta.indexable).toBe(true)
  })

  it('n’écrit rien quand rien ne change', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    const writes = bucket.puts.length

    const same = await patchTemplate(bucket, meta.id, ownerToken, {
      indexable: true,
      authorName: 'Yanis',
    })

    expect(bucket.puts.length).toBe(writes)
    expect(same.meta.updatedAt).toBe(meta.updatedAt)
  })

  it('refuse un mauvais jeton', async () => {
    const { meta } = await publishTemplate(bucket, publishInput())
    const other = await publishTemplate(bucket, publishInput())
    expect(
      await storeError(
        patchTemplate(bucket, meta.id, other.ownerToken, { indexable: false }),
      ),
    ).toBe('forbidden')
    expect(storedMeta(meta.id).indexable).toBe(true)
  })
})

describe('retireTemplate', () => {
  it('laisse une pierre tombale sans titre, prénom ni villes, et supprime les versions', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: japanTrip(),
    })

    await retireTemplate(bucket, meta.id, ownerToken, LATER)

    expectErased(meta)
    expect(bucket.keys()).toEqual(
      [
        `${meta.id}/meta`,
        templateIndexKey(meta.id),
        // Le slug reste réservé, sous sa seule empreinte : il ne servira
        // jamais à un autre modèle, et ne dit plus rien du voyage.
        templateSlugKey(meta.slug),
      ].sort(),
    )
    expectNoPlainSlug(meta.slug)
    // Rien de ce que l'auteur a écrit ne reste lisible, nulle part.
    const everything = JSON.stringify(
      bucket.keys().map((key) => [key, bucket.peek(key)]),
    ).toLowerCase()
    for (const word of ['tokyo', 'kyoto', 'japon', 'yanis', 'deux semaines']) {
      expect(everything).not.toContain(word)
    }
    expect(await readIndex(bucket)).toEqual([])
  })

  it('répond « retiré » partout, y compris par son slug', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    await retireTemplate(bucket, meta.id, ownerToken)

    expect(await readTemplate(bucket, meta.id)).toEqual({ status: 'retired' })
    expect(await readTemplateBySlug(bucket, meta.slug)).toEqual({
      status: 'retired',
    })
  })

  it('reste « absent » par son slug quand le modèle n’a jamais été listé', async () => {
    const { meta, ownerToken } = await publishTemplate(
      bucket,
      publishInput({ indexable: false }),
    )
    expect(await readTemplateBySlug(bucket, meta.slug)).toEqual({
      status: 'missing',
    })
    await retireTemplate(bucket, meta.id, ownerToken)
    // Un 410 sur un slug deviné trahirait qu'un modèle « lien seulement » a
    // existé : il reste un 404. Par son id, en revanche, il est bien retiré.
    expect(await readTemplateBySlug(bucket, meta.slug)).toEqual({
      status: 'missing',
    })
    expect(await readTemplate(bucket, meta.id)).toEqual({ status: 'retired' })
  })

  it('reste « absent » par son slug quand le modèle a été masqué avant d’être retiré', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    await patchTemplate(bucket, meta.id, ownerToken, { indexable: false })
    await retireTemplate(bucket, meta.id, ownerToken)
    expect(await readTemplateBySlug(bucket, meta.slug)).toEqual({
      status: 'missing',
    })
  })

  it('accepte un second retrait, mais pas sans le bon jeton', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    const other = await publishTemplate(bucket, publishInput())
    await retireTemplate(bucket, meta.id, ownerToken)

    await expect(
      retireTemplate(bucket, meta.id, ownerToken),
    ).resolves.toBeUndefined()
    expect(
      await storeError(retireTemplate(bucket, meta.id, other.ownerToken)),
    ).toBe('forbidden')
    expect(
      await storeError(retireTemplate(bucket, createTemplateId(), ownerToken)),
    ).toBe('missing')
  })
})

describe('lectures publiques', () => {
  it('ne trouve ni un id inconnu ni un id mal formé', async () => {
    expect(await readTemplate(bucket, createTemplateId())).toEqual({
      status: 'missing',
    })
    expect(await readTemplate(bucket, '../index')).toEqual({
      status: 'missing',
    })
  })

  it('ne sert jamais une version au-delà de la version publiée', async () => {
    const { meta } = await publishTemplate(bucket, publishInput())
    // Une mise à jour en cours a écrit sa version, pas encore la méta.
    bucket.poke(templateVersionKey(meta.id, 2), {
      version: 2,
      title: 'En cours',
      itinerary: [day(1, { city: 'Osaka' })],
    })
    const result = await readTemplate(bucket, meta.id)
    expect(result.status === 'active' && result.template).toMatchObject({
      version: 1,
      dayCount: 3,
    })
  })

  it('ne sert par son slug qu’un modèle listé', async () => {
    const japan = await publishTemplate(bucket, publishInput())
    const lisbon = await publishTemplate(
      bucket,
      publishInput({ itinerary: lisbonDay(), country: 'PT', title: null }),
    )

    const bySlug = await readTemplateBySlug(bucket, japan.meta.slug)
    expect(bySlug.status === 'active' && bySlug.template.id).toBe(japan.meta.id)
    // Une journée : visible, mais jamais listé.
    expect(lisbon.meta.slug).toBe(
      templateSlug({ country: 'PT', dayCount: 1, cities: ['Lisbonne'] }),
    )
    expect(await readTemplateBySlug(bucket, lisbon.meta.slug)).toEqual({
      status: 'missing',
    })
    expect(await readTemplateBySlug(bucket, 'japon')).toEqual({
      status: 'missing',
    })
  })

  it('par un slug qui n’est plus le sien, rend le modèle avec son slug actuel', async () => {
    const { meta } = await publishTemplate(bucket, publishInput())
    // Ancien slug : il pointe toujours vers le modèle, qui en a changé.
    bucket.poke(templateSlugKey('japon-2-jours-tokyo'), { id: meta.id })
    const result = await readTemplateBySlug(bucket, 'japon-2-jours-tokyo')
    expect(result.status === 'active' && result.template).toMatchObject({
      id: meta.id,
      slug: 'japon-3-jours-tokyo-kyoto',
    })
    // Un slug réservé par une publication qui n'a jamais écrit sa méta.
    bucket.poke(templateSlugKey('japon-2-jours-osaka'), {
      id: createTemplateId(),
    })
    expect(await readTemplateBySlug(bucket, 'japon-2-jours-osaka')).toEqual({
      status: 'missing',
    })
  })

  it('liste les modèles du plus récent au plus ancien, sans les modèles non listés', async () => {
    const older = await publishTemplate(bucket, publishInput())
    const newer = await publishTemplate(
      bucket,
      publishInput({ now: LATER, title: 'Tokyo, Kyoto' }),
    )
    await publishTemplate(bucket, publishInput({ indexable: false }))
    await publishTemplate(
      bucket,
      publishInput({ itinerary: lisbonDay(), country: 'PT' }),
    )

    const entries = await readIndex(bucket)

    expect(entries.map((entry) => entry.id)).toEqual([
      newer.meta.id,
      older.meta.id,
    ])
    expect(entries[0]).toEqual({
      id: newer.meta.id,
      slug: newer.meta.slug,
      title: 'Tokyo, Kyoto',
      country: 'JP',
      dayCount: 3,
      cities: ['Tokyo', 'Kyoto'],
      updatedAt: '2026-11-04T08:30:00.000Z',
    })
  })

  it('renvoie un index vide tant que rien n’est listé', async () => {
    expect(await readIndex(bucket)).toEqual([])
  })

  it('lève sur un index illisible au lieu de le présenter comme vide', async () => {
    bucket.poke(TEMPLATE_INDEX_KEYS[7], ['pas', 'un', 'index'])
    await expect(readIndex(bucket)).rejects.toThrow(/illisible/)
  })

  it('refuse un snapshot écrit par une version plus récente', async () => {
    const { meta } = await publishTemplate(bucket, publishInput())
    bucket.poke(templateMetaKey(meta.id), storedMeta(meta.id), {
      version: TEMPLATE_SCHEMA_VERSION + 1,
    })
    const error = await readTemplate(bucket, meta.id).catch((e: unknown) => e)
    expect(isS3ndError(error) && error.code).toBe('SNAPSHOT_TOO_NEW')
  })

  it('ne fait pas passer une méta illisible pour un modèle absent', async () => {
    const id = createTemplateId()
    bucket.poke(templateMetaKey(id), { id, slug: 42 })
    await expect(readTemplate(bucket, id)).rejects.toThrow(/illisibles/)
  })

  it('ne renvoie aucune clé inconnue glissée dans la méta stockée', async () => {
    const { meta } = await publishTemplate(bucket, publishInput())
    bucket.poke(templateMetaKey(meta.id), {
      ...storedMeta(meta.id),
      adminNote: 'interne',
    })
    const result = await readTemplate(bucket, meta.id)
    expect(result.status === 'active' && result.template).not.toHaveProperty(
      'adminNote',
    )
  })
})

describe('index partagé', () => {
  it('réessaie quand une autre publication a écrit l’index entre-temps', async () => {
    const first = await publishTemplate(bucket, publishInput())
    let raced = false
    bucket.beforePut = (key) => {
      if (!isTemplateIndexKey(key) || raced) return
      raced = true
      touchIndex(key)
    }

    const second = await publishTemplate(bucket, publishInput({ now: LATER }))

    expect((await readIndex(bucket)).map((entry) => entry.id)).toEqual([
      second.meta.id,
      first.meta.id,
    ])
  })

  it('renonce après 5 conflits, sans faire échouer la publication', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    await publishTemplate(bucket, publishInput())
    bucket.beforePut = (key) => {
      if (isTemplateIndexKey(key)) touchIndex(key)
    }

    const { meta } = await publishTemplate(bucket, publishInput())

    expect((await readTemplate(bucket, meta.id)).status).toBe('active')
    expect(
      bucket.puts.filter((put) => isTemplateIndexKey(put.key)),
    ).toHaveLength(6)
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('5 conflits'))
  })

  it('ne réécrit pas un index illisible', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(createTemplateId).mockReturnValueOnce(FIXED_ID)
    const shard = templateIndexKey(FIXED_ID)
    bucket.poke(shard, ['pas', 'un', 'index'])
    await publishTemplate(bucket, publishInput())
    expect(bucket.peek(shard)).toEqual(['pas', 'un', 'index'])
    expect(logged).toHaveBeenCalled()
  })
})

describe('index et requêtes concurrentes', () => {
  it('ne remet pas dans l’index un modèle masqué pendant une mise à jour', async () => {
    const { meta, ownerToken } = await publishTemplate(
      bucket,
      publishInput({ title: 'Mon Japon secret' }),
    )
    // Le PATCH passe entre l'écriture de la méta du PUT et sa lecture de l'index.
    const slowPut = racing('get', () =>
      patchTemplate(bucket, meta.id, ownerToken, {
        indexable: false,
        now: EVEN_LATER,
      }),
    )

    await updateTemplate(slowPut, meta.id, ownerToken, {
      itinerary: japanTrip(),
      now: LATER,
    })

    expect(storedMeta(meta.id)).toMatchObject({ indexable: false, version: 2 })
    expect(await indexIds()).toEqual([])
  })

  it('ne remet pas dans l’index un modèle retiré pendant une mise à jour', async () => {
    const { meta, ownerToken } = await publishTemplate(
      bucket,
      publishInput({ title: 'Mon Japon secret' }),
    )
    const slowPut = racing('get', () =>
      retireTemplate(bucket, meta.id, ownerToken, EVEN_LATER),
    )

    await updateTemplate(slowPut, meta.id, ownerToken, {
      itinerary: japanTrip(),
      now: LATER,
    })

    expect(await readTemplate(bucket, meta.id)).toEqual({ status: 'retired' })
    expect(await indexIds()).toEqual([])
    // Ce que la pierre tombale efface ne survit pas dans l'index public.
    expect(storedIndexJson()).not.toContain('Mon Japon secret')
  })

  it('relit la méta quand un masquage a écrit l’index entre sa lecture et son écriture', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    const slowPut = racing('put', () =>
      patchTemplate(bucket, meta.id, ownerToken, {
        indexable: false,
        now: EVEN_LATER,
      }),
    )

    await updateTemplate(slowPut, meta.id, ownerToken, {
      itinerary: japanTrip(),
      now: LATER,
    })

    expect(storedMeta(meta.id).indexable).toBe(false)
    expect(await indexIds()).toEqual([])
  })

  it('n’écrase pas un masquage plus récent qui n’avait rien trouvé à retirer', async () => {
    // Un autre modèle listé : l'index existe déjà.
    const other = await publishTemplate(bucket, publishInput())
    const { meta, ownerToken } = await publishTemplate(
      bucket,
      publishInput({ indexable: false }),
    )
    // « Afficher » lit l'index (sans le modèle) et la méta (listée), puis,
    // avant qu'il n'écrive, « masquer » va jusqu'au bout : l'index n'ayant
    // pas encore la ligne, il n'y a rien à retirer.
    const slowShow = racing('put', () =>
      patchTemplate(bucket, meta.id, ownerToken, {
        indexable: false,
        now: EVEN_LATER,
      }),
    )

    await patchTemplate(slowShow, meta.id, ownerToken, {
      indexable: true,
      now: LATER,
    })

    expect(storedMeta(meta.id).indexable).toBe(false)
    expect(await indexIds()).toEqual([other.meta.id])
  })
})

describe('sortie de l’index', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('fait échouer un retrait que l’index n’a pas suivi, et le retrait rejoué le rattrape', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    breakIndexWrites()

    expect(
      await storeError(retireTemplate(bucket, meta.id, ownerToken, LATER)),
    ).toBe('index')
    // La pierre tombale est en place : le modèle ne répond déjà plus.
    expect(await readTemplate(bucket, meta.id)).toEqual({ status: 'retired' })
    expect(await indexIds()).toEqual([meta.id])

    bucket.beforePut = null
    await retireTemplate(bucket, meta.id, ownerToken)
    expect(await indexIds()).toEqual([])
  })

  it('fait échouer un masquage que l’index n’a pas suivi, et le même masquage rejoué le rattrape', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    breakIndexWrites()

    expect(
      await storeError(
        patchTemplate(bucket, meta.id, ownerToken, { indexable: false }),
      ),
    ).toBe('index')
    expect(storedMeta(meta.id).indexable).toBe(false)
    expect(await indexIds()).toEqual([meta.id])

    bucket.beforePut = null
    const metaWrites = () =>
      bucket.puts.filter((put) => put.key === templateMetaKey(meta.id)).length
    const before = metaWrites()
    const retried = await patchTemplate(bucket, meta.id, ownerToken, {
      indexable: false,
    })
    expect(retried.meta.indexable).toBe(false)
    // La méta était déjà à jour : seul l'index a été réécrit.
    expect(metaWrites()).toBe(before)
    expect(await indexIds()).toEqual([])
  })

  it('fait échouer une mise à jour qui sort le modèle de l’index, sans perdre la nouvelle version', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    breakIndexWrites()

    expect(
      await storeError(
        updateTemplate(bucket, meta.id, ownerToken, { itinerary: [day(1)] }),
      ),
    ).toBe('index')

    // La version 2 est en ligne : la méta pointe vers elle, elle existe.
    expect(storedMeta(meta.id).version).toBe(2)
    expect(bucket.peek(templateVersionKey(meta.id, 2))).toBeDefined()
    const current = await readTemplate(bucket, meta.id)
    expect(current.status === 'active' && current.template.dayCount).toBe(1)
  })

  it('garde au mieux un ajout ou une modification : la requête réussit', async () => {
    const { meta, ownerToken } = await publishTemplate(
      bucket,
      publishInput({ indexable: false }),
    )
    breakIndexWrites()

    const shown = await patchTemplate(bucket, meta.id, ownerToken, {
      indexable: true,
    })
    const updated = await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: japanTrip(),
    })

    expect(shown.template.listed).toBe(true)
    expect(updated.meta.version).toBe(2)
    expect(await indexIds()).toEqual([])
  })

  it('fait échouer un retrait quand l’index est illisible', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    bucket.poke(templateIndexKey(meta.id), { pas: 'un index' })
    expect(await storeError(retireTemplate(bucket, meta.id, ownerToken))).toBe(
      'index',
    )
  })
})

describe('suppression des versions au retrait', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('fait échouer un retrait dont les versions n’ont pas été supprimées, après la pierre tombale et l’index', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: japanTrip(),
    })
    breakDeletes()

    expect(
      await storeError(retireTemplate(bucket, meta.id, ownerToken, LATER)),
    ).toBe('versions')

    // Pierre tombale et index sont en place : le modèle ne répond plus…
    expectErased(meta)
    expect(await readTemplate(bucket, meta.id)).toEqual({ status: 'retired' })
    expect(await indexIds()).toEqual([])
    // … mais le contenu de l'auteur est encore dans le bucket.
    expect(versionKeys(meta.id)).toEqual([templateVersionKey(meta.id, 2)])
    expect(console.error).toHaveBeenCalledWith(
      'Versions du modèle non supprimées',
      expect.any(Error),
    )

    bucket.beforeDelete = null
    await retireTemplate(bucket, meta.id, ownerToken, EVEN_LATER)
    expect(versionKeys(meta.id)).toEqual([])
    expectErased(meta)
  })

  it('lève « index » d’abord quand l’index et les versions échouent tous deux', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    breakDeletes()
    breakIndexWrites()

    expect(
      await storeError(retireTemplate(bucket, meta.id, ownerToken, LATER)),
    ).toBe('index')
    expect(await indexIds()).toEqual([meta.id])
    expect(versionKeys(meta.id)).toEqual([templateVersionKey(meta.id, 1)])

    bucket.beforeDelete = null
    bucket.beforePut = null
    await retireTemplate(bucket, meta.id, ownerToken)
    expect(await indexIds()).toEqual([])
    expect(versionKeys(meta.id)).toEqual([])
  })

  it('fait échouer de même le retrait par l’opérateur, et la commande rejouée efface le contenu', async () => {
    const { meta } = await publishTemplate(bucket, publishInput())
    breakDeletes()

    expect(
      await storeError(retireTemplateAsOperator(bucket, meta.slug, LATER)),
    ).toBe('versions')
    expect(await readTemplateForOperator(bucket, meta.id)).toMatchObject({
      status: 'retired',
      inIndex: false,
      versionsLeft: 1,
    })

    bucket.beforeDelete = null
    const retried = await retireTemplateAsOperator(bucket, meta.slug)
    expect(retried.alreadyRetired).toBe(true)
    expect(await readTemplateForOperator(bucket, meta.id)).toMatchObject({
      status: 'retired',
      inIndex: false,
      versionsLeft: 0,
    })
  })
})

describe('assertTemplateOwner', () => {
  it('laisse passer l’auteur d’un modèle en ligne', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    await expect(
      assertTemplateOwner(bucket, meta.id, ownerToken),
    ).resolves.toBeUndefined()
  })

  it('refuse un mauvais jeton, un modèle inconnu et un modèle retiré', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    const other = await publishTemplate(bucket, publishInput())

    expect(
      await storeError(assertTemplateOwner(bucket, meta.id, other.ownerToken)),
    ).toBe('forbidden')
    expect(
      await storeError(
        assertTemplateOwner(bucket, createTemplateId(), ownerToken),
      ),
    ).toBe('missing')
    expect(
      await storeError(assertTemplateOwner(bucket, '../index', ownerToken)),
    ).toBe('missing')
    await retireTemplate(bucket, meta.id, ownerToken)
    expect(
      await storeError(assertTemplateOwner(bucket, meta.id, ownerToken)),
    ).toBe('retired')
  })
})

/** `count` journées, une ville par journée. */
function trip(
  count: number,
  city = (n: number) => `Ville ${n}`,
): DayItinerary[] {
  return Array.from({ length: count }, (_, index) =>
    day(index + 1, { city: city(index + 1) }),
  )
}

describe('mise à jour : ce que la méta recalcule, et ce qu’elle ne touche jamais', () => {
  it('recalcule titre, jours, villes, année, réglages, slug et date de modification, jamais le pays', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    const kansai = [
      day(1, { date: '2027-03-10', city: 'Osaka', notes: 'Note du jour' }),
      day(2, { date: '2027-03-11', city: 'Nara' }),
      day(3, { date: '2027-03-12', city: 'Osaka' }),
      day(4, { date: '2027-03-13', city: 'Kobe' }),
    ]

    const { meta: next, template } = await updateTemplate(
      bucket,
      meta.id,
      ownerToken,
      {
        itinerary: kansai,
        title: 'Le Kansai en quatre jours',
        options: { includeNotes: true, includePrices: false },
        now: LATER,
      },
    )

    expect(next).toEqual({
      ...meta,
      // La durée et les villes ont changé : le slug les suit.
      slug: 'japon-4-jours-osaka-nara-kobe',
      version: 2,
      title: 'Le Kansai en quatre jours',
      dayCount: 4,
      cities: ['Osaka', 'Nara', 'Kobe'],
      tripYear: 2027,
      includesNotes: true,
      includesPrices: false,
      updatedAt: '2026-11-04T08:30:00.000Z',
    })
    // Le pays, lui, ne bouge jamais.
    expect(next.country).toBe('JP')
    expect(next.publishedAt).toBe(meta.publishedAt)
    expect(storedMeta(meta.id)).toEqual(next)
    expect(template.itinerary[0].notes).toBe('Note du jour')

    // L'index ne porte que le slug actuel.
    const [entry] = await readIndex(bucket)
    expect(entry).toEqual({
      id: meta.id,
      slug: 'japon-4-jours-osaka-nara-kobe',
      title: 'Le Kansai en quatre jours',
      country: 'JP',
      dayCount: 4,
      cities: ['Osaka', 'Nara', 'Kobe'],
      updatedAt: '2026-11-04T08:30:00.000Z',
    })
    // L'ancien slug mène au modèle, avec son slug actuel (301 côté vitrine).
    const bySlug = await readTemplateBySlug(bucket, meta.slug)
    expect(bySlug.status === 'active' && bySlug.template).toMatchObject({
      title: 'Le Kansai en quatre jours',
      slug: 'japon-4-jours-osaka-nara-kobe',
    })
  })

  it('remet l’année à null quand la nouvelle version n’a plus de date', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    const { meta: next } = await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: [day(1, { date: '' }), day(2, { date: 'à définir' })],
    })
    expect(next.tripYear).toBeNull()
  })

  it('sort de l’index un modèle de 14 jours ramené à un seul, et son slug répond 404', async () => {
    const { meta, ownerToken } = await publishTemplate(
      bucket,
      publishInput({ itinerary: trip(14) }),
    )
    expect(meta.slug).toBe('japon-14-jours-ville-1-ville-2-ville-3')
    expect(await indexIds()).toEqual([meta.id])

    const { template } = await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: trip(1),
    })

    expect(template.listed).toBe(false)
    // Un nouveau slug d'une journée, l'ancien gardé : aucun ne répond.
    expect(template.slug).toBe(
      templateSlug({ country: 'JP', dayCount: 1, cities: ['Ville 1'] }),
    )
    expect(await indexIds()).toEqual([])
    for (const slug of [meta.slug, template.slug]) {
      expect(await readTemplateBySlug(bucket, slug)).toEqual({
        status: 'missing',
      })
    }
    // Toujours joignable par son lien /m/<id>.
    expect((await readTemplate(bucket, meta.id)).status).toBe('active')
    // Retiré ensuite, il n'avait plus de page : 404 par ses slugs, pas 410.
    await retireTemplate(bucket, meta.id, ownerToken)
    for (const slug of [meta.slug, template.slug]) {
      expect(await readTemplateBySlug(bucket, slug)).toEqual({
        status: 'missing',
      })
    }
  })

  it('remet dans l’index un modèle d’une journée qui en retrouve deux', async () => {
    const { meta, ownerToken } = await publishTemplate(
      bucket,
      publishInput({ itinerary: trip(1) }),
    )
    expect(await indexIds()).toEqual([])
    const { meta: longer } = await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: trip(2),
    })
    expect(longer.slug).toBe('japon-2-jours-ville-1-ville-2')
    expect(await indexIds()).toEqual([meta.id])
    expect((await readTemplateBySlug(bucket, longer.slug)).status).toBe(
      'active',
    )
  })
})

describe('réglages : la liste publique suit', () => {
  it('remet un modèle dans l’index quand l’auteur le rend visible, et date la modification', async () => {
    const { meta, ownerToken } = await publishTemplate(
      bucket,
      publishInput({ indexable: false }),
    )
    expect(await indexIds()).toEqual([])
    expect((await readTemplateBySlug(bucket, meta.slug)).status).toBe('missing')

    const shown = await patchTemplate(bucket, meta.id, ownerToken, {
      indexable: true,
      now: LATER,
    })

    expect(shown.meta).toMatchObject({
      indexable: true,
      version: 1,
      updatedAt: '2026-11-04T08:30:00.000Z',
    })
    expect(shown.template.listed).toBe(true)
    expect(await readIndex(bucket)).toEqual([
      expect.objectContaining({
        id: meta.id,
        updatedAt: '2026-11-04T08:30:00.000Z',
      }),
    ])
    expect((await readTemplateBySlug(bucket, meta.slug)).status).toBe('active')
  })

  it('date aussi un changement de prénom, et l’index le suit', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    const renamed = await patchTemplate(bucket, meta.id, ownerToken, {
      authorName: 'Léa',
      now: EVEN_LATER,
    })
    expect(renamed.meta.updatedAt).toBe('2026-11-04T09:00:00.000Z')
    expect(storedMeta(meta.id).updatedAt).toBe('2026-11-04T09:00:00.000Z')
    const [entry] = await readIndex(bucket)
    expect(entry.updatedAt).toBe('2026-11-04T09:00:00.000Z')
  })
})

describe('pierre tombale', () => {
  it('retient si le modèle était listé : 410 par son slug, 404 sinon', async () => {
    const listed = await publishTemplate(bucket, publishInput())
    const hidden = await publishTemplate(
      bucket,
      publishInput({ indexable: false }),
    )
    const short = await publishTemplate(
      bucket,
      publishInput({ itinerary: lisbonDay(), country: 'PT' }),
    )
    for (const { meta, ownerToken } of [listed, hidden, short]) {
      await retireTemplate(bucket, meta.id, ownerToken, LATER)
    }

    expect(storedMeta(listed.meta.id)).toMatchObject({ wasListed: true })
    expect(storedMeta(hidden.meta.id)).toMatchObject({ wasListed: false })
    expect(storedMeta(short.meta.id)).toMatchObject({ wasListed: false })
    expect(await readTemplateBySlug(bucket, listed.meta.slug)).toEqual({
      status: 'retired',
    })
    expect(await readTemplateBySlug(bucket, hidden.meta.slug)).toEqual({
      status: 'missing',
    })
    expect(await readTemplateBySlug(bucket, short.meta.slug)).toEqual({
      status: 'missing',
    })
    expectErased(hidden.meta, false)
    // Trois modèles retirés : plus aucun de leurs slugs n'est lisible.
    expectNoPlainSlug(listed.meta.slug, hidden.meta.slug, short.meta.slug)
  })

  it('ne relit jamais d’une pierre tombale autre chose que ses champs', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    await retireTemplate(bucket, meta.id, ownerToken, LATER)
    // Un slug, un titre glissés dans l'objet stocké ne ressortent pas.
    bucket.poke(templateMetaKey(meta.id), {
      ...(bucket.peek(templateMetaKey(meta.id)) as object),
      slug: meta.slug,
      title: meta.title,
    })
    const state = await readTemplateForOperator(bucket, meta.id)
    expect(state.status === 'retired' && state.meta).toEqual({
      id: meta.id,
      version: 1,
      publishedAt: meta.publishedAt,
      retiredAt: '2026-11-04T08:30:00.000Z',
      ownerTokenHash: meta.ownerTokenHash,
      wasListed: true,
    })
    expect(await readTemplateBySlug(bucket, meta.slug)).toEqual({
      status: 'retired',
    })
  })

  it('ne fait pas passer une pierre tombale illisible pour un modèle absent', async () => {
    const { meta } = await publishTemplate(bucket, publishInput())
    const { wasListed: _wasListed, ...incomplete } = {
      id: meta.id,
      slug: meta.slug,
      version: 1,
      publishedAt: meta.publishedAt,
      retiredAt: '2026-11-04T08:30:00.000Z',
      ownerTokenHash: meta.ownerTokenHash,
      wasListed: true,
    }
    bucket.poke(templateMetaKey(meta.id), incomplete)
    await expect(readTemplate(bucket, meta.id)).rejects.toThrow(/illisibles/)
    bucket.poke(templateMetaKey(meta.id), { ...incomplete, wasListed: 'oui' })
    await expect(readTemplate(bucket, meta.id)).rejects.toThrow(/illisibles/)
  })
})

describe('retireTemplateAsOperator', () => {
  it('retire sans le jeton, par l’id, avec les mêmes effets que l’auteur', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: japanTrip(),
    })

    const result = await retireTemplateAsOperator(bucket, meta.id, LATER)

    // Le slug vient de la méta en ligne, lue juste avant le retrait.
    expect(result).toEqual({
      id: meta.id,
      slug: meta.slug,
      retiredAt: '2026-11-04T08:30:00.000Z',
      wasListed: true,
      alreadyRetired: false,
    })
    expectErased(meta)
    expectNoPlainSlug(meta.slug)
    expect(bucket.keys()).toEqual(
      [
        `${meta.id}/meta`,
        templateIndexKey(meta.id),
        // Le slug reste réservé : il ne servira jamais à un autre modèle.
        templateSlugKey(meta.slug),
      ].sort(),
    )
    expect(await readIndex(bucket)).toEqual([])
    expect(await readTemplate(bucket, meta.id)).toEqual({ status: 'retired' })
    expect(await readTemplateBySlug(bucket, meta.slug)).toEqual({
      status: 'retired',
    })
    // L'auteur peut encore « retirer » de son côté : rien ne casse.
    await expect(
      retireTemplate(bucket, meta.id, ownerToken),
    ).resolves.toBeUndefined()
  })

  it('retire par le slug, et un modèle non listé reste « absent » par ce slug', async () => {
    const { meta } = await publishTemplate(
      bucket,
      publishInput({ indexable: false }),
    )

    const result = await retireTemplateAsOperator(bucket, meta.slug, LATER)

    expect(result).toMatchObject({ id: meta.id, wasListed: false })
    expectErased(meta, false)
    expect(await readTemplate(bucket, meta.id)).toEqual({ status: 'retired' })
    expect(await readTemplateBySlug(bucket, meta.slug)).toEqual({
      status: 'missing',
    })
  })

  it('est idempotent : un second retrait le signale et refait le ménage', async () => {
    const { meta } = await publishTemplate(bucket, publishInput())
    await retireTemplateAsOperator(bucket, meta.id, LATER)
    // Une version orpheline réapparue est supprimée au second passage.
    bucket.poke(templateVersionKey(meta.id, 2), {
      version: 2,
      title: 'Orpheline',
      itinerary: japanTrip(),
    })

    const again = await retireTemplateAsOperator(bucket, meta.slug, EVEN_LATER)

    // Retrouvé par l'empreinte de son slug ; la pierre tombale ne le connaît
    // plus.
    expect(again).toEqual({
      id: meta.id,
      slug: null,
      alreadyRetired: true,
      retiredAt: '2026-11-04T08:30:00.000Z',
      wasListed: true,
    })
    expect(bucket.peek(templateVersionKey(meta.id, 2))).toBeUndefined()
    expectErased(meta)
  })

  it('ne trouve ni un id inconnu, ni un slug libre, ni une référence mal formée', async () => {
    const { meta } = await publishTemplate(bucket, publishInput())
    for (const ref of [
      createTemplateId(),
      'japon-3-jours-osaka',
      'japon',
      '../index',
      '',
    ]) {
      expect(await storeError(retireTemplateAsOperator(bucket, ref))).toBe(
        'missing',
      )
    }
    expect((await readTemplate(bucket, meta.id)).status).toBe('active')
  })

  it('retire par un ancien slug, et le modèle répond 410 sur tous ses slugs', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    const { meta: longer } = await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: [...japanTrip(), day(4, { city: 'Osaka' })],
    })
    expect(longer.slug).not.toBe(meta.slug)

    const result = await retireTemplateAsOperator(bucket, meta.slug, LATER)

    expect(result).toMatchObject({ id: meta.id, slug: longer.slug })
    for (const slug of [meta.slug, longer.slug]) {
      expect(await readTemplateBySlug(bucket, slug)).toEqual({
        status: 'retired',
      })
      expect(bucket.peek(templateSlugKey(slug))).toEqual({ id: meta.id })
      // L'opérateur le retrouve encore par chacun, retiré.
      expect(await readTemplateForOperator(bucket, slug)).toMatchObject({
        status: 'retired',
        meta: { id: meta.id },
      })
    }
    expectNoPlainSlug(meta.slug, longer.slug)
  })

  it('échoue si l’index ne suit pas, pierre tombale en place, et la commande rejouée le rattrape', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { meta } = await publishTemplate(bucket, publishInput())
    breakIndexWrites()

    expect(await storeError(retireTemplateAsOperator(bucket, meta.id))).toBe(
      'index',
    )
    expect(await readTemplate(bucket, meta.id)).toEqual({ status: 'retired' })
    expect(await indexIds()).toEqual([meta.id])

    bucket.beforePut = null
    const retried = await retireTemplateAsOperator(bucket, meta.id)
    expect(retried.alreadyRetired).toBe(true)
    expect(await indexIds()).toEqual([])
  })

  it('relit la méta si l’auteur la change pendant le retrait', async () => {
    const { meta } = await publishTemplate(bucket, publishInput())
    let raced = false
    bucket.beforePut = (key) => {
      if (key !== templateMetaKey(meta.id) || raced) return
      raced = true
      bucket.poke(key, { ...storedMeta(meta.id), indexable: false })
    }

    const result = await retireTemplateAsOperator(bucket, meta.id, LATER)

    // Masqué entre-temps : il n'avait plus de page au moment du retrait.
    expect(result.wasListed).toBe(false)
    expectErased(meta, false)
  })
})

describe('readTemplateForOperator', () => {
  it('décrit un modèle en ligne, puis retiré, par son id comme par son slug', async () => {
    const { meta } = await publishTemplate(bucket, publishInput())

    const before = await readTemplateForOperator(bucket, meta.slug)
    expect(before).toEqual({
      status: 'active',
      meta,
      inIndex: true,
      versionsLeft: 1,
    })

    await retireTemplateAsOperator(bucket, meta.id, LATER)
    for (const ref of [meta.id, meta.slug]) {
      const after = await readTemplateForOperator(bucket, ref)
      expect(after).toMatchObject({
        status: 'retired',
        meta: { id: meta.id, wasListed: true },
        inIndex: false,
        versionsLeft: 0,
      })
      expect(after.status === 'retired' && after.meta).not.toHaveProperty(
        'slug',
      )
    }
  })

  it('compte les versions stockées, orphelines comprises, et `null` si l’une est illisible', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: japanTrip(),
    })
    // Une mise à jour interrompue a laissé v/3 sans méta qui pointe vers elle,
    // et une suppression échouée a laissé v/1.
    for (const version of [1, 3]) {
      bucket.poke(templateVersionKey(meta.id, version), {
        version,
        title: 'Orpheline',
        itinerary: japanTrip(),
      })
    }
    expect(await readTemplateForOperator(bucket, meta.id)).toMatchObject({
      status: 'active',
      versionsLeft: 3,
    })

    const unreadable: TemplateBucket = {
      ...bucket,
      async getSnapshot(key, options) {
        if (key === templateVersionKey(meta.id, 2)) {
          throw new Error('R2 indisponible')
        }
        return bucket.getSnapshot(key, options)
      },
    }
    expect(await readTemplateForOperator(unreadable, meta.id)).toMatchObject({
      status: 'active',
      inIndex: true,
      versionsLeft: null,
    })
  })

  it('signale un modèle introuvable, et un index illisible sans échouer', async () => {
    expect(await readTemplateForOperator(bucket, createTemplateId())).toEqual({
      status: 'missing',
    })
    const { meta } = await publishTemplate(bucket, publishInput())
    bucket.poke(templateIndexKey(meta.id), { pas: 'un index' })
    expect(await readTemplateForOperator(bucket, meta.id)).toMatchObject({
      status: 'active',
      inIndex: null,
    })
  })
})

describe('forme des valeurs avant stockage', () => {
  it('retire du contenu stocké les valeurs mal typées', async () => {
    const hostileDay = {
      ...day(1),
      activities: [
        { ...activity({ id: 'act-objet' }), name: { fr: 'Temple' } },
        activity({ id: 'act-ok', price: Number.NaN }),
      ],
      images: [{ url: 'javascript:alert(1)', caption: 'piège' }],
    } as unknown as DayItinerary

    const { meta, template } = await publishTemplate(
      bucket,
      publishInput({ itinerary: [hostileDay, day(2)] }),
    )

    expect(template.itinerary[0].activities).toEqual([
      activity({ id: 'act-ok' }),
    ])
    expect(template.itinerary[0]).not.toHaveProperty('images')
    expect(bucket.peek(templateVersionKey(meta.id, 1))).toMatchObject({
      itinerary: template.itinerary,
    })
  })

  it('refuse une journée dont un champ requis est faux, sans rien écrire', async () => {
    const broken = {
      ...day(2),
      coordinates: ['35.6', '139.6'],
    } as unknown as DayItinerary
    expect(
      await storeError(
        publishTemplate(bucket, publishInput({ itinerary: [day(1), broken] })),
      ),
    ).toBe('invalid')
    expect(bucket.keys()).toEqual([])

    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    expect(
      await storeError(
        updateTemplate(bucket, meta.id, ownerToken, {
          itinerary: [{ ...day(1), dayNumber: Number.NaN }],
        }),
      ),
    ).toBe('invalid')
    expect(storedMeta(meta.id).version).toBe(1)
    expect(bucket.peek(templateVersionKey(meta.id, 2))).toBeUndefined()
  })
})

// ── Réponse S3 perdue ─────────────────────────────────────────────────────────

/**
 * L'écriture de la première clé qui vérifie `matches` aboutit, puis lève 412 :
 * ce que voit s3nd quand la réponse se perd et que le SDK rejoue la requête,
 * qui bute alors sur sa propre écriture.
 */
function loseResponseOnce(matches: (key: string, data: unknown) => boolean) {
  const realPut = bucket.putSnapshot.bind(bucket)
  let lost = false
  return vi
    .spyOn(bucket, 'putSnapshot')
    .mockImplementation(async (key, data, options) => {
      const result = await realPut(key, data, options)
      if (!lost && matches(key, data)) {
        lost = true
        throw new S3ndError('PRECONDITION_FAILED', `${key} existe déjà.`)
      }
      return result
    })
}

describe('réponse S3 perdue : 412 sur notre propre écriture', () => {
  it('publie quand même si la réponse de la méta se perd : jeton rendu, index et slug de base', async () => {
    loseResponseOnce((key) => key.endsWith('/meta'))

    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())

    await expect(
      assertTemplateOwner(bucket, meta.id, ownerToken),
    ).resolves.toBeUndefined()
    expect(await indexIds()).toEqual([meta.id])
    expect(meta.slug).toBe('japon-3-jours-tokyo-kyoto')
    expect(storedMeta(meta.id).ownerTokenHash).toBe(meta.ownerTokenHash)
  })

  it('échoue toujours si la méta en place n’est pas la nôtre', async () => {
    vi.mocked(createTemplateId).mockReturnValueOnce(FIXED_ID)
    // Une autre méta (autre jeton) occupe la place : le 412 est un vrai refus.
    bucket.beforePut = (key) => {
      if (key === templateMetaKey(FIXED_ID)) {
        bucket.beforePut = null
        bucket.poke(templateMetaKey(FIXED_ID), {
          ...storedMetaLike(FIXED_ID),
          ownerTokenHash: 'a'.repeat(64),
        })
      }
    }
    await expect(publishTemplate(bucket, publishInput())).rejects.toSatisfy(
      (error) => isS3ndError(error) && error.code === 'PRECONDITION_FAILED',
    )
  })

  it('garde le slug de base si la réponse de sa réservation se perd', async () => {
    loseResponseOnce((key) => key.startsWith('slugs/'))

    const { meta } = await publishTemplate(bucket, publishInput())

    expect(meta.slug).toBe('japon-3-jours-tokyo-kyoto')
    expect(bucket.keys().filter((key) => key.startsWith('slugs/'))).toEqual([
      templateSlugKey('japon-3-jours-tokyo-kyoto'),
    ])
  })

  it('passe au slug suivant si le slug est vraiment à un autre modèle', async () => {
    bucket.poke(templateSlugKey('japon-3-jours-tokyo-kyoto'), {
      id: 'autremodele12345',
    })
    const { meta } = await publishTemplate(bucket, publishInput())
    expect(meta.slug).toBe('japon-3-jours-tokyo-kyoto-2')
  })

  it('publie la version 2 d’une mise à jour dont la réponse de la méta se perd', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    loseResponseOnce(
      (key, data) =>
        key === templateMetaKey(meta.id) &&
        (data as { version?: number }).version === 2,
    )

    const updated = await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: japanTrip(),
      now: LATER,
    })

    expect(updated.meta.version).toBe(2)
    expect(updated.template.version).toBe(2)
    expect(storedMeta(meta.id).version).toBe(2)
    expect(await readTemplate(bucket, meta.id)).toMatchObject({
      status: 'active',
      template: { version: 2 },
    })
    expect(versionKeys(meta.id)).toEqual([templateVersionKey(meta.id, 2)])
  })

  it('ne supprime jamais la version vers laquelle pointe la méta, même modifiée depuis', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    const realPut = bucket.putSnapshot.bind(bucket)
    let lost = false
    vi.spyOn(bucket, 'putSnapshot').mockImplementation(
      async (key, data, options) => {
        const result = await realPut(key, data, options)
        if (
          !lost &&
          key === templateMetaKey(meta.id) &&
          (data as { version?: number }).version === 2
        ) {
          lost = true
          // Un masquage passe entre notre écriture et le 412 de son rejeu.
          await patchTemplate(bucket, meta.id, ownerToken, {
            indexable: false,
            now: EVEN_LATER,
          })
          throw new S3ndError('PRECONDITION_FAILED', `${key} a changé.`)
        }
        return result
      },
    )

    const updated = await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: japanTrip(),
      now: LATER,
    })

    expect(updated.meta).toMatchObject({ version: 2, indexable: false })
    expect(await readTemplate(bucket, meta.id)).toMatchObject({
      status: 'active',
      template: { version: 2 },
    })
  })
})

/** Une méta active plausible, pour occuper une clé à la place d'un autre. */
function storedMetaLike(id: string): TemplateMeta {
  return {
    id,
    slug: 'japon-3-jours-tokyo-kyoto',
    version: 1,
    title: 'Autre',
    authorName: null,
    country: 'JP',
    indexable: false,
    includesNotes: false,
    includesPrices: false,
    privateStays: [],
    dayCount: 3,
    cities: ['Tokyo'],
    tripYear: 2026,
    publishedAt: PUBLISHED_AT.toISOString(),
    updatedAt: PUBLISHED_AT.toISOString(),
    retiredAt: null,
    ownerTokenHash: 'b'.repeat(64),
  }
}

// ── Retrait concurrent ────────────────────────────────────────────────────────

/**
 * Le bucket, avec un retrait complet glissé juste avant la première lecture
 * d'une version du modèle : là où une écriture relit la version publiée.
 */
function retiringBeforeVersionRead(id: string, token: string): TemplateBucket {
  let pending = true
  return {
    async getSnapshot(key, options) {
      if (pending && key.startsWith(`${id}/v/`)) {
        pending = false
        await retireTemplate(bucket, id, token, LATER)
      }
      return bucket.getSnapshot(key, options)
    },
    putSnapshot: (key, data, options) => bucket.putSnapshot(key, data, options),
    delete: (key) => bucket.delete(key),
  }
}

describe('retrait concurrent d’une écriture ou d’une lecture', () => {
  it('répond « retiré » à un réglage qui croise un retrait, qu’il change la méta ou non', async () => {
    for (const indexable of [false, true]) {
      bucket.reset()
      const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
      expect(
        await storeError(
          patchTemplate(
            retiringBeforeVersionRead(meta.id, ownerToken),
            meta.id,
            ownerToken,
            { indexable, now: EVEN_LATER },
          ),
        ),
      ).toBe('retired')
      expect(await readTemplate(bucket, meta.id)).toEqual({ status: 'retired' })
      expect(versionKeys(meta.id)).toEqual([])
    }
  })

  it('répond « retiré » et non « absent » à une lecture qui croise un retrait', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    expect(
      await readTemplate(
        retiringBeforeVersionRead(meta.id, ownerToken),
        meta.id,
      ),
    ).toEqual({ status: 'retired' })
  })

  it('par le slug, ne répond « retiré » que si le modèle était listé au retrait', async () => {
    const listed = await publishTemplate(bucket, publishInput())
    expect(
      await readTemplateBySlug(
        retiringBeforeVersionRead(listed.meta.id, listed.ownerToken),
        listed.meta.slug,
      ),
    ).toEqual({ status: 'retired' })

    const hidden = await publishTemplate(bucket, publishInput())
    // Masqué puis retiré entre la lecture de la méta et celle de la version.
    const racing: TemplateBucket = {
      async getSnapshot(key, options) {
        if (key === templateVersionKey(hidden.meta.id, 1)) {
          await patchTemplate(bucket, hidden.meta.id, hidden.ownerToken, {
            indexable: false,
          })
          await retireTemplate(bucket, hidden.meta.id, hidden.ownerToken)
        }
        return bucket.getSnapshot(key, options)
      },
      putSnapshot: (key, data, options) =>
        bucket.putSnapshot(key, data, options),
      delete: (key) => bucket.delete(key),
    }
    expect(await readTemplateBySlug(racing, hidden.meta.slug)).toEqual({
      status: 'missing',
    })
  })

  /**
   * Le retrait aboutit entre la lecture de la méta par la mise à jour et
   * l'écriture de sa version 2 : sa suppression des versions passe avant
   * elle. `after` s'exécute juste après le retrait.
   */
  function retireBeforeVersion2(
    id: string,
    token: string,
    after: () => void = () => {},
  ) {
    const realPut = bucket.putSnapshot.bind(bucket)
    vi.spyOn(bucket, 'putSnapshot').mockImplementation(
      async (key, data, options) => {
        if (key === templateVersionKey(id, 2)) {
          await retireTemplate(bucket, id, token, LATER)
          after()
        }
        // L'écriture de sa méta échouerait de toute façon (réseau épuisé).
        if (
          key === templateMetaKey(id) &&
          (data as { version?: number }).version === 2
        ) {
          throw new S3ndError('UPLOAD_FAILED', 'ECONNRESET')
        }
        return realPut(key, data, options)
      },
    )
  }

  it('ne laisse aucune version dans R2 quand une mise à jour croise un retrait réussi', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    retireBeforeVersion2(meta.id, ownerToken)

    expect(
      await storeError(
        updateTemplate(bucket, meta.id, ownerToken, {
          itinerary: japanTrip(),
          now: EVEN_LATER,
        }),
      ),
    ).toBe('retired')
    expect(versionKeys(meta.id)).toEqual([])
    expect(await readTemplateForOperator(bucket, meta.id)).toMatchObject({
      status: 'retired',
      versionsLeft: 0,
    })
  })

  it('lève « versions » si la suppression qui suit échoue, et le retrait rejoué l’efface', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    retireBeforeVersion2(meta.id, ownerToken, breakDeletes)

    expect(
      await storeError(
        updateTemplate(bucket, meta.id, ownerToken, {
          itinerary: japanTrip(),
          now: EVEN_LATER,
        }),
      ),
    ).toBe('versions')
    expect(versionKeys(meta.id)).toEqual([templateVersionKey(meta.id, 2)])

    vi.mocked(bucket.putSnapshot).mockRestore()
    bucket.beforeDelete = null
    await retireTemplate(bucket, meta.id, ownerToken, LATER)
    expect(versionKeys(meta.id)).toEqual([])
    logged.mockRestore()
  })
})

// ── Index en morceaux ─────────────────────────────────────────────────────────

describe('index en morceaux', () => {
  /** Deux ids imposés, dans deux morceaux différents. */
  const IN_K = 'k3x9m2abcdefghjk'
  const IN_2 = '2bcdefghjkmnpqrs'

  /** Ce morceau ne peut plus grandir : la limite de taille de s3nd. */
  function fillShard(key: string): void {
    bucket.beforePut = (written) => {
      if (written === key) {
        throw new S3ndError('FILE_TOO_LARGE', `${written} dépasse maxSize.`)
      }
    }
  }

  it('range chaque modèle dans le morceau du premier caractère de son id', async () => {
    vi.mocked(createTemplateId)
      .mockReturnValueOnce(IN_K)
      .mockReturnValueOnce(IN_2)
    await publishTemplate(bucket, publishInput())
    await publishTemplate(bucket, publishInput({ now: LATER }))

    expect(templateIndexKey(IN_K)).toBe('index/k')
    expect(TEMPLATE_INDEX_KEYS).toHaveLength(32)
    expect(bucket.peek('index/k')).toMatchObject({ entries: [{ id: IN_K }] })
    expect(bucket.peek('index/2')).toMatchObject({ entries: [{ id: IN_2 }] })
    // La lecture fusionne les morceaux, du plus récent au plus ancien.
    expect(await indexIds()).toEqual([IN_2, IN_K])
  })

  it('un morceau plein n’empêche pas un autre de grandir, et lève une alerte qui nomme le modèle', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    fillShard(templateIndexKey(IN_K))
    vi.mocked(createTemplateId)
      .mockReturnValueOnce(IN_K)
      .mockReturnValueOnce(IN_2)

    const blocked = await publishTemplate(bucket, publishInput())
    const other = await publishTemplate(bucket, publishInput({ now: LATER }))

    expect(blocked.meta.id).toBe(IN_K)
    expect(blocked.template.listed).toBe(true)
    expect(await indexIds()).toEqual([other.meta.id])
    expect(logged).toHaveBeenCalledWith(
      expect.stringMatching(
        new RegExp(`^${TEMPLATE_INDEX_FULL_ALERT} .*index/k.*${IN_K}`),
      ),
    )
  })

  it('rattrape par l’opérateur un modèle resté hors d’un morceau plein', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fillShard(templateIndexKey(IN_K))
    vi.mocked(createTemplateId).mockReturnValueOnce(IN_K)
    const { meta } = await publishTemplate(bucket, publishInput())
    expect(await resyncTemplateIndex(bucket, meta.id)).toEqual({
      id: IN_K,
      slug: meta.slug,
      listed: true,
      synced: false,
    })
    expect(await indexIds()).toEqual([])

    // De la place est faite : le rattrapage le remet, par l'id ou le slug.
    bucket.beforePut = null
    expect(await resyncTemplateIndex(bucket, meta.slug)).toMatchObject({
      id: IN_K,
      synced: true,
    })
    expect(await indexIds()).toEqual([IN_K])
    // Rejoué, il ne change rien.
    const puts = bucket.puts.length
    expect(await resyncTemplateIndex(bucket, IN_K)).toMatchObject({
      synced: true,
    })
    expect(bucket.puts.length).toBe(puts)
  })

  it('le rattrapage sort aussi de l’index un modèle masqué, et ignore un modèle inconnu', async () => {
    const { meta } = await publishTemplate(bucket, publishInput())
    // Une ligne restée là alors que la méta dit « masqué ».
    bucket.poke(templateMetaKey(meta.id), {
      ...storedMeta(meta.id),
      indexable: false,
    })
    expect(await resyncTemplateIndex(bucket, meta.id)).toMatchObject({
      listed: false,
      synced: true,
    })
    expect(await indexIds()).toEqual([])
    expect(await resyncTemplateIndex(bucket, createTemplateId())).toBeNull()
    expect(await resyncTemplateIndex(bucket, 'pas-un-slug-7-jours')).toBeNull()
  })

  it('le rattrapage d’un modèle retiré le laisse hors de l’index, sans slug à montrer', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    await retireTemplate(bucket, meta.id, ownerToken)
    for (const ref of [meta.id, meta.slug]) {
      expect(await resyncTemplateIndex(bucket, ref)).toEqual({
        id: meta.id,
        slug: null,
        listed: false,
        synced: true,
      })
    }
    expect(await indexIds()).toEqual([])
  })

  it('ignore une ligne rangée dans un autre morceau que le sien', async () => {
    const { meta } = await publishTemplate(bucket, publishInput())
    const entry = (await readIndex(bucket))[0]
    const elsewhere = TEMPLATE_INDEX_KEYS.find(
      (key) => key !== templateIndexKey(meta.id),
    )!
    bucket.poke(elsewhere, { entries: [{ ...entry, title: 'Périmé' }] })
    expect(await readIndex(bucket)).toEqual([entry])
  })
})

// ── Versions précédentes supprimées à la mise à jour ──────────────────────────

describe('mise à jour : versions précédentes supprimées', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('supprime toutes les versions précédentes, orphelines comprises, une fois la méta écrite', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    // Une mise à jour interrompue a laissé v/2, que la suivante saute.
    bucket.poke(templateVersionKey(meta.id, 2), {
      version: 2,
      title: 'Interrompue',
      itinerary: japanTrip(),
    })
    const deletions: { keys: string[]; metaVersion: number }[] = []
    bucket.beforeDelete = (keys) => {
      deletions.push({ keys, metaVersion: storedMeta(meta.id).version })
    }

    const { meta: next } = await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: japanTrip(),
    })

    expect(next.version).toBe(3)
    // Après la méta : elle désigne déjà la version 3 quand les autres partent.
    expect(deletions).toEqual([
      {
        keys: [templateVersionKey(meta.id, 1), templateVersionKey(meta.id, 2)],
        metaVersion: 3,
      },
    ])
    expect(versionKeys(meta.id)).toEqual([templateVersionKey(meta.id, 3)])
  })

  it('ne laisse en ligne aucune note retirée par une mise à jour', async () => {
    const withNote = () => [
      day(1, { notes: 'Digicode 4471, appeler Kenji' }),
      day(2, { city: 'Kyoto' }),
    ]
    const { meta, ownerToken } = await publishTemplate(
      bucket,
      publishInput({
        itinerary: withNote(),
        options: { includeNotes: true, includePrices: true, privateStays: [] },
      }),
    )
    expect(JSON.stringify(bucket.peek(templateVersionKey(meta.id, 1)))).toMatch(
      /4471/,
    )

    await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: withNote(),
      options: { includeNotes: false, includePrices: true },
    })

    const everything = JSON.stringify(bucket.keys().map((k) => bucket.peek(k)))
    expect(everything).not.toMatch(/4471|Kenji/)
  })

  it('lève « versions » si la suppression échoue : la nouvelle version est en ligne, l’index suit, et la mise à jour rejouée efface tout', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    breakDeletes()
    const longer = [...japanTrip(), day(4, { city: 'Osaka' })]

    const error = await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: longer,
      title: 'Japon et Osaka',
    }).catch((caught: unknown) => caught)

    expect(isTemplateStoreError(error) && error.code).toBe('versions')
    expect(error instanceof Error && error.message).toBe(
      'Le modèle est à jour, mais ses versions précédentes n’ont pas pu être effacées. Réessaie.',
    )
    const current = await readTemplate(bucket, meta.id)
    expect(current.status === 'active' && current.template.version).toBe(2)
    expect((await readIndex(bucket))[0]).toMatchObject({
      id: meta.id,
      title: 'Japon et Osaka',
    })
    expect(versionKeys(meta.id)).toEqual([
      templateVersionKey(meta.id, 1),
      templateVersionKey(meta.id, 2),
    ])

    bucket.beforeDelete = null
    const { meta: retried } = await updateTemplate(
      bucket,
      meta.id,
      ownerToken,
      { itinerary: longer },
    )
    expect(retried.version).toBe(3)
    expect(versionKeys(meta.id)).toEqual([templateVersionKey(meta.id, 3)])
  })

  it('lève « index » d’abord quand l’index et la suppression échouent tous deux', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    breakDeletes()
    breakIndexWrites()

    expect(
      await storeError(
        updateTemplate(bucket, meta.id, ownerToken, { itinerary: [day(1)] }),
      ),
    ).toBe('index')
    expect(await indexIds()).toEqual([meta.id])

    bucket.beforeDelete = null
    bucket.beforePut = null
    await updateTemplate(bucket, meta.id, ownerToken, { itinerary: [day(1)] })
    expect(await indexIds()).toEqual([])
    expect(versionKeys(meta.id)).toEqual([templateVersionKey(meta.id, 3)])
  })

  /**
   * Le bucket, avec une mise à jour complète (méta, puis suppression de la
   * version 1) glissée juste avant la lecture de la version 1.
   */
  function updatingBeforeVersion1Read(
    id: string,
    token: string,
  ): TemplateBucket {
    let pending = true
    return {
      async getSnapshot(key, options) {
        if (pending && key === templateVersionKey(id, 1)) {
          pending = false
          await updateTemplate(bucket, id, token, {
            itinerary: [...japanTrip(), day(4, { city: 'Osaka' })],
          })
        }
        return bucket.getSnapshot(key, options)
      },
      putSnapshot: (key, data, options) =>
        bucket.putSnapshot(key, data, options),
      delete: (key) => bucket.delete(key),
    }
  }

  it('une lecture qui croise une mise à jour suit la nouvelle version, au lieu de répondre 404', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    const byId = await readTemplate(
      updatingBeforeVersion1Read(meta.id, ownerToken),
      meta.id,
    )
    expect(byId.status === 'active' && byId.template).toMatchObject({
      version: 2,
      dayCount: 4,
    })
  })

  it('par le slug aussi, avec le slug que la mise à jour a pris', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    const bySlug = await readTemplateBySlug(
      updatingBeforeVersion1Read(meta.id, ownerToken),
      meta.slug,
    )
    expect(bySlug.status === 'active' && bySlug.template).toMatchObject({
      version: 2,
      slug: 'japon-4-jours-tokyo-kyoto-osaka',
    })
  })

  it('un réglage qui croise une mise à jour répond avec la nouvelle version', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    const { meta: next, template } = await patchTemplate(
      updatingBeforeVersion1Read(meta.id, ownerToken),
      meta.id,
      ownerToken,
      { authorName: 'Léa' },
    )
    expect(next).toMatchObject({ version: 2, authorName: 'Léa' })
    expect(template).toMatchObject({ version: 2, dayCount: 4 })
  })
})

// ── Dates floutées ────────────────────────────────────────────────────────────

describe('dates floutées avant stockage', () => {
  it('recule le voyage par semaines entières : même jour de la semaine, même mois, quantième caché', async () => {
    // Vendredi 12 juin 2026 → vendredi 5 juin 2026.
    const { meta, ownerToken, template } = await publishTemplate(
      bucket,
      publishInput({
        itinerary: [
          day(1, {
            date: '2026-06-12',
            accommodation: {
              id: 'acc-1',
              name: 'Pousada da Alfama',
              address: '',
              bookingUrl: '',
              checkIn: '2026-06-12T15:00',
              checkOut: '2026-06-14T11:00',
            },
          }),
          day(2, { date: '2026-06-13', city: 'Sintra' }),
        ],
        country: 'PT',
      }),
    )
    expect(template.itinerary.map((d) => d.date)).toEqual([
      '2026-06-05',
      '2026-06-06',
    ])
    expect(template.itinerary[0].accommodation).toMatchObject({
      checkIn: '2026-06-05T15:00',
      checkOut: '2026-06-07T11:00',
    })
    expect(meta.tripYear).toBe(2026)
    const everything = JSON.stringify(bucket.keys().map((k) => bucket.peek(k)))
    expect(everything).not.toMatch(/2026-06-1[234]/)

    // Une mise à jour est floutée de même.
    const { template: updated } = await updateTemplate(
      bucket,
      meta.id,
      ownerToken,
      {
        itinerary: [
          day(1, { date: '2027-03-24' }),
          day(2, { date: '2027-03-25' }),
        ],
      },
    )
    expect(updated.itinerary.map((d) => d.date)).toEqual([
      '2027-03-03',
      '2027-03-04',
    ])
    expect(updated.tripYear).toBe(2027)
  })
})

// ── Publication rejouable ─────────────────────────────────────────────────────

describe('publication rejouable : jeton tiré par le téléphone', () => {
  const token = createOwnerToken()
  const hash = createHash('sha256').update(token).digest('hex')

  function ownerKeys(): string[] {
    return bucket.keys().filter((key) => key.startsWith('owners/'))
  }

  function metaKeys(): string[] {
    return bucket.keys().filter((key) => key.endsWith('/meta'))
  }

  function withToken(overrides: Partial<PublishTemplateInput> = {}) {
    return publishInput({ ownerToken: token, ...overrides })
  }

  it('réserve owners/<empreinte> avant toute autre écriture, et rend ce jeton', async () => {
    const result = await publishTemplate(bucket, withToken())

    expect(result.created).toBe(true)
    expect(result.ownerToken).toBe(token)
    expect(bucket.puts[0]).toMatchObject({
      key: templateOwnerKey(hash),
      options: { ifAbsent: true },
    })
    expect(bucket.peek(templateOwnerKey(hash))).toEqual({ id: result.meta.id })
    expect(storedMeta(result.meta.id).ownerTokenHash).toBe(hash)
    expect(
      JSON.stringify(bucket.keys().map((key) => bucket.peek(key))),
    ).not.toContain(token)
    await expect(
      assertTemplateOwner(bucket, result.meta.id, token),
    ).resolves.toBeUndefined()
  })

  it('rejouée avec le même jeton, rend le même modèle sans rien créer', async () => {
    const first = await publishTemplate(bucket, withToken())
    const keys = bucket.keys()
    const writes = bucket.puts.length

    const again = await publishTemplate(
      bucket,
      withToken({ now: LATER, title: 'Autre titre' }),
    )

    expect(again.created).toBe(false)
    expect(again.ownerToken).toBe(token)
    expect(again.meta).toEqual(first.meta)
    expect(again.template).toEqual(first.template)
    expect(bucket.keys()).toEqual(keys)
    // Seule la réservation a été tentée, et refusée.
    expect(bucket.puts.slice(writes).map((put) => put.key)).toEqual([
      templateOwnerKey(hash),
    ])
  })

  it('rend le modèle tel qu’il est en ligne, mises à jour comprises', async () => {
    const first = await publishTemplate(bucket, withToken())
    await updateTemplate(bucket, first.meta.id, token, {
      itinerary: japanTrip().slice(0, 2),
    })
    const again = await publishTemplate(bucket, withToken())
    expect(again.created).toBe(false)
    expect(again.template).toMatchObject({ version: 2, dayCount: 2 })
  })

  it('termine sous le même id une publication interrompue entre sa version et sa méta', async () => {
    let failMeta = true
    bucket.beforePut = (key) => {
      if (failMeta && key.endsWith('/meta')) {
        failMeta = false
        throw new S3ndError('UPLOAD_FAILED', 'ECONNRESET')
      }
    }
    await expect(publishTemplate(bucket, withToken())).rejects.toSatisfy(
      (error) => isS3ndError(error) && error.code === 'UPLOAD_FAILED',
    )
    const { id } = bucket.peek(templateOwnerKey(hash)) as { id: string }
    expect(metaKeys()).toEqual([])
    expect(versionKeys(id)).toEqual([templateVersionKey(id, 1)])

    const retried = await publishTemplate(bucket, withToken())

    expect(retried.created).toBe(true)
    // La version 1 de l'envoi interrompu n'a jamais eu de méta : la suivante
    // prend sa place, et elle est supprimée.
    expect(retried.meta).toMatchObject({
      id,
      version: 2,
      slug: 'japon-3-jours-tokyo-kyoto',
    })
    expect(versionKeys(id)).toEqual([templateVersionKey(id, 2)])
    expect(metaKeys()).toEqual([templateMetaKey(id)])
    expect(await indexIds()).toEqual([id])
    expect(await readTemplate(bucket, id)).toMatchObject({
      status: 'active',
      template: { version: 2 },
    })
  })

  it('une réponse perdue sur la réservation ou la méta ne change ni l’id ni le résultat', async () => {
    loseResponseOnce((key) => key.startsWith('owners/'))
    const lostReservation = await publishTemplate(bucket, withToken())
    expect(lostReservation.created).toBe(true)
    expect(bucket.peek(templateOwnerKey(hash))).toEqual({
      id: lostReservation.meta.id,
    })
    vi.mocked(bucket.putSnapshot).mockRestore()

    bucket.reset()
    loseResponseOnce((key) => key.endsWith('/meta'))
    const lostMeta = await publishTemplate(bucket, withToken())
    expect(lostMeta.created).toBe(true)
    expect(metaKeys()).toEqual([templateMetaKey(lostMeta.meta.id)])
    expect(versionKeys(lostMeta.meta.id)).toEqual([
      templateVersionKey(lostMeta.meta.id, 1),
    ])
  })

  it('deux envois simultanés avec le même jeton ne publient qu’un modèle', async () => {
    const [a, b] = await Promise.all([
      publishTemplate(bucket, withToken()),
      publishTemplate(bucket, withToken()),
    ])

    expect(a.meta.id).toBe(b.meta.id)
    expect([a.created, b.created].sort()).toEqual([false, true])
    expect(a.template).toEqual(b.template)
    expect(metaKeys()).toEqual([templateMetaKey(a.meta.id)])
    expect(versionKeys(a.meta.id)).toEqual([
      templateVersionKey(a.meta.id, storedMeta(a.meta.id).version),
    ])
    expect(await indexIds()).toEqual([a.meta.id])
  })

  it('des jetons différents publient deux modèles', async () => {
    const a = await publishTemplate(bucket, withToken())
    const b = await publishTemplate(
      bucket,
      publishInput({ ownerToken: createOwnerToken() }),
    )
    expect(b.created).toBe(true)
    expect(b.meta.id).not.toBe(a.meta.id)
    expect(b.meta.slug).toBe('japon-3-jours-tokyo-kyoto-2')
    expect(ownerKeys()).toHaveLength(2)
  })

  it('refuse un jeton mal formé, sans rien écrire', async () => {
    for (const ownerToken of ['', 'court', `${token}x`, token.slice(1) + '=']) {
      expect(
        await storeError(publishTemplate(bucket, withToken({ ownerToken }))),
      ).toBe('forbidden')
    }
    expect(bucket.keys()).toEqual([])
  })

  it('le retrait supprime la réservation : republier avec ce jeton crée un nouveau modèle', async () => {
    const first = await publishTemplate(bucket, withToken())
    await retireTemplate(bucket, first.meta.id, token, LATER)
    expect(ownerKeys()).toEqual([])

    const again = await publishTemplate(bucket, withToken())
    expect(again.created).toBe(true)
    expect(again.meta.id).not.toBe(first.meta.id)
  })

  it('un retrait rejoué de l’ancien modèle ne retire pas la réservation du nouveau', async () => {
    const first = await publishTemplate(bucket, withToken())
    await retireTemplate(bucket, first.meta.id, token, LATER)
    const second = await publishTemplate(bucket, withToken())
    expect(bucket.peek(templateOwnerKey(hash))).toEqual({ id: second.meta.id })

    // L'ancien modèle, retiré une seconde fois (même jeton) : sa réservation
    // a déjà été supprimée, celle du nouveau reste.
    await retireTemplate(bucket, first.meta.id, token, EVEN_LATER)
    await retireTemplateAsOperator(bucket, first.meta.id, EVEN_LATER)

    expect(bucket.peek(templateOwnerKey(hash))).toEqual({ id: second.meta.id })
    const replay = await publishTemplate(bucket, withToken())
    expect(replay).toMatchObject({
      created: false,
      meta: { id: second.meta.id },
    })
  })

  it('le retrait par l’opérateur supprime aussi la réservation', async () => {
    const first = await publishTemplate(bucket, withToken())
    await retireTemplateAsOperator(bucket, first.meta.slug, LATER)
    expect(ownerKeys()).toEqual([])
    expect(bucket.keys()).toEqual(
      [
        templateMetaKey(first.meta.id),
        templateIndexKey(first.meta.id),
        templateSlugKey(first.meta.slug),
      ].sort(),
    )
  })

  it('une réservation restée sur un modèle retiré répond « retiré »', async () => {
    const first = await publishTemplate(bucket, withToken())
    const reservation = bucket.peek(templateOwnerKey(hash))
    await retireTemplate(bucket, first.meta.id, token, LATER)
    // La suppression de la réservation n'avait pas abouti.
    bucket.poke(templateOwnerKey(hash), reservation)

    expect(await storeError(publishTemplate(bucket, withToken()))).toBe(
      'retired',
    )
    expect(metaKeys()).toEqual([templateMetaKey(first.meta.id)])
  })

  it('lève sur une réservation illisible au lieu de publier ailleurs', async () => {
    bucket.poke(templateOwnerKey(hash), { id: 'pas-un-id' })
    await expect(publishTemplate(bucket, withToken())).rejects.toThrow(
      /illisible/,
    )
    expect(metaKeys()).toEqual([])
  })
})

// ── Titre par PATCH ───────────────────────────────────────────────────────────

describe('réglages : titre', () => {
  it('renomme sans nouvelle version : la méta, la réponse et l’index suivent', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())

    const { meta: next, template } = await patchTemplate(
      bucket,
      meta.id,
      ownerToken,
      { title: '  Japon \n express  ', now: LATER },
    )

    expect(next).toEqual({
      ...meta,
      title: 'Japon express',
      updatedAt: '2026-11-04T08:30:00.000Z',
    })
    expect(template.title).toBe('Japon express')
    expect(storedMeta(meta.id)).toEqual(next)
    expect(versionKeys(meta.id)).toEqual([templateVersionKey(meta.id, 1)])
    expect((await readIndex(bucket))[0]).toMatchObject({
      title: 'Japon express',
      slug: meta.slug,
    })
  })

  it('tire le titre des étapes de la version publiée s’il est vide ou nul', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    for (const title of ['', '   ', null]) {
      await patchTemplate(bucket, meta.id, ownerToken, { title: 'Provisoire' })
      const { meta: next } = await patchTemplate(bucket, meta.id, ownerToken, {
        title,
      })
      expect(next.title).toBe('Tokyo et Kyoto')
    }
  })

  it('borne le titre sans couper un emoji, comme à la publication', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    const { meta: next } = await patchTemplate(bucket, meta.id, ownerToken, {
      title: `${'a'.repeat(119)}🗾 fin`,
    })
    expect(next.title).toBe('a'.repeat(119))
  })

  it('n’écrit rien quand le titre ne change pas', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    const puts = bucket.puts.length
    const { meta: same } = await patchTemplate(bucket, meta.id, ownerToken, {
      title: ' Deux semaines au Japon ',
      now: LATER,
    })
    expect(same).toEqual(meta)
    expect(bucket.puts.length).toBe(puts)
  })

  it('refuse un modèle retiré', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    await retireTemplate(bucket, meta.id, ownerToken)
    expect(
      await storeError(
        patchTemplate(bucket, meta.id, ownerToken, { title: 'Nouveau' }),
      ),
    ).toBe('retired')
  })
})

// ── Slug qui suit le contenu ──────────────────────────────────────────────────

describe('mise à jour : le slug suit la durée et les trois premières villes', () => {
  function slugKeys(): string[] {
    return bucket.keys().filter((key) => key.startsWith('slugs/'))
  }

  it('garde le slug quand ni la durée ni les trois premières villes ne changent', async () => {
    const { meta, ownerToken } = await publishTemplate(
      bucket,
      publishInput({ itinerary: trip(4) }),
    )
    expect(meta.slug).toBe('japon-4-jours-ville-1-ville-2-ville-3')

    const { meta: next } = await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: trip(4, (n) => (n === 4 ? 'Ailleurs' : `Ville ${n}`)),
    })

    expect(next.slug).toBe(meta.slug)
    expect(slugKeys()).toEqual([templateSlugKey(meta.slug)])
  })

  it('prend un nouveau slug quand la durée change, et l’ancien mène au modèle', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())

    const { meta: next } = await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: [...japanTrip(), day(4, { city: 'Osaka' })],
    })

    expect(next.slug).toBe('japon-4-jours-tokyo-kyoto-osaka')
    expect(slugKeys()).toEqual(
      [templateSlugKey(meta.slug), templateSlugKey(next.slug)].sort(),
    )
    for (const slug of [meta.slug, next.slug]) {
      expect(bucket.peek(templateSlugKey(slug))).toEqual({ id: meta.id })
      const result = await readTemplateBySlug(bucket, slug)
      expect(result.status === 'active' && result.template.slug).toBe(next.slug)
    }
    expect((await readIndex(bucket)).map((entry) => entry.slug)).toEqual([
      next.slug,
    ])
  })

  it('revenir à la durée d’avant reprend le slug d’alors', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: [...japanTrip(), day(4, { city: 'Osaka' })],
    })

    const { meta: back } = await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: japanTrip(),
    })

    expect(back.slug).toBe(meta.slug)
    expect(slugKeys()).toHaveLength(2)
  })

  it('applique au nouveau slug les règles de collision de la publication', async () => {
    const other = await publishTemplate(
      bucket,
      publishInput({ itinerary: [...japanTrip(), day(4, { city: 'Osaka' })] }),
    )
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())

    const { meta: next } = await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: [...japanTrip(), day(4, { city: 'Osaka' })],
    })

    expect(other.meta.slug).toBe('japon-4-jours-tokyo-kyoto-osaka')
    expect(next.slug).toBe('japon-4-jours-tokyo-kyoto-osaka-2')
  })

  it('garde un slug suffixé tant que le contenu le décrit', async () => {
    await publishTemplate(bucket, publishInput())
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    expect(meta.slug).toBe('japon-3-jours-tokyo-kyoto-2')

    const { meta: next } = await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: japanTrip(),
      title: 'Autre titre',
    })

    expect(next.slug).toBe('japon-3-jours-tokyo-kyoto-2')
  })

  it('l’ancien slug reste à ce modèle : une nouvelle publication du même parcours ne le prend pas', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: [...japanTrip(), day(4, { city: 'Osaka' })],
    })

    const newcomer = await publishTemplate(bucket, publishInput())

    expect(newcomer.meta.slug).toBe('japon-3-jours-tokyo-kyoto-2')
    const result = await readTemplateBySlug(bucket, meta.slug)
    expect(result.status === 'active' && result.template.id).toBe(meta.id)
  })

  it('retiré, le modèle répond 410 sur tous ses slugs s’il était listé, 404 sinon', async () => {
    const listed = await publishTemplate(bucket, publishInput())
    const { meta: longer } = await updateTemplate(
      bucket,
      listed.meta.id,
      listed.ownerToken,
      { itinerary: [...japanTrip(), day(4, { city: 'Osaka' })] },
    )
    await retireTemplate(bucket, listed.meta.id, listed.ownerToken)
    for (const slug of [listed.meta.slug, longer.slug]) {
      expect(await readTemplateBySlug(bucket, slug)).toEqual({
        status: 'retired',
      })
    }

    const hidden = await publishTemplate(
      bucket,
      publishInput({ indexable: false, itinerary: trip(2) }),
    )
    const { meta: hiddenLonger } = await updateTemplate(
      bucket,
      hidden.meta.id,
      hidden.ownerToken,
      { itinerary: trip(3) },
    )
    await retireTemplate(bucket, hidden.meta.id, hidden.ownerToken)
    for (const slug of [hidden.meta.slug, hiddenLonger.slug]) {
      expect(await readTemplateBySlug(bucket, slug)).toEqual({
        status: 'missing',
      })
    }
  })
})

// ── Index par pages ───────────────────────────────────────────────────────────

describe('index par pages', () => {
  /** `count` lignes rangées dans leurs morceaux ; trois par minute, pour des égalités. */
  function pokeIndex(count: number) {
    const entries = Array.from({ length: count }, (_, index) => ({
      id: createTemplateId(),
      slug: `japon-2-jours-ville-${index}`,
      title: `Modèle ${index}`,
      country: 'JP',
      dayCount: 2,
      cities: ['Tokyo'],
      updatedAt: new Date(
        Date.UTC(2026, 10, 3, 0, Math.floor(index / 3)),
      ).toISOString(),
    }))
    for (const key of TEMPLATE_INDEX_KEYS) {
      const shard = entries.filter(
        (entry) => templateIndexKey(entry.id) === key,
      )
      if (shard.length > 0) bucket.poke(key, { entries: shard })
    }
    return entries
  }

  it('découpe l’index en pages de 500, dans un ordre stable : plus récent d’abord, puis par id', async () => {
    pokeIndex(1201)
    const all = await readIndex(bucket)
    expect(all).toHaveLength(1201)
    for (let index = 1; index < all.length; index++) {
      const [a, b] = [all[index - 1], all[index]]
      expect(
        a.updatedAt > b.updatedAt ||
          (a.updatedAt === b.updatedAt && a.id < b.id),
      ).toBe(true)
    }

    const pages = [
      await readIndexPage(bucket, 0),
      await readIndexPage(bucket, 1),
      await readIndexPage(bucket, 2),
    ]

    expect(TEMPLATE_INDEX_PAGE_SIZE).toBe(500)
    expect(pages.map((page) => [page.entries.length, page.nextPage])).toEqual([
      [500, 1],
      [500, 2],
      [201, null],
    ])
    expect(pages.flatMap((page) => page.entries)).toEqual(all)
    expect(await readIndexPage(bucket, 3)).toEqual({
      entries: [],
      nextPage: null,
    })
  })

  it('une seule page quand tout tient dedans, même pleine', async () => {
    expect(await readIndexPage(bucket, 0)).toEqual({
      entries: [],
      nextPage: null,
    })
    pokeIndex(500)
    const page = await readIndexPage(bucket, 0)
    expect(page.entries).toHaveLength(500)
    expect(page.nextPage).toBeNull()
  })

  it('refuse une page négative ou non entière', async () => {
    for (const page of [-1, 1.5, Number.NaN]) {
      await expect(readIndexPage(bucket, page)).rejects.toThrow(RangeError)
    }
  })
})

describe('hébergements privés : gardés dans la méta, jamais publiés', () => {
  const ADDRESS = '12 rue des Lilas, 3e étage'
  const KEY = 'cheztantelurdes'

  /** Le Japon, avec les deux premières nuits chez une tante : un logement privé. */
  function tripWithPrivateStay(): DayItinerary[] {
    const trip = japanTrip()
    const stay = {
      id: 'acc-tante',
      name: 'Chez Tante Lurdes',
      address: ADDRESS,
      bookingUrl: 'https://www.google.com/maps/place/12+rue+des+Lilas',
      checkIn: '2026-04-01',
      checkOut: '2026-04-03',
      images: ['https://img.example/porte-lilas.jpg'],
    }
    trip[0] = {
      ...trip[0],
      accommodation: stay,
      tips: ['Le bus 42 s’arrête devant le 12 rue des Lilas'],
    }
    trip[1] = { ...trip[1], accommodation: { ...stay } }
    return trip
  }

  function privateInput(
    overrides: Partial<PublishTemplateInput> = {},
  ): PublishTemplateInput {
    return publishInput({
      itinerary: tripWithPrivateStay(),
      options: { includeNotes: true, includePrices: true, privateStays: [KEY] },
      ...overrides,
    })
  }

  /** Ni l'adresse, ni le lien, ni la photo du logement privé. */
  function expectNoAddress(value: unknown): void {
    expect(JSON.stringify(value).toLowerCase()).not.toContain('lilas')
  }

  it('publie le nom et la ville, jamais l’adresse, et ne renvoie jamais la liste', async () => {
    const { meta, template } = await publishTemplate(bucket, privateInput())

    expect(meta.privateStays).toEqual([KEY])
    expect(storedMeta(meta.id).privateStays).toEqual([KEY])
    expect(template).not.toHaveProperty('privateStays')
    expect(template.itinerary[0].accommodation).toMatchObject({
      name: 'Chez Tante Lurdes',
      address: '',
      bookingUrl: '',
    })
    expect(template.itinerary[0].accommodation).not.toHaveProperty('images')
    expect(template.itinerary[0].city).toBe('Tokyo')
    expectNoAddress(template)
    expectNoAddress(bucket.peek(templateVersionKey(meta.id, 1)))

    const byId = await readTemplate(bucket, meta.id)
    const bySlug = await readTemplateBySlug(bucket, meta.slug)
    for (const read of [byId, bySlug]) {
      expect(read.status).toBe('active')
      expectNoAddress(read)
      expect(JSON.stringify(read)).not.toContain('privateStays')
      expect(JSON.stringify(read)).not.toContain(KEY)
    }
    const index = await readIndex(bucket)
    expect(index.map((entry) => entry.id)).toEqual([meta.id])
    expectNoAddress(index)
    expect(JSON.stringify(index)).not.toContain(KEY)
  })

  it('les réapplique à chaque mise à jour qui ne les renvoie pas', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, privateInput())

    // Sans réglages, puis avec d'autres réglages seulement : la méta décide.
    const plain = await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: tripWithPrivateStay(),
    })
    expect(plain.meta.privateStays).toEqual([KEY])
    expectNoAddress(plain.template)
    expectNoAddress(bucket.peek(templateVersionKey(meta.id, 2)))

    const partial = await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: tripWithPrivateStay(),
      options: { includeNotes: false },
    })
    expect(partial.meta).toMatchObject({
      includesNotes: false,
      privateStays: [KEY],
    })
    expectNoAddress(partial.template)
    expectNoAddress(bucket.peek(templateVersionKey(meta.id, 3)))

    // Une liste envoyée remplace celle de la méta : l'auteur a décoché.
    const cleared = await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: tripWithPrivateStay(),
      options: { privateStays: [] },
    })
    expect(cleared.meta.privateStays).toEqual([])
    expect(storedMeta(meta.id).privateStays).toEqual([])
    expect(cleared.template.itinerary[0].accommodation?.address).toBe(ADDRESS)
  })

  it('garde un à un les réglages publiés qu’une mise à jour n’envoie pas', async () => {
    const { meta, ownerToken } = await publishTemplate(
      bucket,
      publishInput({
        options: { includeNotes: true, includePrices: false, privateStays: [] },
      }),
    )
    const { meta: next } = await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: japanTrip(),
      options: { includeNotes: false },
    })
    expect(next).toMatchObject({ includesNotes: false, includesPrices: false })
  })

  it('refuse une liste mal formée, sans rien écrire', async () => {
    for (const privateStays of [['Chez Marie'], [''], 'chezmarie']) {
      expect(
        await storeError(
          publishTemplate(
            bucket,
            privateInput({
              options: {
                includeNotes: false,
                includePrices: true,
                privateStays: privateStays as string[],
              },
            }),
          ),
        ),
      ).toBe('invalid')
    }
    expect(bucket.keys()).toEqual([])

    const { meta, ownerToken } = await publishTemplate(bucket, privateInput())
    expect(
      await storeError(
        updateTemplate(bucket, meta.id, ownerToken, {
          itinerary: tripWithPrivateStay(),
          options: { privateStays: ['Chez Marie'] },
        }),
      ),
    ).toBe('invalid')
    expect(storedMeta(meta.id)).toMatchObject({
      version: 1,
      privateStays: [KEY],
    })
    expect(versionKeys(meta.id)).toEqual([templateVersionKey(meta.id, 1)])
  })

  it('refuse une mise à jour sans liste quand l’hébergement masqué a été renommé', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, privateInput())
    const renamed = (): DayItinerary[] =>
      tripWithPrivateStay().map((day) =>
        day.accommodation?.id === 'acc-tante'
          ? {
              ...day,
              accommodation: {
                ...day.accommodation,
                name: 'Chez Tante Lurdes & Rui',
              },
            }
          : day,
      )

    // Le téléphone a « oublié » la liste : 409, rien n'est écrit.
    for (const options of [undefined, { includeNotes: false }]) {
      const refused = await updateTemplate(bucket, meta.id, ownerToken, {
        itinerary: renamed(),
        options,
      }).catch((error: unknown) => error)
      expect(isTemplateStoreError(refused) && refused.code).toBe('conflict')
      expect((refused as Error).message).toMatch(/choisis de nouveau/)
    }
    expect(storedMeta(meta.id).version).toBe(1)
    expect(versionKeys(meta.id)).toEqual([templateVersionKey(meta.id, 1)])

    // L'ancienne liste renvoyée telle quelle : écrite, mais signalée — sans
    // dire quelle clé.
    const stale = await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: renamed(),
      options: { privateStays: [KEY] },
    })
    expect(stale.privateStaysUnmatched).toBe(true)
    expect(JSON.stringify(stale.template)).not.toContain(KEY)

    // La liste corrigée : rien à signaler, et l'adresse ne part pas.
    const fixed = await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: renamed(),
      options: { privateStays: ['cheztantelurdes&rui'] },
    })
    expect(fixed.privateStaysUnmatched).toBeUndefined()
    expectNoAddress(fixed.template)
    expect(fixed.meta.privateStays).toEqual(['cheztantelurdes&rui'])

    // Sans renommage, une mise à jour sans liste passe comme avant.
    const plain = await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: renamed(),
    })
    expect(plain.privateStaysUnmatched).toBeUndefined()
    expectNoAddress(plain.template)
  })

  it('refuse (400) un envoi dont la recherche d’adresses dépasserait le plafond, sans rien écrire', async () => {
    const trip = tripWithPrivateStay()
    // 12 millions de caractères face à 3 morceaux (l'adresse, « 12 rue des
    // Lilas », « 3e étage ») : au-delà de `MAX_ADDRESS_SEARCH_WORK`.
    trip[2] = { ...trip[2], tips: Array(12).fill('12 rue '.repeat(150_000)) }
    const refused = await publishTemplate(
      bucket,
      privateInput({ itinerary: trip }),
    ).catch((error: unknown) => error)
    expect(isTemplateStoreError(refused) && refused.code).toBe('invalid')
    expect((refused as Error).message).toMatch(/trop long à vérifier/)
    expect(bucket.keys()).toEqual([])
  })

  it('n’en laisse rien dans la pierre tombale', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, privateInput())
    await retireTemplate(bucket, meta.id, ownerToken, LATER)
    expectErased(meta)
    const everything = JSON.stringify(
      bucket.keys().map((key) => [key, bucket.peek(key)]),
    ).toLowerCase()
    expect(everything).not.toContain(KEY)
    expect(everything).not.toContain('lilas')
  })

  it('lit une méta écrite avant ce champ, mais pas une liste illisible', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    const { privateStays: _keys, ...before } = storedMeta(meta.id)
    bucket.poke(templateMetaKey(meta.id), before)
    expect((await readTemplate(bucket, meta.id)).status).toBe('active')
    const { meta: next } = await updateTemplate(bucket, meta.id, ownerToken, {
      itinerary: japanTrip(),
    })
    expect(next.privateStays).toEqual([])
    expect(storedMeta(meta.id).privateStays).toEqual([])

    for (const privateStays of ['chezmarie', ['Chez Marie'], [1]]) {
      bucket.poke(templateMetaKey(meta.id), {
        ...storedMeta(meta.id),
        privateStays,
      })
      await expect(readTemplate(bucket, meta.id)).rejects.toThrow(/illisibles/)
    }
  })
})
