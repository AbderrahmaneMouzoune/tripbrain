// Bucket des itinéraires modèles — serveur uniquement.
//
// Mêmes identifiants R2 que le partage (`share-store.ts`), mais un handle à
// part, sous le préfixe `templates/` :
// - les modèles ne vivent pas sous `shares/`, où une règle de cycle de vie
//   visant les codes d'une heure les emporterait ;
// - `delete()` de s3nd n'accepte pas de préfixe par appel : seul un handle
//   dédié supprime bien sous `templates/`.

import { createBucket } from '@s3nd/core'
import { r2Connection } from '@/lib/share-store'
import type { TemplateBucket } from '@/lib/template-store'

/**
 * Taille maximale d'un snapshot, après gzip. L'API accepte 2 Mo d'itinéraire
 * compressé (msgpack + deflate) ; le serveur le stocke en JSON, plus bavard
 * même une fois gzippé — d'où la marge.
 */
export const TEMPLATE_MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024

let store: TemplateBucket | null = null

/**
 * Créé à la première requête : une variable d'environnement manquante fait
 * échouer la requête (503), pas le build.
 */
export function getTemplateStore(): TemplateBucket {
  if (!store) {
    store = createBucket({
      ...r2Connection(),
      prefix: 'templates',
      maxSize: TEMPLATE_MAX_SNAPSHOT_BYTES,
    })
  }
  return store
}
