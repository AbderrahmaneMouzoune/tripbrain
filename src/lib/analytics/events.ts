/**
 * Catalogue des événements de mesure d'audience.
 *
 * C'est la liste exhaustive de ce que TripBrain observe, et elle sert de
 * contrat technique : `trackEvent` refuse un nom qui n'y figure pas, et le
 * filtre `before_send` refait la même vérification juste avant l'envoi.
 *
 * Les propriétés sont volontairement pauvres — des compteurs, des booléens et
 * des choix dans une liste fermée. Aucune ne peut transporter un contenu de
 * voyage : ni ville, ni hôtel, ni note, ni nom de document, ni code de partage,
 * ni texte saisi. C'est ce qui garantit que la mesure ne sert qu'à comprendre
 * les parcours dans l'interface.
 */

/** Une propriété est soit un choix fermé, soit un compteur, soit un oui/non. */
export type PropertySpec =
  | { readonly kind: 'enum'; readonly values: readonly string[] }
  | { readonly kind: 'count' }
  | { readonly kind: 'flag' }

export interface EventDefinition {
  /** Ce que l'événement raconte, repris dans la politique de confidentialité. */
  readonly description: string
  readonly properties: Readonly<Record<string, PropertySpec>>
}

export type EventCatalog = Readonly<Record<string, EventDefinition>>

/** Choix dans une liste fermée : la valeur envoyée ne peut être qu'une de celles-ci. */
function choice<const V extends string>(
  ...values: V[]
): { readonly kind: 'enum'; readonly values: readonly V[] } {
  return { kind: 'enum', values }
}

/** Nombre entier positif : un volume, jamais une valeur saisie. */
function count(): { readonly kind: 'count' } {
  return { kind: 'count' }
}

/** Oui/non : la présence d'une chose, pas la chose elle-même. */
function flag(): { readonly kind: 'flag' } {
  return { kind: 'flag' }
}

export const analyticsEvents = {
  app_opened: {
    description:
      "Ouverture de l'application : installée ou dans le navigateur, avec ou sans voyage chargé.",
    properties: {
      display_mode: choice('browser', 'standalone'),
      has_trip: flag(),
      is_demo: flag(),
    },
  },
  onboarding_viewed: {
    description: "Affichage de l'écran d'accueil, faute de voyage enregistré.",
    properties: {},
  },
  trip_imported: {
    description:
      "Un voyage vient d'être chargé, et par quel chemin : fichier, partage ou démo.",
    properties: {
      source: choice('json', 'xlsx', 'csv', 'share_qr', 'share_code', 'demo'),
      days_count: count(),
      activities_count: count(),
    },
  },
  trip_import_failed: {
    description:
      "Un chargement de voyage a échoué, avec la nature de l'échec (jamais le fichier).",
    properties: {
      source: choice('json', 'xlsx', 'csv', 'share_qr', 'share_code', 'demo'),
      reason: choice(
        'invalid_format',
        'empty_file',
        'network_error',
        'not_found',
        'unknown',
      ),
    },
  },
  demo_exited: {
    description: 'Sortie du voyage de démonstration.',
    properties: {},
  },
  day_changed: {
    description:
      'Passage à une autre journée, et par quel geste : utile pour savoir si la navigation est trouvée.',
    properties: {
      method: choice('swipe', 'arrow', 'timeline', 'bottom_nav', 'map'),
      direction: choice('next', 'previous', 'jump'),
    },
  },
  view_changed: {
    description: 'Bascule entre le roadbook et les documents.',
    properties: {
      view: choice('roadbook', 'documents'),
      surface: choice('tabs', 'bottom_nav', 'timeline'),
    },
  },
  map_opened: {
    description: 'Ouverture de la carte du voyage.',
    properties: {},
  },
  map_closed: {
    description: 'Fermeture de la carte.',
    properties: {},
  },
  edit_mode_started: {
    description: 'Entrée en mode édition du roadbook.',
    properties: {},
  },
  edit_changes_saved: {
    description:
      "Fin d'une session d'édition avec enregistrement, et volume de modifications.",
    properties: { changes_count: count() },
  },
  edit_changes_discarded: {
    description: "Fin d'une session d'édition avec retour en arrière.",
    properties: { changes_count: count() },
  },
  entity_edited: {
    description:
      "Nature d'une modification dans le roadbook : quel type d'élément, quelle opération.",
    properties: {
      entity: choice('day', 'activity', 'transport', 'accommodation'),
      action: choice('create', 'update', 'delete', 'reorder'),
    },
  },
  share_opened: {
    description: 'Ouverture du panneau « Partager & données ».',
    properties: {},
  },
  share_created: {
    description:
      'Un partage a été fabriqué : QR code autonome ou code déposé le temps du transfert.',
    properties: {
      method: choice('qr_inline', 'server_code'),
      days_count: count(),
    },
  },
  share_failed: {
    description: "Échec de la fabrication d'un partage, avec sa cause.",
    properties: {
      method: choice('qr_inline', 'server_code'),
      reason: choice('too_large', 'network_error', 'unavailable', 'unknown'),
    },
  },
  share_link_sent: {
    description:
      'Ouverture de la feuille de partage du système pour envoyer le lien du voyage, et ce qu’elle a donné.',
    properties: { outcome: choice('shared', 'dismissed', 'unavailable') },
  },
  share_import_started: {
    description: "Tentative de récupération d'un partage reçu.",
    properties: { source: choice('code', 'prompt', 'payload') },
  },
  share_import_completed: {
    description: 'Un partage reçu a été enregistré sur cet appareil.',
    properties: {
      source: choice('code', 'prompt', 'payload'),
      days_count: count(),
    },
  },
  share_import_failed: {
    description: "Échec de la récupération d'un partage, avec sa cause.",
    properties: {
      source: choice('code', 'prompt', 'payload'),
      reason: choice(
        'invalid_code',
        'expired',
        'invalid_payload',
        'network_error',
        'unknown',
      ),
    },
  },
  calendar_exported: {
    description: 'Export du voyage ou d’une journée vers un calendrier.',
    properties: { scope: choice('trip', 'day') },
  },
  document_added: {
    description:
      'Ajout de documents : combien, et de quelle famille de fichier — jamais leur nom ni leur contenu.',
    properties: {
      count: count(),
      kind: choice('pdf', 'image', 'other', 'mixed'),
    },
  },
  document_opened: {
    description: "Consultation d'un document depuis l'espace documents.",
    properties: { kind: choice('pdf', 'image', 'other') },
  },
  document_downloaded: {
    description: "Téléchargement d'un document vers l'appareil.",
    properties: { kind: choice('pdf', 'image', 'other', 'archive') },
  },
  document_deleted: {
    description: "Suppression d'un document.",
    properties: {},
  },
  documents_searched: {
    description:
      'Une recherche a eu lieu dans les documents, et a donné ou non des résultats. Le texte cherché reste sur l’appareil.',
    properties: { has_results: flag() },
  },
  data_cleared: {
    description: "Effacement des données du voyage depuis l'application.",
    properties: { surface: choice('share_dialog', 'demo_banner') },
  },
  pwa_installed: {
    description: "Installation de l'application sur l'appareil.",
    properties: {},
  },
  legal_page_viewed: {
    description: "Consultation d'une page légale.",
    properties: {
      page: choice('mentions-legales', 'politique-de-confidentialite'),
    },
  },
  analytics_consent_updated: {
    description:
      'Choix exprimé sur la mesure d’audience, et depuis quel écran. Un refus n’est enregistré que localement.',
    properties: {
      status: choice('granted', 'denied'),
      surface: choice('banner', 'settings', 'privacy_page'),
    },
  },
} as const satisfies EventCatalog

export type AnalyticsEventName = keyof typeof analyticsEvents

/**
 * Type de la valeur attendue pour une propriété. Volontairement sans contrainte
 * sur `S` : l'indexation du catalogue produit un type que TypeScript ne sait
 * pas ramener à `PropertySpec`, alors que les branches, elles, le vérifient.
 */
type SpecValue<S> = S extends {
  kind: 'enum'
  values: readonly (infer V)[]
}
  ? V
  : S extends { kind: 'count' }
    ? number
    : S extends { kind: 'flag' }
      ? boolean
      : never

export type EventProperties<N extends AnalyticsEventName> = {
  [K in keyof (typeof analyticsEvents)[N]['properties']]: SpecValue<
    (typeof analyticsEvents)[N]['properties'][K]
  >
}

/** Les événements sans propriété se déclarent sans second argument. */
export type TrackArgs<N extends AnalyticsEventName> =
  keyof EventProperties<N> extends never ? [] : [EventProperties<N>]

export function isAnalyticsEventName(
  name: string,
): name is AnalyticsEventName & string {
  return Object.hasOwn(analyticsEvents, name)
}
