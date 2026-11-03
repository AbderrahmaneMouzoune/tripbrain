import { createHash } from 'node:crypto'
import { isS3ndError } from '@s3nd/core'
import {
  createTemplateId,
  isTemplateSlug,
  type TemplateMeta,
} from '@/lib/template-model'
import {
  TEMPLATE_INDEX_KEY,
  TEMPLATE_SCHEMA_VERSION,
  assertTemplateOwner,
  isTemplateStoreError,
  patchTemplate,
  publishTemplate,
  readIndex,
  readTemplate,
  readTemplateBySlug,
  readTemplateVersion,
  retireTemplate,
  templateMetaKey,
  templateSlugKey,
  templateVersionKey,
  updateTemplate,
  type PublishTemplateInput,
  type TemplateBucket,
  type TemplateStoreErrorCode,
} from '@/lib/template-store'
import { createMemoryTemplateBucket } from './helpers/memory-template-bucket'
import { day, japanTrip, lisbonDay } from './helpers/template-fixtures'

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
    options: { includeNotes: false, includePrices: true },
    indexable: true,
    now: PUBLISHED_AT,
    ...overrides,
  }
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
    if (key !== TEMPLATE_INDEX_KEY || !pending) return
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
    if (key === TEMPLATE_INDEX_KEY) throw new Error('R2 indisponible')
  }
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
        TEMPLATE_INDEX_KEY,
        'slugs/japon-3-jours-tokyo-kyoto',
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
      order.indexOf(TEMPLATE_INDEX_KEY),
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
      publishInput({ options: { includeNotes: true, includePrices: false } }),
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
      if (key === TEMPLATE_INDEX_KEY) throw new Error('R2 indisponible')
    }

    const { meta } = await publishTemplate(bucket, publishInput())

    expect((await readTemplate(bucket, meta.id)).status).toBe('active')
    expect(await readIndex(bucket)).toEqual([])
    expect(logged).toHaveBeenCalled()
  })
})

describe('updateTemplate', () => {
  it('ajoute la version 2 sans toucher la version 1', async () => {
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
      slug: meta.slug,
    })
    expect(updated.template.itinerary).toHaveLength(2)
    const v1 = await readTemplateVersion(bucket, meta.id, 1)
    expect(v1.status === 'active' && v1.itinerary).toHaveLength(3)
    const current = await readTemplate(bucket, meta.id)
    expect(current.status === 'active' && current.template.version).toBe(2)
  })

  it('garde les réglages publiés quand la mise à jour n’en donne pas', async () => {
    const { meta, ownerToken } = await publishTemplate(
      bucket,
      publishInput({ options: { includeNotes: false, includePrices: false } }),
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

    const tombstone = storedMeta(meta.id)
    expect(tombstone).toMatchObject({
      id: meta.id,
      slug: meta.slug,
      title: '',
      authorName: null,
      cities: [],
      retiredAt: '2026-11-04T08:30:00.000Z',
    })
    expect(bucket.keys()).toEqual(
      [
        `${meta.id}/meta`,
        TEMPLATE_INDEX_KEY,
        // Le slug reste réservé : il ne servira jamais à un autre modèle.
        templateSlugKey(meta.slug),
      ].sort(),
    )
    expect(await readIndex(bucket)).toEqual([])
  })

  it('répond « retiré » partout, y compris par son slug', async () => {
    const { meta, ownerToken } = await publishTemplate(bucket, publishInput())
    await retireTemplate(bucket, meta.id, ownerToken)

    expect(await readTemplate(bucket, meta.id)).toEqual({ status: 'retired' })
    expect(await readTemplateVersion(bucket, meta.id, 1)).toEqual({
      status: 'retired',
    })
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
    expect((await readTemplateVersion(bucket, meta.id, 1)).status).toBe(
      'active',
    )
    expect(await readTemplateVersion(bucket, meta.id, 2)).toEqual({
      status: 'missing',
    })
    expect(await readTemplateVersion(bucket, meta.id, 0)).toEqual({
      status: 'missing',
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
    expect(lisbon.meta.slug).toBe('portugal-1-jours-lisbonne')
    expect(await readTemplateBySlug(bucket, lisbon.meta.slug)).toEqual({
      status: 'missing',
    })
    expect(await readTemplateBySlug(bucket, 'japon')).toEqual({
      status: 'missing',
    })
  })

  it('ignore un slug réservé qui pointe vers un autre modèle', async () => {
    const { meta } = await publishTemplate(bucket, publishInput())
    bucket.poke(templateSlugKey('japon-3-jours-tokyo-osaka'), { id: meta.id })
    expect(
      await readTemplateBySlug(bucket, 'japon-3-jours-tokyo-osaka'),
    ).toEqual({ status: 'missing' })
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
    bucket.poke(TEMPLATE_INDEX_KEY, ['pas', 'un', 'index'])
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
      if (key !== TEMPLATE_INDEX_KEY || raced) return
      raced = true
      bucket.poke(TEMPLATE_INDEX_KEY, bucket.peek(TEMPLATE_INDEX_KEY))
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
      if (key === TEMPLATE_INDEX_KEY) {
        bucket.poke(TEMPLATE_INDEX_KEY, bucket.peek(TEMPLATE_INDEX_KEY))
      }
    }

    const { meta } = await publishTemplate(bucket, publishInput())

    expect((await readTemplate(bucket, meta.id)).status).toBe('active')
    expect(
      bucket.puts.filter((put) => put.key === TEMPLATE_INDEX_KEY),
    ).toHaveLength(6)
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('5 conflits'))
  })

  it('ne réécrit pas un index illisible', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    bucket.poke(TEMPLATE_INDEX_KEY, ['pas', 'un', 'index'])
    await publishTemplate(bucket, publishInput())
    expect(bucket.peek(TEMPLATE_INDEX_KEY)).toEqual(['pas', 'un', 'index'])
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
    expect(JSON.stringify(bucket.peek(TEMPLATE_INDEX_KEY))).not.toContain(
      'Mon Japon secret',
    )
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
    bucket.poke(TEMPLATE_INDEX_KEY, { pas: 'un index' })
    expect(await storeError(retireTemplate(bucket, meta.id, ownerToken))).toBe(
      'index',
    )
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
