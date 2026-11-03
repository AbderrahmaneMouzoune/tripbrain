/**
 * Apple App Site Association : autorise l'app iOS (`applinks:app.tripbrain.fr`)
 * à ouvrir elle-même les liens de partage et d'itinéraire modèle, au lieu de
 * Safari.
 *
 * Servi par une route plutôt que depuis `public/` : un fichier sans extension
 * y partirait en `application/octet-stream`, qu'Apple refuse.
 *
 * Volontairement limité aux liens de partage (`/s/<code>` et `/?code=…`) et
 * aux modèles (`/m/<id>`) : un lien vers les pages légales ou le guide reste
 * dans le navigateur. Apple met ce fichier en cache sur son CDN puis sur les
 * appareils : un chemin ajouté ici met des jours à prendre effet, d'où
 * l'intérêt de le livrer avant la fonctionnalité qui en dépend.
 */

export const dynamic = 'force-static'

const APP_ID = '4P64Q2X454.fr.tripbrain.mobile'

const association = {
  applinks: {
    // Ancien format (iOS 12 et moins), ignoré dès que `details` a des `appIDs`.
    apps: [],
    details: [
      {
        appID: APP_ID,
        appIDs: [APP_ID],
        paths: ['/s/*', '/m/*'],
        components: [
          { '/': '/s/*', comment: 'Lien de partage d’un voyage' },
          { '/': '/m/*', comment: 'Itinéraire modèle' },
          {
            '/': '/',
            '?': { code: '?*' },
            comment: 'Code de partage passé à l’accueil',
          },
        ],
      },
    ],
  },
}

export function GET() {
  return new Response(JSON.stringify(association), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
