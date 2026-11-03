/**
 * Liens des itinéraires modèles : ceux que l'auteur partage, et leur lecture
 * à l'arrivée.
 *
 * Deux formes, deux rôles :
 *   • `https://app.tripbrain.fr/m/<id>` — le lien public, permanent, que
 *     l'auteur envoie et que le site vitrine met derrière « Reprendre cet
 *     itinéraire ». Revendiqué par l'app iOS (AASA) et Android (assetlinks) :
 *     il ouvre l'app quand elle est installée, la webapp sinon ;
 *   • `/?modele=<id>` — l'adresse où la page `/m/<id>` bascule côté client,
 *     parce que la reprise ne peut tourner que sur `/`, seul endroit où
 *     vivent `TripProvider` et `NativeHosts`.
 *
 * Volontairement à part de `readIncomingShare` (`share.ts`) : un modèle ne
 * s'importe pas tel quel, il se reprend (dates, jours gardés). Le mêler aux
 * partages l'enverrait dans `ReceiveFlow`, qui n'a rien à en faire.
 *
 * Module pur, sans `window` : il tourne aussi côté serveur (page `/m/[id]`).
 * Conception : `docs/itineraire-modele-technique.md` §6.
 */

import { isTemplateId } from '@/lib/template-model'

/**
 * Origine des liens publics, en dur plutôt que `window.location.origin` comme
 * `getShareCodeUrl` : un lien de modèle est permanent et s'affiche sur
 * tripbrain.fr. Publié depuis une préproduction ou `localhost`, il doit
 * quand même pointer vers la production, la seule que l'app revendique.
 */
export const TEMPLATE_PUBLIC_ORIGIN = 'https://app.tripbrain.fr'

/** `https://app.tripbrain.fr/` → `https://app.tripbrain.fr` : jamais de `//m/`. */
function trimOrigin(origin: string): string {
  return origin.replace(/\/+$/, '')
}

/** Lien public d'un modèle : `https://app.tripbrain.fr/m/<id>`. */
export function getTemplateUrl(
  id: string,
  origin: string = TEMPLATE_PUBLIC_ORIGIN,
): string {
  return `${trimOrigin(origin)}/m/${encodeURIComponent(id)}`
}

/** Adresse de la reprise, sur l'accueil : `https://app.tripbrain.fr/?modele=<id>`. */
export function getTemplateTakeUrl(
  id: string,
  origin: string = TEMPLATE_PUBLIC_ORIGIN,
): string {
  return `${trimOrigin(origin)}/?modele=${encodeURIComponent(id)}`
}

/**
 * Par où le repreneur est arrivé, pour la mesure (`template_opened.via`) :
 * le site vitrine le signale avec `from=site`, tout le reste est un lien.
 */
export type IncomingTemplateVia = 'link' | 'site'

export interface IncomingTemplate {
  templateId: string
  via: IncomingTemplateVia
}

/**
 * Lit le modèle à reprendre dans la query de l'accueil (`?modele=<id>`).
 * Un id qui n'a pas la forme d'un id de modèle ne mène nulle part : `null`,
 * plutôt qu'un appel à l'API voué au 404.
 */
export function readIncomingTemplate(search: string): IncomingTemplate | null {
  const query = new URLSearchParams(search)
  const templateId = query.get('modele')
  if (!isTemplateId(templateId)) return null
  return {
    templateId,
    via: query.get('from') === 'site' ? 'site' : 'link',
  }
}

const TEMPLATE_PATH = /^\/m\/([^/]+)\/?$/

/**
 * Id du modèle d'un chemin `/m/<id>` (ou `/m/<id>/`), sinon `null`. Sert à
 * `parseNativePath`, quand l'app native transmet un lien universel, et à la
 * page `/m/[id]`. Pas de décodage : un id valide ne contient que `[0-9a-z]`.
 */
export function readTemplatePath(pathname: string): string | null {
  const match = TEMPLATE_PATH.exec(pathname)
  const id = match?.[1]
  return isTemplateId(id) ? id : null
}
