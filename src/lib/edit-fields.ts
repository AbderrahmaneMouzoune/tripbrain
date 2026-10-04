/**
 * Description des formulaires d'édition.
 *
 * Chaque entité éditable (jour, activité, transport, hébergement) est décrite
 * par des sections et des champs. `EntityEditSheet` sait rendre et valider ces
 * descripteurs : ajouter une information éditable revient à ajouter une ligne
 * ici, avec le type de contrôle qui correspond vraiment à la donnée.
 *
 * Ce fichier reste sans React : les icônes sont désignées par un nom, associé
 * à un composant dans `src/components/edit/field-icons.ts`.
 */

/** Icônes disponibles pour les choix, champs et sections (voir `field-icons.ts`). */
export type EditFieldIcon =
  | 'camera'
  | 'utensils'
  | 'sparkles'
  | 'shopping-bag'
  | 'train'
  | 'plane'
  | 'bus'
  | 'car'
  | 'clock'
  | 'footprints'
  | 'map-pin'
  | 'ticket'
  | 'wallet'
  | 'list'
  | 'compass'

/** Couleur d'un choix, alignée sur les pastilles de statut du roadbook. */
export type EditFieldTone = 'neutral' | 'info' | 'success' | 'danger'

/**
 * Teinte de l'icône d'une carte de choix ou d'une section : l'œil distingue
 * les catégories avant de lire leur nom.
 */
export type EditAccent =
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'success'
  | 'muted'

export interface EditFieldOption {
  value: string
  label: string
  icon?: EditFieldIcon
  tone?: EditFieldTone
  accent?: EditAccent
}

export type EditFieldType =
  /** Saisie libre courte */
  | 'text'
  /** Saisie libre longue */
  | 'textarea'
  /** Nombre simple */
  | 'number'
  /** Date ISO (`YYYY-MM-DD`) */
  | 'date'
  /** Heure `HH:MM`, avec repli en texte libre si la valeur ne s'y prête pas */
  | 'time'
  /** Lien, avec bouton d'ouverture */
  | 'url'
  /** Adresse postale, avec lien vers la carte */
  | 'address'
  /** Choix unique illustré, présenté en grille de cartes */
  | 'icon-choice'
  /** Choix unique compact, présenté en segments */
  | 'choice'
  /**
   * Choix unique en pastilles ; une valeur hors liste (donnée importée) est
   * conservée et reste sélectionnable.
   */
  | 'chip-choice'
  /** Oui / non */
  | 'switch'
  /** Liste de phrases (points forts, conseils…) */
  | 'lines'
  /** Liste de mots-clés courts */
  | 'chips'
  /** Note sur 5 étoiles */
  | 'rating'
  /** Montant + devise, stockés dans deux propriétés */
  | 'price'
  /** Latitude / longitude */
  | 'coordinates'

export interface EditField {
  /** Clé de la propriété sur l'entité éditée */
  key: string
  label: string
  type: EditFieldType
  /** Section d'appartenance ; la première section est toujours dépliée */
  section?: string
  placeholder?: string
  /** Aide affichée sous le champ */
  hint?: string
  /** Bloque l'enregistrement tant que le champ est vide */
  required?: boolean
  /**
   * Conserve la clé même vide, pour les propriétés non optionnelles du modèle
   * (ex. `Accommodation.bookingUrl`) qu'on ne veut pas rendre obligatoires.
   */
  allowEmpty?: boolean
  /** Demi-largeur : deux champs consécutifs partagent une ligne */
  half?: boolean
  /** Tiers de largeur : trois champs courts (place, porte, terminal) */
  third?: boolean
  /** Icône en tête de la saisie (durée, distance…) */
  icon?: EditFieldIcon
  /** Codes et références : police à chasse fixe, majuscules */
  mono?: boolean
  options?: readonly EditFieldOption[]
  /** Valeurs proposées en un tap, la saisie libre restant possible */
  suggestions?: readonly string[]
  /** Pour un champ `price` : propriété qui stocke la devise */
  currencyKey?: string
  /**
   * Fin d'un intervalle saisi avec ce champ (heure d'arrivée, date de
   * départ) : les deux sont présentés ensemble, avec la durée ou le nombre
   * de nuits calculé, et la fin ne peut pas précéder le début (dates).
   */
  pairWith?: string
  /** Champ échangeable d'un geste avec celui-ci (départ ↔ arrivée) */
  swapWith?: string
  /**
   * Coordonnées : affichées en une ligne de lecture, la saisie ne se déplie
   * qu'à la demande. Elles servent la carte, rarement retouchées à la main.
   */
  folded?: boolean
  /** Pour un champ `price` : dates du séjour, pour annoncer le prix par nuit */
  perNight?: { from: string; to: string }
}

export interface EditSection {
  id: string
  title: string
  /** Texte d'appel de la section quand elle est vide */
  description?: string
  icon?: EditFieldIcon
  accent?: EditAccent
  /**
   * Reste repliée à l'ouverture même si elle est renseignée : son résumé
   * suffit d'ordinaire (coordonnées de la carte).
   */
  collapsed?: boolean
}

export interface EditFormSchema {
  /** Sections dans l'ordre d'affichage ; la première n'est jamais repliée */
  sections: readonly EditSection[]
  fields: readonly EditField[]
  /** Libellé du bouton de suppression d'une entité existante */
  deleteLabel?: string
}

const STAY_STATUS_OPTIONS: readonly EditFieldOption[] = [
  { value: 'planned', label: 'Prévu', tone: 'neutral' },
  { value: 'booked', label: 'Réservé', tone: 'info' },
  { value: 'checked-in', label: 'Enregistré', tone: 'success' },
  { value: 'completed', label: 'Terminé', tone: 'neutral' },
]

export const dayForm: EditFormSchema = {
  sections: [
    { id: 'main', title: 'La journée' },
    {
      id: 'content',
      title: 'Contenu du roadbook',
      description: 'Points forts, plats à goûter, bagages et conseils',
      icon: 'list',
      accent: 'secondary',
    },
    {
      id: 'map',
      title: 'Coordonnées',
      description: 'Servent à centrer la carte sur la journée',
      icon: 'map-pin',
      accent: 'accent',
      collapsed: true,
    },
  ],
  fields: [
    {
      key: 'title',
      label: 'Titre du jour',
      type: 'text',
      section: 'main',
      required: true,
      placeholder: 'Arrivée à Shanghai',
    },
    {
      key: 'city',
      label: 'Ville',
      type: 'text',
      section: 'main',
      required: true,
      half: true,
    },
    {
      key: 'date',
      label: 'Date',
      type: 'date',
      section: 'main',
      required: true,
      half: true,
    },
    {
      key: 'dayType',
      label: 'Type de journée',
      type: 'chip-choice',
      section: 'main',
      options: [
        { value: 'arrival', label: 'Arrivée' },
        { value: 'exploration', label: 'Exploration' },
        { value: 'culture', label: 'Culture' },
        { value: 'nature', label: 'Nature' },
        { value: 'coastal', label: 'Littoral' },
        { value: 'historic', label: 'Historique' },
        { value: 'departure', label: 'Départ' },
      ],
    },
    {
      key: 'walkingDistance',
      label: 'Distance à pied',
      type: 'text',
      section: 'main',
      icon: 'footprints',
      placeholder: '6 km',
      suggestions: ['3 km', '5 km', '8 km', '10 km', '12 km'],
    },
    {
      key: 'notes',
      label: 'Note',
      type: 'textarea',
      section: 'main',
      placeholder: 'Journée tranquille pour gérer le décalage horaire.',
    },
    {
      key: 'highlights',
      label: 'Points forts',
      type: 'lines',
      section: 'content',
      placeholder: 'Skyline du Bund',
    },
    {
      key: 'foodRecommendations',
      label: 'À goûter',
      type: 'lines',
      section: 'content',
      placeholder: 'Xiaolongbao (小笼包)',
    },
    {
      key: 'packingTips',
      label: 'Bagages',
      type: 'lines',
      section: 'content',
      placeholder: 'Chaussures de marche',
    },
    {
      key: 'tips',
      label: 'Conseils',
      type: 'lines',
      section: 'content',
      placeholder: 'Installer Alipay',
    },
    {
      key: 'coordinates',
      label: 'Coordonnées',
      type: 'coordinates',
      section: 'map',
      required: true,
      hint: 'Collez « latitude, longitude » depuis une carte.',
    },
  ],
}

export const activityForm: EditFormSchema = {
  deleteLabel: 'Supprimer l’activité',
  sections: [
    { id: 'main', title: "L'activité" },
    {
      id: 'place',
      title: 'Sur place',
      description: 'Durée, horaires, adresse et repères',
      icon: 'map-pin',
      accent: 'accent',
    },
    {
      id: 'booking',
      title: 'Réservation et budget',
      description: 'Prix, lien de réservation et appréciation',
      icon: 'wallet',
      accent: 'secondary',
    },
  ],
  fields: [
    {
      key: 'name',
      label: 'Nom',
      type: 'text',
      section: 'main',
      required: true,
      placeholder: 'Temple Jing’an',
    },
    {
      key: 'type',
      label: 'Catégorie',
      type: 'icon-choice',
      section: 'main',
      required: true,
      options: [
        { value: 'visit', label: 'Visite', icon: 'camera', accent: 'primary' },
        {
          value: 'food',
          label: 'Restauration',
          icon: 'utensils',
          accent: 'secondary',
        },
        {
          value: 'experience',
          label: 'Expérience',
          icon: 'sparkles',
          accent: 'accent',
        },
        {
          value: 'shopping',
          label: 'Shopping',
          icon: 'shopping-bag',
          accent: 'success',
        },
        {
          value: 'transport',
          label: 'Transport',
          icon: 'train',
          accent: 'muted',
        },
      ],
    },
    {
      key: 'status',
      label: 'Statut',
      type: 'choice',
      section: 'main',
      options: [
        { value: 'planned', label: 'Prévu', tone: 'neutral' },
        { value: 'done', label: 'Fait', tone: 'success' },
        { value: 'skipped', label: 'Passé', tone: 'danger' },
      ],
    },
    {
      key: 'description',
      label: 'Description',
      type: 'textarea',
      section: 'main',
    },
    {
      key: 'duration',
      label: 'Durée',
      type: 'text',
      section: 'place',
      icon: 'clock',
      placeholder: '2h',
      suggestions: ['30m', '1h', '1h30', '2h', '3h', 'Journée'],
    },
    {
      key: 'openAt',
      label: 'Horaires',
      type: 'text',
      section: 'place',
      placeholder: '09:00–17:00',
    },
    { key: 'address', label: 'Adresse', type: 'address', section: 'place' },
    {
      key: 'coordinates',
      label: 'Position sur la carte',
      type: 'coordinates',
      section: 'place',
      folded: true,
    },
    {
      key: 'tags',
      label: 'Tags',
      type: 'chips',
      section: 'place',
      placeholder: 'art, musée…',
    },
    {
      key: 'tips',
      label: 'Astuce',
      type: 'textarea',
      section: 'place',
      placeholder: 'Y aller tôt pour éviter la foule.',
    },
    {
      key: 'price',
      label: 'Prix',
      type: 'price',
      section: 'booking',
      currencyKey: 'currency',
    },
    {
      key: 'rating',
      label: 'Appréciation',
      type: 'rating',
      section: 'booking',
    },
    {
      key: 'reservationRequired',
      label: 'Réservation requise',
      type: 'switch',
      section: 'booking',
    },
    {
      key: 'bookingUrl',
      label: 'Lien de réservation',
      type: 'url',
      section: 'booking',
    },
  ],
}

export const transportForm: EditFormSchema = {
  deleteLabel: 'Supprimer le transport',
  sections: [
    { id: 'main', title: 'Le trajet' },
    {
      id: 'schedule',
      title: 'Horaires et point de départ',
      description: 'Heures, durée et adresse de départ',
      icon: 'clock',
      accent: 'accent',
    },
    {
      id: 'ticket',
      title: 'Billet',
      description: 'Compagnie, place, référence et prix',
      icon: 'ticket',
      accent: 'secondary',
    },
  ],
  fields: [
    {
      key: 'type',
      label: 'Mode de transport',
      type: 'icon-choice',
      section: 'main',
      required: true,
      options: [
        { value: 'train', label: 'Train', icon: 'train', accent: 'accent' },
        { value: 'plane', label: 'Avion', icon: 'plane', accent: 'primary' },
        { value: 'bus', label: 'Bus', icon: 'bus', accent: 'secondary' },
        { value: 'car', label: 'Voiture', icon: 'car', accent: 'success' },
      ],
    },
    {
      key: 'from',
      label: 'De',
      type: 'text',
      section: 'main',
      placeholder: 'Shanghai',
      swapWith: 'to',
    },
    {
      key: 'to',
      label: 'Vers',
      type: 'text',
      section: 'main',
      placeholder: 'Qingdao',
    },
    {
      key: 'details',
      label: 'Détails',
      type: 'text',
      section: 'main',
      placeholder: 'Train G195',
    },
    {
      key: 'status',
      label: 'Statut',
      type: 'choice',
      section: 'main',
      options: STAY_STATUS_OPTIONS,
    },
    {
      key: 'departureTime',
      label: 'Départ',
      type: 'time',
      section: 'schedule',
      pairWith: 'arrivalTime',
    },
    {
      key: 'arrivalTime',
      label: 'Arrivée',
      type: 'time',
      section: 'schedule',
    },
    {
      key: 'duration',
      label: 'Durée',
      type: 'text',
      section: 'schedule',
      icon: 'clock',
      placeholder: '6h19',
      suggestions: ['45m', '1h30', '3h', '6h'],
    },
    {
      key: 'departureAddress',
      label: 'Adresse de départ',
      type: 'address',
      section: 'schedule',
      hint: 'Gare, terminal ou point de rendez-vous.',
    },
    {
      key: 'provider',
      label: 'Compagnie',
      type: 'text',
      section: 'ticket',
      placeholder: 'China Railway',
    },
    {
      key: 'seat',
      label: 'Siège',
      type: 'text',
      section: 'ticket',
      third: true,
      placeholder: '12F',
    },
    {
      key: 'gate',
      label: 'Porte',
      type: 'text',
      section: 'ticket',
      third: true,
      placeholder: '—',
    },
    {
      key: 'terminal',
      label: 'Terminal',
      type: 'text',
      section: 'ticket',
      third: true,
      placeholder: '—',
    },
    {
      key: 'bookingReference',
      label: 'Référence',
      type: 'text',
      section: 'ticket',
      mono: true,
      placeholder: 'Code de réservation',
    },
    {
      key: 'price',
      label: 'Prix',
      type: 'price',
      section: 'ticket',
      currencyKey: 'currency',
    },
    {
      key: 'bookingUrl',
      label: 'Lien du billet',
      type: 'url',
      section: 'ticket',
    },
    {
      key: 'notes',
      label: 'Note',
      type: 'textarea',
      section: 'ticket',
      placeholder: 'Bagage en soute, enregistrement en ligne…',
    },
  ],
}

export const accommodationForm: EditFormSchema = {
  deleteLabel: 'Retirer l’hébergement',
  sections: [
    { id: 'main', title: "L'hébergement" },
    {
      id: 'booking',
      title: 'Réservation',
      description: 'Référence, prix et lien',
      icon: 'wallet',
      accent: 'secondary',
    },
  ],
  fields: [
    {
      key: 'name',
      label: 'Nom',
      type: 'text',
      section: 'main',
      required: true,
      placeholder: 'B&B Jing’an Temple',
    },
    {
      key: 'address',
      label: 'Adresse',
      type: 'address',
      section: 'main',
      allowEmpty: true,
    },
    {
      key: 'checkIn',
      label: 'Arrivée',
      type: 'date',
      section: 'main',
      allowEmpty: true,
      pairWith: 'checkOut',
    },
    {
      key: 'checkOut',
      label: 'Départ',
      type: 'date',
      section: 'main',
      allowEmpty: true,
    },
    {
      key: 'status',
      label: 'Statut',
      type: 'choice',
      section: 'main',
      options: STAY_STATUS_OPTIONS,
    },
    {
      key: 'price',
      label: 'Prix du séjour',
      type: 'price',
      section: 'booking',
      currencyKey: 'currency',
      perNight: { from: 'checkIn', to: 'checkOut' },
    },
    {
      key: 'bookingReference',
      label: 'Référence de réservation',
      type: 'text',
      section: 'booking',
      mono: true,
      placeholder: 'Numéro de commande',
    },
    {
      key: 'bookingUrl',
      label: 'Lien de réservation',
      type: 'url',
      section: 'booking',
      allowEmpty: true,
    },
  ],
}

/** Devises proposées en autocomplétion, la saisie libre restant possible. */
export const CURRENCY_SUGGESTIONS = [
  'EUR',
  'USD',
  'GBP',
  'CHF',
  'CNY',
  'JPY',
  'TWD',
  'THB',
  'VND',
  'KRW',
  'CAD',
  'AUD',
  'MAD',
] as const
