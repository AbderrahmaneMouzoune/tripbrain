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

/**
 * D'où arrive un itinéraire à importer : un code saisi (`prompt`), un code déjà
 * connu (`code`), un itinéraire embarqué dans l'URL (`payload`), ou le
 * générateur du site vitrine (`generator`), qui emprunte le même chemin.
 */
const SHARE_IMPORT_SOURCE = choice('code', 'prompt', 'payload', 'generator')

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
      source: choice(
        'json',
        'xlsx',
        'csv',
        'share_qr',
        'share_code',
        'demo',
        'generator',
      ),
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
  trip_switched: {
    description:
      'Passage à un autre voyage enregistré sur l’appareil, depuis « Mes voyages ».',
    properties: {},
  },
  trip_renamed: {
    description:
      'Un voyage a été renommé depuis « Mes voyages ». Le nouveau nom reste sur l’appareil.',
    properties: {},
  },
  trip_duplicated: {
    description: 'Copie d’un voyage enregistré, depuis « Mes voyages ».',
    properties: {},
  },
  trip_deleted: {
    description:
      'Suppression d’un voyage depuis « Mes voyages », avec ses documents.',
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
    description:
      'Passage d’un onglet à l’autre : aujourd’hui, programme, carte ou documents.',
    properties: {
      view: choice('today', 'program', 'map', 'documents'),
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
  quick_actions_opened: {
    description:
      "Ouverture du menu d'appui long sur un élément du roadbook : dit si le geste est trouvé, et sur quel type d'élément.",
    properties: {
      entity: choice('day', 'activity', 'transport', 'accommodation'),
    },
  },
  quick_action_used: {
    description:
      "Action lancée depuis le menu d'appui long : la famille d'action, jamais ce sur quoi elle a porté.",
    properties: {
      entity: choice('day', 'activity', 'transport', 'accommodation'),
      action: choice(
        'edit',
        'create',
        'status',
        'move',
        'copy',
        'open',
        'delete',
      ),
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
    properties: { source: SHARE_IMPORT_SOURCE },
  },
  share_import_completed: {
    description: 'Un partage reçu a été enregistré sur cet appareil.',
    properties: {
      source: SHARE_IMPORT_SOURCE,
      days_count: count(),
    },
  },
  share_import_failed: {
    description: "Échec de la récupération d'un partage, avec sa cause.",
    properties: {
      source: SHARE_IMPORT_SOURCE,
      reason: choice(
        'invalid_code',
        'expired',
        'invalid_payload',
        'network_error',
        'unknown',
      ),
    },
  },
  generator_opened: {
    description:
      "Départ vers le générateur d'itinéraire du site, et depuis quel écran de l'app.",
    properties: {
      surface: choice(
        'onboarding',
        'share_dialog',
        'import_guide',
        'generator_fallback',
      ),
    },
  },
  generator_started: {
    description:
      "Lancement d'une génération d'itinéraire dans l'app, et par quelle voie : phrase libre ou questionnaire.",
    properties: { mode: choice('express', 'brief') },
  },
  generator_completed: {
    description:
      "Fin d'une génération d'itinéraire dans l'app, avec le nombre de journées obtenues.",
    properties: { mode: choice('express', 'brief'), days_count: count() },
  },
  generator_failed: {
    description:
      "Échec d'une génération ou d'un affinage d'itinéraire, avec sa cause (jamais le texte du voyage).",
    properties: {
      step: choice('generate', 'refine'),
      reason: choice(
        'not_configured',
        'rate_limited',
        'overloaded',
        'refused',
        'invalid_json',
        'invalid_request',
        'network',
        'unknown',
      ),
    },
  },
  generator_refined: {
    description:
      'Décision sur un affinage proposé par le générateur : appliqué ou annulé, et combien de changements il comptait.',
    properties: { applied: flag(), changes_count: count() },
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
  document_link_changed: {
    description:
      'Un document a été rattaché à autre chose : tout le voyage, une journée, un trajet ou un hébergement — jamais lesquels.',
    properties: {
      target: choice('trip', 'day', 'transport', 'accommodation', 'activity'),
    },
  },
  document_shared: {
    description:
      'Partage d’un document vers une autre app du téléphone, ou repli sur le téléchargement quand le partage n’existe pas.',
    properties: {
      kind: choice('pdf', 'image', 'other'),
      method: choice('share', 'download'),
    },
  },
  image_cache_cleared: {
    description:
      'Les photos enregistrées pour le hors-ligne ont été effacées depuis l’écran « Disponible hors ligne ».',
    properties: {},
  },
  preference_changed: {
    description:
      'Un réglage de l’appareil a été activé ou désactivé (rappels, Wi-Fi seulement, astuces, thème).',
    properties: {
      setting: choice(
        'notify_transport_eve',
        'notify_morning',
        'notify_check_in',
        'wifi_only',
        'tips_reset',
        'theme_light',
        'theme_dark',
        'theme_system',
      ),
      enabled: flag(),
    },
  },
  notification_permission_requested: {
    description:
      'Demande d’autorisation des notifications depuis les réglages, et la réponse du navigateur.',
    properties: { result: choice('granted', 'denied', 'default') },
  },
  reminder_shown: {
    description:
      'Un rappel local s’est affiché sur l’appareil : veille d’un trajet, programme du matin ou check-in.',
    properties: { kind: choice('transport_eve', 'morning', 'check_in') },
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
  directions_opened: {
    description:
      "Ouverture d'un itinéraire vers un lieu du voyage (activité, gare, hébergement), et depuis quel écran — jamais le lieu.",
    properties: {
      target: choice('activity', 'transport', 'accommodation', 'city'),
      surface: choice(
        'today',
        'day',
        'activity',
        'transport',
        'accommodation',
        'map',
      ),
    },
  },
  contextual_tip_closed: {
    description:
      'Fermeture d’une astuce contextuelle : comprise, ou toutes les astuces passées d’un coup.',
    properties: {
      tip: choice('long_press', 'swipe_days', 'documents'),
      outcome: choice('acknowledged', 'skipped_all'),
    },
  },
  driver_mode_opened: {
    description:
      'Ouverture du mode chauffeur (adresse du logement en très grand), avec ou sans écran maintenu allumé.',
    properties: {
      wake_lock: flag(),
    },
  },
  location_requested: {
    description:
      'Demande de la position sur la carte, et sa réponse. La position elle-même ne quitte jamais l’appareil.',
    properties: {
      outcome: choice('granted', 'denied', 'unavailable'),
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
