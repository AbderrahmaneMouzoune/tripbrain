/**
 * Adresse publique du site, telle qu'elle doit apparaître dans les métadonnées.
 *
 * Next en a besoin pour transformer les images Open Graph en URLs absolues :
 * sans elle, un lien partagé s'affiche sans aperçu dans les messageries.
 */

/** Domaine de production, utilisé dès qu'aucun environnement ne dit mieux. */
const PRODUCTION_URL = 'https://app.tripbrain.fr'

export function getSiteUrl(): URL {
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured) return new URL(configured)

  // Sur une préproduction Vercel, l'aperçu doit pointer vers ce déploiement-là
  // et non vers la production, sinon l'image montrée n'est pas celle testée.
  const vercelUrl = process.env.VERCEL_URL
  if (process.env.VERCEL_ENV !== 'production' && vercelUrl) {
    return new URL(`https://${vercelUrl}`)
  }

  return new URL(PRODUCTION_URL)
}
