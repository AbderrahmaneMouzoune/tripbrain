/**
 * Informations légales de TripBrain, en un seul endroit.
 *
 * Elles alimentent les mentions légales et la politique de confidentialité.
 *
 * ⚠️ À COMPLÉTER AVANT MISE EN LIGNE — la loi pour la confiance dans
 * l'économie numérique (art. 6 III LCEN) impose de publier l'identité et
 * l'adresse de l'éditeur, ainsi que celles de l'hébergeur :
 *
 * - `publisher.legalForm` : statut (particulier, micro-entreprise, société…)
 * - `publisher.address`   : adresse postale de l'éditeur
 * - `publisher.email`     : adresse de contact réellement relevée
 * - `publisher.siret`     : numéro d'immatriculation si l'éditeur est une
 *                           entreprise (facultatif pour un particulier)
 *
 * Les champs laissés à `null` ne sont pas affichés : la page reste cohérente,
 * mais elle n'est pas complète tant qu'ils ne sont pas renseignés.
 */

export const legalConfig = {
  /** Date de dernière mise à jour des textes légaux, au format ISO. */
  updatedAt: '2026-09-04',

  product: {
    name: 'TripBrain',
    appUrl: 'https://app.tripbrain.fr',
    siteUrl: 'https://tripbrain.fr',
    repositoryUrl: 'https://github.com/AbderrahmaneMouzoune/tripbrain',
  },

  publisher: {
    name: 'Abderrahmane MOUZOUNE',
    /** Statut juridique de l'éditeur. */
    legalForm: null as string | null,
    address: null as string | null,
    siret: null as string | null,
    email: 'contact@tripbrain.fr',
    website: 'https://abderrahmanemouzoune.com',
    publicationDirector: 'Abderrahmane MOUZOUNE',
  },

  host: {
    name: 'Vercel Inc.',
    address: '440 N Barranca Ave #4133, Covina, CA 91723, États-Unis',
    website: 'https://vercel.com',
  },

  /** Sous-traitants au sens de l'article 28 du RGPD. */
  processors: {
    analytics: {
      name: 'PostHog',
      entity: 'PostHog, Inc.',
      /** Instance européenne : les données ne quittent pas l'Union. */
      region: 'Union européenne — Francfort, Allemagne',
      purpose: "Mesure d'audience anonyme",
      privacyUrl: 'https://posthog.com/privacy',
      dpaUrl: 'https://posthog.com/dpa',
      /** Durée de conservation demandée côté projet PostHog, en mois. */
      retentionMonths: 12,
    },
    hosting: {
      name: 'Vercel',
      entity: 'Vercel Inc.',
      region: 'Union européenne (région de déploiement) et États-Unis',
      purpose: "Hébergement du site et de l'application",
      privacyUrl: 'https://vercel.com/legal/privacy-policy',
    },
    share: {
      name: 'Cloudflare R2',
      entity: 'Cloudflare, Inc.',
      region: 'Union européenne',
      purpose:
        'Dépôt temporaire des partages volumineux, effacé au bout d’une heure',
      privacyUrl: 'https://www.cloudflare.com/privacypolicy/',
    },
  },

  /** Autorité de contrôle compétente pour une réclamation. */
  supervisoryAuthority: {
    name: 'CNIL',
    url: 'https://www.cnil.fr/fr/plaintes',
    address: '3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07',
  },
} as const

export type LegalConfig = typeof legalConfig

/** Date de mise à jour, formatée pour l'affichage. */
export function formatLegalDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
