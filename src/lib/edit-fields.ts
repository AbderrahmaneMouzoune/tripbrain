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

/** Icônes disponibles pour les choix illustrés (voir `field-icons.ts`). */
export type EditFieldIcon =
  | 'camera'
  | 'utensils'
  | 'sparkles'
  | 'shopping-bag'
  | 'train'
  | 'plane'
  | 'bus'
  | 'car'

/** Couleur d'un choix, alignée sur les pastilles de statut du roadbook. */
export type EditFieldTone = 'neutral' | 'info' | 'success' | 'danger'

export interface EditFieldOption {
  value: string
  label: string
  icon?: EditFieldIcon
  tone?: EditFieldTone
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
  /** Demi-largeur sur écran large */
  half?: boolean
  options?: readonly EditFieldOption[]
  /** Valeurs proposées en un tap, la saisie libre restant possible */
  suggestions?: readonly string[]
  /** Pour un champ `price` : propriété qui stocke la devise */
  currencyKey?: string
}

export interface EditSection {
  id: string
  title: string
  /** Résumé affiché quand la section est repliée */
  description?: string
}

export interface EditFormSchema {
  /** Sections dans l'ordre d'affichage ; la première n'est jamais repliée */
  sections: readonly EditSection[]
  fields: readonly EditField[]
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
      type: 'text',
      section: 'main',
      half: true,
      placeholder: 'exploration',
      suggestions: [
        'arrival',
        'exploration',
        'culture',
        'nature',
        'coastal',
        'historic',
        'departure',
      ],
    },
    {
      key: 'walkingDistance',
      label: 'Distance à pied',
      type: 'text',
      section: 'main',
      half: true,
      placeholder: '6 km',
      suggestions: ['3 km', '5 km', '8 km', '10 km', '12 km'],
    },
    {
      key: 'coordinates',
      label: 'Coordonnées',
      type: 'coordinates',
      section: 'main',
      required: true,
      hint: 'Servent à centrer la carte sur la journée.',
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
  ],
}

export const activityForm: EditFormSchema = {
  sections: [
    { id: 'main', title: "L'activité" },
    {
      id: 'place',
      title: 'Sur place',
      description: 'Durée, horaires, adresse et repères',
    },
    {
      id: 'booking',
      title: 'Réservation et budget',
      description: 'Prix, lien de réservation et appréciation',
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
        { value: 'visit', label: 'Visite', icon: 'camera' },
        { value: 'food', label: 'Restauration', icon: 'utensils' },
        { value: 'experience', label: 'Expérience', icon: 'sparkles' },
        { value: 'shopping', label: 'Shopping', icon: 'shopping-bag' },
        { value: 'transport', label: 'Transport', icon: 'train' },
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
      half: true,
      placeholder: '2h',
      suggestions: ['30m', '1h', '1h30', '2h', '3h', 'Journée'],
    },
    {
      key: 'openAt',
      label: 'Horaires',
      type: 'text',
      section: 'place',
      half: true,
      placeholder: '09:00–17:00',
    },
    { key: 'address', label: 'Adresse', type: 'address', section: 'place' },
    {
      key: 'coordinates',
      label: 'Coordonnées',
      type: 'coordinates',
      section: 'place',
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
      half: true,
      currencyKey: 'currency',
    },
    {
      key: 'rating',
      label: 'Appréciation',
      type: 'rating',
      section: 'booking',
      half: true,
    },
    {
      key: 'reservationRequired',
      label: 'Réservation requise',
      type: 'switch',
      section: 'booking',
      half: true,
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
  sections: [
    { id: 'main', title: 'Le trajet' },
    {
      id: 'schedule',
      title: 'Horaires et point de départ',
      description: 'Heures, durée et adresse de départ',
    },
    {
      id: 'ticket',
      title: 'Billet',
      description: 'Compagnie, place, référence et prix',
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
        { value: 'train', label: 'Train', icon: 'train' },
        { value: 'plane', label: 'Avion', icon: 'plane' },
        { value: 'bus', label: 'Bus', icon: 'bus' },
        { value: 'car', label: 'Voiture', icon: 'car' },
      ],
    },
    {
      key: 'status',
      label: 'Statut',
      type: 'choice',
      section: 'main',
      options: STAY_STATUS_OPTIONS,
    },
    {
      key: 'from',
      label: 'Départ',
      type: 'text',
      section: 'main',
      half: true,
      placeholder: 'Shanghai',
    },
    {
      key: 'to',
      label: 'Arrivée',
      type: 'text',
      section: 'main',
      half: true,
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
      key: 'departureTime',
      label: 'Heure de départ',
      type: 'time',
      section: 'schedule',
      half: true,
    },
    {
      key: 'arrivalTime',
      label: "Heure d'arrivée",
      type: 'time',
      section: 'schedule',
      half: true,
    },
    {
      key: 'duration',
      label: 'Durée',
      type: 'text',
      section: 'schedule',
      half: true,
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
      half: true,
      placeholder: 'China Railway',
    },
    {
      key: 'bookingReference',
      label: 'Référence',
      type: 'text',
      section: 'ticket',
      half: true,
    },
    {
      key: 'seat',
      label: 'Place',
      type: 'text',
      section: 'ticket',
      half: true,
      placeholder: '12F',
    },
    {
      key: 'gate',
      label: 'Porte',
      type: 'text',
      section: 'ticket',
      half: true,
    },
    {
      key: 'terminal',
      label: 'Terminal',
      type: 'text',
      section: 'ticket',
      half: true,
    },
    {
      key: 'price',
      label: 'Prix',
      type: 'price',
      section: 'ticket',
      half: true,
      currencyKey: 'currency',
    },
    {
      key: 'bookingUrl',
      label: 'Lien du billet',
      type: 'url',
      section: 'ticket',
    },
    { key: 'notes', label: 'Note', type: 'textarea', section: 'ticket' },
  ],
}

export const accommodationForm: EditFormSchema = {
  sections: [
    { id: 'main', title: "L'hébergement" },
    {
      id: 'booking',
      title: 'Réservation',
      description: 'Référence, prix et lien',
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
      half: true,
    },
    {
      key: 'checkOut',
      label: 'Départ',
      type: 'date',
      section: 'main',
      allowEmpty: true,
      half: true,
    },
    {
      key: 'status',
      label: 'Statut',
      type: 'choice',
      section: 'main',
      options: STAY_STATUS_OPTIONS,
    },
    {
      key: 'bookingReference',
      label: 'Référence',
      type: 'text',
      section: 'booking',
      half: true,
    },
    {
      key: 'price',
      label: 'Prix du séjour',
      type: 'price',
      section: 'booking',
      half: true,
      currencyKey: 'currency',
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
