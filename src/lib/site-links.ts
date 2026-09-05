/**
 * Adresses du site vitrine, depuis l'application.
 *
 * L'itinéraire se prépare sur `tripbrain.fr` et se vit dans l'app : sans lien
 * entre les deux, quelqu'un qui ouvre l'application sans voyage n'a aucun
 * moyen de savoir où le fabriquer. Les URL sont donc regroupées ici, comme
 * `siteConfig` les regroupe de l'autre côté.
 */

/** Site vitrine — l'app, elle, vit sur `app.tripbrain.fr` (voir `site-url.ts`). */
export const MARKETING_SITE_URL = 'https://tripbrain.fr'

/** Générateur d'itinéraire : le formulaire, le prompt, puis le retour ici. */
const GENERATOR_PATH = '/generateur-itineraire'

/** D'où part le renvoi vers le générateur — repris tel quel dans la mesure. */
export type GeneratorSurface = 'onboarding' | 'share_dialog' | 'import_guide'

/**
 * URL du générateur, marquée de l'endroit d'où l'on vient.
 *
 * Les `utm_*` sont les seuls paramètres que le filtre de mesure du site laisse
 * passer : ils disent quelle entrée de l'app amène des visiteurs, sans rien
 * transporter du voyage.
 */
export function getGeneratorUrl(surface: GeneratorSurface): string {
  return `${MARKETING_SITE_URL}${GENERATOR_PATH}?utm_source=app&utm_medium=${surface}`
}
