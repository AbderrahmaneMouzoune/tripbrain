/**
 * Apple App Site Association : autorise l'app iOS (`applinks:app.tripbrain.fr`)
 * à ouvrir elle-même les liens de partage, au lieu de Safari.
 *
 * Servi par une route plutôt que depuis `public/` : un fichier sans extension
 * y partirait en `application/octet-stream`, qu'Apple refuse.
 *
 * Volontairement limité aux liens de partage (`/s/<code>` et `/?code=…`) :
 * un lien vers les pages légales ou le guide reste dans le navigateur.
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
        paths: ['/s/*'],
        components: [
          { '/': '/s/*', comment: 'Lien de partage d’un voyage' },
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
