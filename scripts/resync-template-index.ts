// Rattrapage de l'index public des modèles par l'opérateur : remet dans la
// liste de tripbrain.fr (sitemap, pages pays) des modèles listés restés
// dehors pendant qu'un morceau d'index était plein (alerte
// `template_index_full` dans les journaux Vercel, qui nomme chaque id). Ne
// touche à rien d'autre que l'index : ni méta, ni version, ni slug.
//
//   bun --no-env-file scripts/resync-template-index.ts <id|slug|lien>…
//
// Mêmes variables R2 de production que `scripts/retire-template.ts`.
//
// Code de sortie : 0 si chaque modèle a sa ligne accordée à sa méta (dans
// l'index s'il est listé, hors de l'index sinon), 1 sinon, 2 si la commande
// est mal utilisée. Rejouer la même commande est sans risque.
//
// Procédure : docs/modeles-moderation.md §5

import { fileURLToPath } from 'node:url'
import { getTemplateStore } from '@/lib/template-bucket'
import {
  resyncTemplateIndex,
  type IndexResync,
  type TemplateBucket,
} from '@/lib/template-store'
import { templateRefFromArg } from './retire-template'

const USAGE = `Usage : bun --no-env-file scripts/resync-template-index.ts <id|slug|lien>…

  Un ou plusieurs modèles : leur id (16 caractères), leur slug, ou l'un de
  leurs liens en entier. Les ids viennent de l'alerte template_index_full.

Procédure : docs/modeles-moderation.md §5`

export interface ResyncTemplateIndexDeps {
  /** Le bucket des modèles ; lève si une variable R2 manque. */
  open: () => TemplateBucket
  /** Nom du bucket, affiché pour vérifier qu'on vise bien la production. */
  bucketName: string | undefined
  log: (line: string) => void
  error: (line: string) => void
}

/** `<id> · <slug>`, ou l'id seul pour un modèle retiré : il n'a plus de slug lisible. */
function label(result: IndexResync): string {
  return result.slug ? `${result.id} · ${result.slug}` : `${result.id} (retiré)`
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** La commande entière ; renvoie le code de sortie. */
export async function resyncTemplateIndexCommand(
  args: readonly string[],
  deps: ResyncTemplateIndexDeps,
): Promise<number> {
  if (args.length === 1 && (args[0] === '-h' || args[0] === '--help')) {
    deps.log(USAGE)
    return 0
  }
  if (args.length === 0) {
    deps.error(USAGE)
    return 2
  }
  const refs: string[] = []
  for (const arg of args) {
    const ref = templateRefFromArg(arg)
    if (!ref) {
      deps.error(`« ${arg} » n’est ni un id ni un slug de modèle.`)
      deps.error(USAGE)
      return 2
    }
    refs.push(ref)
  }

  let bucket: TemplateBucket
  try {
    bucket = deps.open()
  } catch (error) {
    deps.error(`Bucket R2 inaccessible : ${message(error)}`)
    return 1
  }
  deps.log(`Bucket R2 : ${deps.bucketName ?? '?'} (préfixe templates/)`)

  let failures = 0
  for (const ref of refs) {
    try {
      const result = await resyncTemplateIndex(bucket, ref)
      if (!result) {
        deps.error(`${ref} : introuvable.`)
        failures += 1
      } else if (!result.synced) {
        deps.error(
          `${label(result)} : l’index n’a pas suivi (morceau encore plein ?). Relance après avoir libéré de la place.`,
        )
        failures += 1
      } else {
        deps.log(
          `${label(result)} : ${result.listed ? 'dans l’index public' : 'hors de l’index public (non listé ou retiré)'}`,
        )
      }
    } catch (error) {
      deps.error(`${ref} : échec : ${message(error)}`)
      failures += 1
    }
  }
  return failures === 0 ? 0 : 1
}

// Lancé directement (`bun scripts/resync-template-index.ts …`), pas importé par un test.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  resyncTemplateIndexCommand(process.argv.slice(2), {
    open: getTemplateStore,
    bucketName: process.env.R2_BUCKET_NAME,
    log: (line) => console.log(line),
    error: (line) => console.error(line),
  }).then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error)
      process.exit(1)
    },
  )
}
