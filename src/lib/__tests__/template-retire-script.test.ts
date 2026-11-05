import { S3ndError } from '@s3nd/core'
import { resyncTemplateIndexCommand } from '../../../scripts/resync-template-index'
import {
  retireTemplateCommand,
  templateRefFromArg,
  type RetireTemplateDeps,
} from '../../../scripts/retire-template'
import {
  isTemplateIndexKey,
  retireTemplate,
  templateIndexKey,
  templateOwnerKey,
  publishTemplate,
  readIndex,
  readTemplate,
  readTemplateBySlug,
  updateTemplate,
} from '@/lib/template-store'
import { createOwnerToken, hashOwnerToken } from '@/lib/template-token'
import { createMemoryTemplateBucket } from './helpers/memory-template-bucket'
import { day, japanTrip } from './helpers/template-fixtures'

const bucket = createMemoryTemplateBucket()
const LATER = new Date('2026-11-04T08:30:00.000Z')

interface Run {
  code: number
  out: string
  err: string
}

async function run(
  args: string[],
  overrides: Partial<RetireTemplateDeps> = {},
): Promise<Run> {
  const out: string[] = []
  const err: string[] = []
  const code = await retireTemplateCommand(args, {
    open: () => bucket,
    bucketName: 'tripbrain-prod',
    log: (line) => out.push(line),
    error: (line) => err.push(line),
    now: () => LATER,
    ...overrides,
  })
  return { code, out: out.join('\n'), err: err.join('\n') }
}

/** Les versions encore stockées d'un modèle : le contenu de son auteur. */
function versionKeys(id: string): string[] {
  return bucket.keys().filter((key) => key.startsWith(`${id}/v/`))
}

function publish(indexable = true, ownerToken?: string) {
  return publishTemplate(bucket, {
    ...(ownerToken ? { ownerToken } : {}),
    itinerary: japanTrip(),
    title: 'Deux semaines au Japon',
    authorName: 'Yanis',
    country: 'JP',
    options: { includeNotes: false, includePrices: true, privateStays: [] },
    indexable,
    now: new Date('2026-11-03T10:00:00.000Z'),
  })
}

beforeEach(() => {
  bucket.reset()
})

describe('templateRefFromArg', () => {
  it('lit un id, un slug, ou l’un ou l’autre lien', () => {
    expect(templateRefFromArg('k3x9m2abcdefghjk')).toBe('k3x9m2abcdefghjk')
    expect(templateRefFromArg('  K3X9M2ABCDEFGHJK ')).toBe('k3x9m2abcdefghjk')
    expect(templateRefFromArg('japon-3-jours-tokyo-kyoto')).toBe(
      'japon-3-jours-tokyo-kyoto',
    )
    expect(
      templateRefFromArg(
        'https://app.tripbrain.fr/m/k3x9m2abcdefghjk?from=site',
      ),
    ).toBe('k3x9m2abcdefghjk')
    expect(
      templateRefFromArg(
        'https://tripbrain.fr/itineraires/japon-3-jours-tokyo-kyoto/',
      ),
    ).toBe('japon-3-jours-tokyo-kyoto')
  })

  it('refuse ce qui n’est ni un id ni un slug de modèle', () => {
    for (const arg of [
      '',
      'japon',
      '../index',
      'https://tripbrain.fr/itineraires',
      'https://%',
    ]) {
      expect(templateRefFromArg(arg)).toBeNull()
    }
  })
})

describe('scripts/retire-template.ts', () => {
  it('refuse de tourner sans argument, ou avec plusieurs', async () => {
    for (const args of [[], ['a', 'b']]) {
      const { code, err } = await run(args)
      expect(code).toBe(2)
      expect(err).toContain('Usage')
    }
    expect(bucket.puts).toEqual([])
  })

  it('refuse un argument qui n’est ni un id ni un slug', async () => {
    const { code, err } = await run(['japon'])
    expect(code).toBe(2)
    expect(err).toContain('n’est ni un id ni un slug')
  })

  it('affiche l’aide sans rien toucher', async () => {
    const { code, out } = await run(['--help'])
    expect(code).toBe(0)
    expect(out).toContain('docs/modeles-moderation.md')
  })

  it('échoue sans les identifiants R2', async () => {
    const { code, err } = await run(['k3x9m2abcdefghjk'], {
      open: () => {
        throw new Error('Variable d’environnement manquante : R2_BUCKET_NAME')
      },
    })
    expect(code).toBe(1)
    expect(err).toContain('R2_BUCKET_NAME')
  })

  it('échoue sur un modèle introuvable, sans rien écrire', async () => {
    const { code, err } = await run(['k3x9m2abcdefghjk'])
    expect(code).toBe(1)
    expect(err).toContain('Aucun modèle')
    expect(bucket.puts).toEqual([])
  })

  it('retire un modèle désigné par le lien de sa page, et montre l’état avant et après', async () => {
    const { meta } = await publish()

    const { code, out, err } = await run([
      `https://tripbrain.fr/itineraires/${meta.slug}`,
    ])

    expect(err).toBe('')
    expect(code).toBe(0)
    expect(out).toContain('tripbrain-prod')
    expect(out).toMatch(
      /Avant :\n {2}en ligne · listé sur tripbrain\.fr · dans l’index public/,
    )
    expect(out).toContain('« Deux semaines au Japon » · Yanis · JP')
    expect(out).toMatch(
      /Après :\n {2}retiré le 2026-11-04T08:30:00\.000Z · hors de l’index public/,
    )
    expect(out).toContain('répond 410')
    expect(out).toContain('versions : 1 stockée(s)')
    expect(out).toContain('versions : aucune, contenu effacé')
    expect(out).not.toContain(meta.ownerTokenHash)
    expect(versionKeys(meta.id)).toEqual([])
    // La pierre tombale ne garde aucun slug : « Après » ne peut plus le montrer,
    // et le bucket ne le contient plus, ni en clé ni en valeur.
    const after = out.slice(out.indexOf('Après :'))
    expect(after).not.toContain(meta.slug)
    expect(after).toContain(`id ${meta.id} · version 1`)
    for (const key of bucket.keys()) {
      expect(key).not.toContain(meta.slug)
      expect(JSON.stringify(bucket.peek(key))).not.toContain(meta.slug)
    }

    expect(await readTemplate(bucket, meta.id)).toEqual({ status: 'retired' })
    expect(await readTemplateBySlug(bucket, meta.slug)).toEqual({
      status: 'retired',
    })
    expect(await readIndex(bucket)).toEqual([])
  })

  it('retire un modèle par un ancien slug, le signale, et le retire sur tous ses slugs', async () => {
    const token = createOwnerToken()
    const { meta } = await publish(true, token)
    const { meta: longer } = await updateTemplate(bucket, meta.id, token, {
      itinerary: [...japanTrip(), day(4, { city: 'Osaka' })],
    })

    const { code, out, err } = await run([
      `https://tripbrain.fr/itineraires/${meta.slug}`,
    ])

    expect(err).toBe('')
    expect(code).toBe(0)
    expect(out).toContain(
      `« ${meta.slug} » est un ancien slug de ce modèle : son slug actuel est ${longer.slug}.`,
    )
    expect(out).toContain('répond 410, anciens slugs compris')
    for (const slug of [meta.slug, longer.slug]) {
      expect(await readTemplateBySlug(bucket, slug)).toEqual({
        status: 'retired',
      })
      // Retiré, il se retrouve encore par chacun : la commande le hache.
      const again = await run([`https://tripbrain.fr/itineraires/${slug}`])
      expect(again.code).toBe(0)
      expect(again.out).toContain('Déjà retiré')
      expect(again.out).not.toContain('ancien slug')
    }
    // La réservation de sa publication part avec ses versions.
    expect(bucket.keys()).not.toContain(templateOwnerKey(hashOwnerToken(token)))
    expect(versionKeys(meta.id)).toEqual([])
  })

  it('retire un modèle non listé désigné par son lien /m/<id>', async () => {
    const { meta } = await publish(false)
    const { code, out } = await run([`https://app.tripbrain.fr/m/${meta.id}`])
    expect(code).toBe(0)
    expect(out).toContain('non listé (lien seulement)')
    expect(out).toContain('répond 404')
    expect(await readTemplate(bucket, meta.id)).toEqual({ status: 'retired' })
  })

  it('échoue quand l’index ne suit pas, et la même commande rejouée aboutit', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { meta } = await publish()
    bucket.beforePut = (key) => {
      if (isTemplateIndexKey(key)) throw new Error('R2 indisponible')
    }

    const failed = await run([meta.id])
    expect(failed.code).toBe(1)
    expect(failed.err).toContain('Relance la même commande')
    expect(await readTemplate(bucket, meta.id)).toEqual({ status: 'retired' })

    bucket.beforePut = null
    const retried = await run([meta.id])
    expect(retried.code).toBe(0)
    expect(retried.out).toContain('Déjà retiré')
    expect(await readIndex(bucket)).toEqual([])
    vi.restoreAllMocks()
  })

  it('échoue quand les versions ne sont pas supprimées, et la même commande rejouée efface le contenu', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { meta } = await publish()
    bucket.beforeDelete = () => {
      throw new Error('R2 indisponible')
    }

    const failed = await run([meta.slug])
    expect(failed.code).toBe(1)
    expect(failed.out).not.toContain('Retiré.')
    expect(failed.out).not.toContain('Déjà retiré')
    expect(failed.err).toContain('ses versions (le contenu de l’auteur)')
    expect(failed.err).toContain('Relance la même commande')
    expect(await readTemplate(bucket, meta.id)).toEqual({ status: 'retired' })
    expect(versionKeys(meta.id)).toEqual([`${meta.id}/v/1`])

    bucket.beforeDelete = null
    const retried = await run([meta.slug])
    expect(retried.err).toBe('')
    expect(retried.code).toBe(0)
    expect(retried.out).toContain('Déjà retiré')
    expect(retried.out).toMatch(
      /Avant :\n {2}retiré le .*\n.*\n {2}versions : 1 encore stockée\(s\)/,
    )
    expect(retried.out).toMatch(
      /Après :\n.*\n.*\n {2}versions : aucune, contenu effacé/,
    )
    expect(versionKeys(meta.id)).toEqual([])
    vi.restoreAllMocks()
  })

  it('échoue si une version reste stockée alors que le retrait n’a rien signalé', async () => {
    const { meta } = await publish()
    // Une suppression qui répond sans rien supprimer : seule la vérification
    // finale peut s'en apercevoir.
    const silent = { ...bucket, delete: async () => {} }

    const { code, out, err } = await run([meta.id], { open: () => silent })

    expect(code).toBe(1)
    expect(out).toContain('Retiré.')
    expect(out).toContain('versions : 1 encore stockée(s)')
    expect(err).toContain('pas entièrement retiré')
    expect(versionKeys(meta.id)).toEqual([`${meta.id}/v/1`])
  })
})

describe('scripts/resync-template-index.ts', () => {
  async function resync(args: string[]): Promise<Run> {
    const out: string[] = []
    const err: string[] = []
    const code = await resyncTemplateIndexCommand(args, {
      open: () => bucket,
      bucketName: 'tripbrain-prod',
      log: (line) => out.push(line),
      error: (line) => err.push(line),
    })
    return { code, out: out.join('\n'), err: err.join('\n') }
  }

  it('remet dans l’index les modèles restés hors d’un morceau plein, par id, slug ou lien', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    bucket.beforePut = (key) => {
      if (isTemplateIndexKey(key)) {
        throw new S3ndError('FILE_TOO_LARGE', `${key} dépasse maxSize.`)
      }
    }
    const first = await publish()
    const second = await publish()
    expect(await readIndex(bucket)).toEqual([])

    // Toujours plein : la commande le dit, et sort en 1.
    const stillFull = await resync([first.meta.id])
    expect(stillFull.code).toBe(1)
    expect(stillFull.err).toContain('l’index n’a pas suivi')

    bucket.beforePut = null
    const done = await resync([
      first.meta.id,
      `https://tripbrain.fr/itineraires/${second.meta.slug}`,
    ])
    expect(done.code).toBe(0)
    expect(done.out).toContain('Bucket R2 : tripbrain-prod')
    expect(done.out).toContain(
      `${first.meta.id} · ${first.meta.slug} : dans l’index public`,
    )
    expect((await readIndex(bucket)).map((entry) => entry.id).sort()).toEqual(
      [first.meta.id, second.meta.id].sort(),
    )
    expect(bucket.keys()).toContain(templateIndexKey(first.meta.id))
    vi.restoreAllMocks()
  })

  it('refuse un argument mal formé ou absent, et signale un modèle introuvable', async () => {
    expect((await resync([])).code).toBe(2)
    expect((await resync(['pas un id'])).code).toBe(2)
    const missing = await resync(['k3x9m2abcdefghjk'])
    expect(missing.code).toBe(1)
    expect(missing.err).toContain('introuvable')
  })

  it('montre un modèle retiré par son id seul : il n’a plus de slug lisible', async () => {
    const token = createOwnerToken()
    const { meta } = await publish(true, token)
    await retireTemplate(bucket, meta.id, token, LATER)
    const done = await resync([`https://tripbrain.fr/itineraires/${meta.slug}`])
    expect(done.code).toBe(0)
    expect(done.out).toContain(
      `${meta.id} (retiré) : hors de l’index public (non listé ou retiré)`,
    )
    expect(done.out).not.toContain(meta.slug)
  })
})
