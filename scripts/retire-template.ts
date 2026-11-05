// Retrait d'un itinéraire modèle par l'opérateur : contenu signalé, abus, ou
// auteur qui a perdu son téléphone (et avec lui le jeton qui lui permettait
// de retirer son modèle). Mêmes effets qu'un retrait par l'auteur : pierre
// tombale sans slug, versions supprimées, sortie de l'index public, slugs
// réservés pour toujours mais seulement sous leur empreinte SHA-256 — le slug
// actuel et ceux d'avant une mise à jour, sans que le bucket dise encore quel
// pays, quelle durée ni quelles villes ils portaient. Un ancien slug désigne
// le modèle aussi bien que l'actuel, avant comme après le retrait : la
// commande le hache pour retrouver sa réservation.
//
//   bun --no-env-file scripts/retire-template.ts <id|slug|lien>
//
// Les identifiants R2 de production sont lus dans l'environnement du shell
// (R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY).
// `--no-env-file` empêche Bun de compléter avec un `.env` local.
//
// Code de sortie : 0 si le modèle est retiré, hors de l'index et sans
// aucune version stockée, 1 sinon, 2 si la commande est mal utilisée.
// Rejouer la même commande est sans risque : c'est ainsi qu'on rattrape un
// index qui n'a pas suivi, ou des versions qui n'ont pas été supprimées.
//
// Procédure : docs/modeles-moderation.md

import { fileURLToPath } from 'node:url'
import { getTemplateStore } from '@/lib/template-bucket'
import { isListed, isTemplateId, isTemplateSlug } from '@/lib/template-model'
import {
  isTemplateStoreError,
  readTemplateForOperator,
  retireTemplateAsOperator,
  type OperatorTemplateState,
  type TemplateBucket,
} from '@/lib/template-store'

const USAGE = `Usage : bun --no-env-file scripts/retire-template.ts <id|slug|lien>

  <id>    16 caractères, celui de https://app.tripbrain.fr/m/<id>
  <slug>  celui de https://tripbrain.fr/itineraires/<slug>
  <lien>  l'un ou l'autre lien, en entier

Procédure : docs/modeles-moderation.md`

export interface RetireTemplateDeps {
  /** Le bucket des modèles ; lève si une variable R2 manque. */
  open: () => TemplateBucket
  /** Nom du bucket, affiché pour vérifier qu'on vise bien la production. */
  bucketName: string | undefined
  log: (line: string) => void
  error: (line: string) => void
  now: () => Date
}

/**
 * L'id ou le slug désigné par l'argument : tel quel, ou tiré du dernier
 * segment d'un lien `…/m/<id>` ou `…/itineraires/<slug>`. `null` s'il n'a la
 * forme ni de l'un ni de l'autre.
 */
export function templateRefFromArg(arg: string): string | null {
  let ref = arg.trim()
  if (/^https?:\/\//i.test(ref)) {
    try {
      const segments = new URL(ref).pathname.split('/').filter(Boolean)
      ref = decodeURIComponent(segments.at(-1) ?? '')
    } catch {
      return null
    }
  }
  ref = ref.toLowerCase()
  return isTemplateId(ref) || isTemplateSlug(ref) ? ref : null
}

function index(inIndex: boolean | null): string {
  if (inIndex === null) return 'index public illisible'
  return inIndex ? 'dans l’index public' : 'hors de l’index public'
}

/** Les versions stockées : le contenu de l'auteur, que le retrait efface. */
function versions(left: number | null, retired: boolean): string {
  if (left === null) return 'versions : illisibles'
  if (left === 0)
    return retired ? 'versions : aucune, contenu effacé' : 'versions : aucune'
  return `versions : ${left} ${retired ? 'encore stockée(s)' : 'stockée(s)'}`
}

/** L'état d'un modèle, en quelques lignes lisibles. Jamais l'empreinte du jeton. */
export function describeState(state: OperatorTemplateState): string[] {
  if (state.status === 'missing') return ['introuvable']
  const { inIndex, versionsLeft } = state
  if (state.status === 'retired') {
    const { meta } = state
    // La pierre tombale ne garde aucun slug : l'id seul la désigne.
    return [
      `retiré le ${meta.retiredAt} · ${index(inIndex)}`,
      `id ${meta.id} · version ${meta.version}`,
      versions(versionsLeft, true),
      meta.wasListed
        ? 'était listé : https://tripbrain.fr/itineraires/<slug> répond 410, anciens slugs compris'
        : 'n’était pas listé : https://tripbrain.fr/itineraires/<slug> répond 404, anciens slugs compris',
    ]
  }
  const { meta } = state
  return [
    `en ligne · ${isListed(meta) ? 'listé sur tripbrain.fr' : 'non listé (lien seulement)'} · ${index(inIndex)}`,
    `id ${meta.id} · slug ${meta.slug} · version ${meta.version}`,
    `« ${meta.title} » · ${meta.authorName ?? 'sans prénom'} · ${meta.country} · ${meta.dayCount} jour(s) · ${meta.cities.join(', ')}`,
    `publié le ${meta.publishedAt} · modifié le ${meta.updatedAt}`,
    versions(versionsLeft, false),
  ]
}

function print(
  log: (line: string) => void,
  title: string,
  lines: string[],
): void {
  log(`${title} :`)
  for (const line of lines) log(`  ${line}`)
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** La commande entière ; renvoie le code de sortie. */
export async function retireTemplateCommand(
  args: readonly string[],
  deps: RetireTemplateDeps,
): Promise<number> {
  if (args.length === 1 && (args[0] === '-h' || args[0] === '--help')) {
    deps.log(USAGE)
    return 0
  }
  if (args.length !== 1) {
    deps.error(USAGE)
    return 2
  }
  const ref = templateRefFromArg(args[0])
  if (!ref) {
    deps.error(`« ${args[0]} » n’est ni un id ni un slug de modèle.`)
    deps.error(USAGE)
    return 2
  }

  let bucket: TemplateBucket
  try {
    bucket = deps.open()
  } catch (error) {
    deps.error(`Bucket R2 inaccessible : ${message(error)}`)
    return 1
  }
  deps.log(`Bucket R2 : ${deps.bucketName ?? '?'} (préfixe templates/)`)

  try {
    const before = await readTemplateForOperator(bucket, ref)
    print(deps.log, 'Avant', describeState(before))
    if (before.status === 'missing') {
      deps.error(`Aucun modèle pour « ${ref} ».`)
      return 1
    }
    if (
      before.status === 'active' &&
      isTemplateSlug(ref) &&
      before.meta.slug !== ref
    ) {
      deps.log(
        `« ${ref} » est un ancien slug de ce modèle : son slug actuel est ${before.meta.slug}.`,
      )
    }

    const retirement = await retireTemplateAsOperator(bucket, ref, deps.now())
    deps.log(
      retirement.alreadyRetired
        ? 'Déjà retiré : versions et index revus.'
        : 'Retiré. Ses slugs ne restent réservés que sous leur empreinte.',
    )

    const after = await readTemplateForOperator(bucket, ref)
    print(deps.log, 'Après', describeState(after))
    if (
      after.status !== 'retired' ||
      after.inIndex !== false ||
      after.versionsLeft !== 0
    ) {
      deps.error('Le modèle n’est pas entièrement retiré. Relance la commande.')
      return 1
    }
    return 0
  } catch (error) {
    if (isTemplateStoreError(error) && error.code === 'index') {
      deps.error(
        'La pierre tombale est en place (le modèle répond 410), mais l’index public n’a pas suivi. Relance la même commande.',
      )
    } else if (isTemplateStoreError(error) && error.code === 'versions') {
      deps.error(
        'La pierre tombale est en place (le modèle répond 410), mais ses versions (le contenu de l’auteur) n’ont pas été supprimées. Relance la même commande.',
      )
    } else {
      deps.error(`Échec : ${message(error)}`)
    }
    return 1
  }
}

// Lancé directement (`bun scripts/retire-template.ts …`), pas importé par un test.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  retireTemplateCommand(process.argv.slice(2), {
    open: getTemplateStore,
    bucketName: process.env.R2_BUCKET_NAME,
    log: (line) => console.log(line),
    error: (line) => console.error(line),
    now: () => new Date(),
  }).then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error)
      process.exit(1)
    },
  )
}
