/**
 * Digital Asset Links : autorise l'app Android (`fr.tripbrain.mobile`) à
 * ouvrir elle-même les liens `app.tripbrain.fr`, au lieu du navigateur —
 * l'équivalent Android du fichier AASA d'Apple.
 *
 * L'app déclare ses liens avec `autoVerify` ; Android vérifie alors, à
 * l'installation et à chaque mise à jour, que ce fichier nomme bien le
 * certificat qui a signé l'app. Sans lui (404 jusqu'ici), la vérification
 * échoue et même les liens de partage `/s/<code>` s'ouvrent dans le
 * navigateur.
 *
 * Les empreintes viennent de `ANDROID_CERT_FINGERPRINTS` (voir `.env.example`)
 * et non du code : elles dépendent des clés de signature (Play, EAS), que le
 * dépôt ne connaît pas. Sans empreinte valable, la route répond `[]` : un
 * fichier valide qui n'autorise rien, plutôt qu'une déclaration incomplète.
 *
 * Attention : contrairement à l'AASA, ce fichier ne choisit pas les chemins.
 * Ce sont les filtres d'intention de l'app qui le font, et ils revendiquent
 * aujourd'hui tout le domaine — pages légales et guide compris.
 */

// Lue à chaque requête plutôt qu'au build : le fichier suit la configuration
// du déploiement qui le sert, même si le build a tourné sans la variable. Il
// n'est demandé qu'à l'installation de l'app : le coût est nul.
export const dynamic = 'force-dynamic'

const PACKAGE_NAME = 'fr.tripbrain.mobile'

/** SHA-256 d'un certificat, tel qu'Android l'écrit : 32 octets `AB:CD:…`. */
const CERT_FINGERPRINT = /^[0-9A-F]{2}(?::[0-9A-F]{2}){31}$/

/**
 * Empreintes séparées par des virgules, nettoyées et mises en majuscules.
 * Une empreinte mal formée ne correspond à aucun certificat : elle est
 * écartée, et signalée dans les journaux — sinon les liens Android cesseraient
 * de marcher sans que rien ne dise pourquoi.
 */
function certFingerprints(raw: string | undefined): string[] {
  const values = (raw ?? '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean)
  const valid = values.filter((value) => CERT_FINGERPRINT.test(value))
  if (valid.length < values.length) {
    console.warn(
      `ANDROID_CERT_FINGERPRINTS : ${values.length - valid.length} empreinte(s) ignorée(s), format attendu AB:CD:… (32 octets en hexadécimal).`,
    )
  }
  return [...new Set(valid)]
}

export function GET() {
  const fingerprints = certFingerprints(process.env.ANDROID_CERT_FINGERPRINTS)
  const statements =
    fingerprints.length === 0
      ? []
      : [
          {
            relation: ['delegate_permission/common.handle_all_urls'],
            target: {
              namespace: 'android_app',
              package_name: PACKAGE_NAME,
              sha256_cert_fingerprints: fingerprints,
            },
          },
        ]
  return new Response(JSON.stringify(statements), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
