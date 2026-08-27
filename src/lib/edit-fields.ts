/**
 * Description des formulaires d'édition.
 *
 * Chaque entité éditable (jour, activité, transport, hébergement) est décrite
 * par une liste de champs. `EntityEditSheet` sait rendre et valider ces
 * descripteurs : ajouter une information éditable = ajouter une ligne ici.
 */

export type EditFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'select'
  | 'switch'
  | 'list'
  | 'coordinates'

export interface EditFieldOption {
  value: string
  label: string
}

export interface EditField {
  /** Clé de la propriété sur l'entité éditée */
  key: string
  label: string
  type: EditFieldType
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
}

const STAY_STATUS_OPTIONS = [
  { value: 'planned', label: 'Prévu' },
  { value: 'booked', label: 'Réservé' },
  { value: 'checked-in', label: 'Enregistré' },
  { value: 'completed', label: 'Terminé' },
] as const

export const dayFields: readonly EditField[] = [
  { key: 'title', label: 'Titre du jour', type: 'text', required: true },
  { key: 'city', label: 'Ville', type: 'text', required: true, half: true },
  { key: 'date', label: 'Date', type: 'date', required: true, half: true },
  {
    key: 'dayType',
    label: 'Type de journée',
    type: 'text',
    placeholder: 'arrival, transit, exploration…',
    half: true,
  },
  {
    key: 'walkingDistance',
    label: 'Distance à pied',
    type: 'text',
    placeholder: '6 km',
    half: true,
  },
  {
    key: 'coordinates',
    label: 'Coordonnées',
    type: 'coordinates',
    required: true,
    hint: 'Utilisées pour centrer la carte sur la journée.',
  },
  { key: 'notes', label: 'Note', type: 'textarea' },
  { key: 'highlights', label: 'Points forts', type: 'list' },
  { key: 'foodRecommendations', label: 'À goûter', type: 'list' },
  { key: 'packingTips', label: 'Bagages', type: 'list' },
  { key: 'tips', label: 'Conseils', type: 'list' },
]

export const activityFields: readonly EditField[] = [
  { key: 'name', label: 'Nom', type: 'text', required: true },
  {
    key: 'type',
    label: 'Catégorie',
    type: 'select',
    required: true,
    half: true,
    options: [
      { value: 'visit', label: 'Visite' },
      { value: 'transport', label: 'Transport' },
      { value: 'food', label: 'Restauration' },
      { value: 'experience', label: 'Expérience' },
      { value: 'shopping', label: 'Shopping' },
    ],
  },
  {
    key: 'status',
    label: 'Statut',
    type: 'select',
    half: true,
    options: [
      { value: 'planned', label: 'Prévu' },
      { value: 'done', label: 'Fait' },
      { value: 'skipped', label: 'Passé' },
    ],
  },
  { key: 'description', label: 'Description', type: 'textarea' },
  {
    key: 'duration',
    label: 'Durée',
    type: 'text',
    placeholder: '2h',
    half: true,
  },
  {
    key: 'openAt',
    label: 'Horaires',
    type: 'text',
    placeholder: '09:00–17:00',
    half: true,
  },
  { key: 'address', label: 'Adresse', type: 'text' },
  { key: 'coordinates', label: 'Coordonnées', type: 'coordinates' },
  { key: 'price', label: 'Prix', type: 'number', half: true },
  {
    key: 'currency',
    label: 'Devise',
    type: 'text',
    placeholder: 'EUR',
    half: true,
  },
  {
    key: 'rating',
    label: 'Note',
    type: 'number',
    placeholder: '4.5',
    half: true,
  },
  {
    key: 'reservationRequired',
    label: 'Réservation requise',
    type: 'switch',
    half: true,
  },
  { key: 'bookingUrl', label: 'Lien de réservation', type: 'text' },
  { key: 'tags', label: 'Tags', type: 'list' },
  { key: 'tips', label: 'Astuce', type: 'textarea' },
]

export const transportFields: readonly EditField[] = [
  {
    key: 'type',
    label: 'Mode',
    type: 'select',
    required: true,
    half: true,
    options: [
      { value: 'train', label: 'Train' },
      { value: 'plane', label: 'Avion' },
      { value: 'bus', label: 'Bus' },
      { value: 'car', label: 'Voiture' },
    ],
  },
  {
    key: 'status',
    label: 'Statut',
    type: 'select',
    half: true,
    options: STAY_STATUS_OPTIONS,
  },
  { key: 'from', label: 'Départ', type: 'text', half: true },
  { key: 'to', label: 'Arrivée', type: 'text', half: true },
  {
    key: 'details',
    label: 'Détails',
    type: 'text',
    placeholder: 'Train G195',
  },
  { key: 'departureAddress', label: 'Adresse de départ', type: 'text' },
  {
    key: 'departureTime',
    label: 'Heure de départ',
    type: 'text',
    placeholder: '07:53',
    half: true,
  },
  {
    key: 'arrivalTime',
    label: "Heure d'arrivée",
    type: 'text',
    placeholder: '14:12',
    half: true,
  },
  {
    key: 'duration',
    label: 'Durée',
    type: 'text',
    placeholder: '6h19',
    half: true,
  },
  {
    key: 'provider',
    label: 'Compagnie',
    type: 'text',
    placeholder: 'China Railway',
    half: true,
  },
  { key: 'seat', label: 'Place', type: 'text', half: true },
  { key: 'gate', label: 'Porte', type: 'text', half: true },
  { key: 'terminal', label: 'Terminal', type: 'text', half: true },
  {
    key: 'bookingReference',
    label: 'Référence',
    type: 'text',
    half: true,
  },
  { key: 'price', label: 'Prix', type: 'number', half: true },
  {
    key: 'currency',
    label: 'Devise',
    type: 'text',
    placeholder: 'EUR',
    half: true,
  },
  { key: 'bookingUrl', label: 'Lien du billet', type: 'text' },
  { key: 'notes', label: 'Note', type: 'textarea' },
]

export const accommodationFields: readonly EditField[] = [
  { key: 'name', label: 'Nom', type: 'text', required: true },
  { key: 'address', label: 'Adresse', type: 'text', allowEmpty: true },
  {
    key: 'checkIn',
    label: 'Arrivée',
    type: 'date',
    allowEmpty: true,
    half: true,
  },
  {
    key: 'checkOut',
    label: 'Départ',
    type: 'date',
    allowEmpty: true,
    half: true,
  },
  {
    key: 'status',
    label: 'Statut',
    type: 'select',
    half: true,
    options: STAY_STATUS_OPTIONS,
  },
  {
    key: 'bookingReference',
    label: 'Référence',
    type: 'text',
    half: true,
  },
  { key: 'price', label: 'Prix', type: 'number', half: true },
  {
    key: 'currency',
    label: 'Devise',
    type: 'text',
    placeholder: 'EUR',
    half: true,
  },
  {
    key: 'bookingUrl',
    label: 'Lien de réservation',
    type: 'text',
    allowEmpty: true,
  },
]
