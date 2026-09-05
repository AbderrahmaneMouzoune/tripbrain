/**
 * Actions du menu d'appui long.
 *
 * Maintenir le doigt (ou le clic droit) sur une information modifiable du
 * roadbook ouvre un menu contextuel. Ce fichier décrit ce que chaque entité
 * sait faire d'elle-même : modifier, changer un statut, réordonner, copier,
 * ouvrir un lien, supprimer.
 *
 * Les descripteurs sont purs — pas de React, les icônes sont désignées par un
 * nom, associé à un composant dans `src/components/quick-actions.tsx`. Ce qui
 * apparaît dans le menu dépend donc uniquement de la donnée, et se vérifie en
 * test : rien ne propose « Ouvrir le billet » sans billet.
 */

import type {
  Accommodation,
  Activity,
  DayItinerary,
  Transport,
} from './itinerary-data'
import {
  ACTIVITY_STATUS_CYCLE,
  type ActivityStatus,
  type DayTextList,
} from './itinerary-edit'

/** Éléments du roadbook qui répondent à l'appui long. */
export type QuickActionEntity =
  | 'day'
  | 'activity'
  | 'transport'
  | 'accommodation'

/** Icônes disponibles dans le menu (voir `QUICK_ACTION_ICONS`). */
export type QuickActionIcon =
  | 'edit'
  | 'plus'
  | 'copy'
  | 'navigation'
  | 'search'
  | 'external'
  | 'check'
  | 'skip'
  | 'undo'
  | 'move-up'
  | 'move-down'
  | 'trash'
  | 'train'
  | 'hotel'

/**
 * Famille d'action, reprise telle quelle par la mesure d'usage : elle dit ce
 * que le menu sert à faire, jamais sur quoi.
 */
export type QuickActionKind =
  | 'edit'
  | 'create'
  | 'status'
  | 'move'
  | 'copy'
  | 'open'
  | 'delete'

export interface QuickAction {
  /** Identifiant stable, utilisé comme clé de rendu et pour la confirmation */
  id: string
  kind: QuickActionKind
  label: string
  icon: QuickActionIcon
  /** Précision affichée sous le libellé */
  hint?: string
  /** Action fâcheuse : présentée en rouge */
  destructive?: boolean
  /** Demande un second appui avant d'agir */
  confirm?: boolean
  /** Libellé de ce second appui */
  confirmLabel?: string
  /** Ouvre un lien externe (carte, réservation) au lieu d'exécuter `run` */
  href?: string
  run?: () => void
}

/** Recherche Google Maps, comme ailleurs dans l'application. */
export function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

/** Itinéraire Google Maps vers une destination. */
export function mapsDirectionsUrl(destination: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
}

/** Recherche Google : ce qu'on fait de toute façon, en un tap de moins. */
export function googleSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`
}

/**
 * Garde le nom, jette l'explication : les listes du roadbook s'écrivent
 * souvent « Xiaolongbao (小笼包) — raviolis vapeur », et chercher la phrase
 * entière ne donne rien de bon.
 */
export function searchTerm(item: string): string {
  const [head] = item.split(/\s[—–-]\s/)
  return (head ?? item).trim()
}

/** Requête posée à Google ou à la carte : les morceaux vides sautent. */
function query(...parts: (string | undefined)[]): string {
  return parts.filter(filled).join(' ')
}

function coordinatesQuery(
  coordinates: readonly [number, number] | undefined,
): string | undefined {
  if (!coordinates) return undefined
  return `${coordinates[0]},${coordinates[1]}`
}

/** Texte non vide, une fois les espaces retirés. */
function filled(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export interface DayQuickActionHandlers {
  onEdit: () => void
  onAddActivity: () => void
  onAddTransport: () => void
  onAddAccommodation: () => void
  onCopy: (text: string) => void
}

/**
 * Journée : la retoucher, et compléter ce qui lui manque. Les ajouts déjà
 * présents ne sont pas reproposés — un jour n'a qu'un transport et qu'un
 * hébergement.
 */
export function buildDayActions(
  day: DayItinerary,
  handlers: DayQuickActionHandlers,
): QuickAction[] {
  const actions: QuickAction[] = [
    {
      id: 'day-edit',
      kind: 'edit',
      label: 'Modifier la journée',
      hint: 'Titre, ville, note, points forts…',
      icon: 'edit',
      run: handlers.onEdit,
    },
    {
      id: 'day-add-activity',
      kind: 'create',
      label: 'Ajouter une activité',
      icon: 'plus',
      run: handlers.onAddActivity,
    },
  ]

  if (!day.transport) {
    actions.push({
      id: 'day-add-transport',
      kind: 'create',
      label: 'Ajouter un transport',
      icon: 'train',
      run: handlers.onAddTransport,
    })
  }

  if (!day.accommodation) {
    actions.push({
      id: 'day-add-accommodation',
      kind: 'create',
      label: 'Ajouter un hébergement',
      icon: 'hotel',
      run: handlers.onAddAccommodation,
    })
  }

  actions.push({
    id: 'day-copy',
    kind: 'copy',
    label: 'Copier le titre du jour',
    icon: 'copy',
    run: () =>
      handlers.onCopy([day.title, day.city].filter(filled).join(' — ')),
  })

  if (filled(day.city)) {
    actions.push({
      id: 'day-search',
      kind: 'open',
      label: 'Rechercher la ville sur Google',
      icon: 'search',
      href: googleSearchUrl(day.city),
    })
  }

  return actions
}

/** En-têtes du menu selon la liste dont la ligne vient. */
const DAY_LIST_LABELS: Record<
  DayTextList,
  { item: string; edit: string; remove: string }
> = {
  highlights: {
    item: 'Point fort de la journée',
    edit: 'Modifier les points forts',
    remove: 'Retirer des points forts',
  },
  foodRecommendations: {
    item: 'À goûter dans la journée',
    edit: 'Modifier la liste à goûter',
    remove: 'Retirer de la liste',
  },
  packingTips: {
    item: 'Bagages de la journée',
    edit: 'Modifier la liste des bagages',
    remove: 'Retirer des bagages',
  },
  tips: {
    item: 'Conseil de la journée',
    edit: 'Modifier les conseils',
    remove: 'Retirer des conseils',
  },
}

/** Nom de la liste, pour coiffer le menu d'une de ses lignes. */
export function dayListItemLabel(list: DayTextList): string {
  return DAY_LIST_LABELS[list].item
}

export interface DayListItemHandlers {
  /** Ouvre le formulaire de la journée, où la liste entière se retouche */
  onEditList: () => void
  onRemove: () => void
  onCopy: (text: string) => void
}

/**
 * Ligne d'une liste de la journée : un plat, un point fort, un conseil.
 *
 * Ce ne sont que des phrases, mais ce sont les informations qu'on veut
 * chercher en chemin — d'où la recherche Google en tête, et la carte pour
 * celles qui désignent un lieu ou un plat. Le nom est nettoyé de son
 * explication avant d'être cherché.
 */
export function buildDayListItemActions(
  item: string,
  { list, city }: { list: DayTextList; city?: string },
  handlers: DayListItemHandlers,
): QuickAction[] {
  const term = searchTerm(item)
  const labels = DAY_LIST_LABELS[list]
  const placeBound = list === 'highlights' || list === 'foodRecommendations'

  const actions: QuickAction[] = []

  if (filled(term)) {
    actions.push({
      id: 'day-item-search',
      kind: 'open',
      label: 'Rechercher sur Google',
      hint: term,
      icon: 'search',
      href: googleSearchUrl(placeBound ? query(term, city) : term),
    })

    if (placeBound) {
      actions.push({
        id: 'day-item-map',
        kind: 'open',
        label:
          list === 'foodRecommendations'
            ? 'Trouver où en manger'
            : 'Voir sur la carte',
        icon: 'navigation',
        href: mapsSearchUrl(query(term, city)),
      })
    }
  }

  actions.push({
    id: 'day-item-copy',
    kind: 'copy',
    label: 'Copier',
    icon: 'copy',
    run: () => handlers.onCopy(item),
  })

  actions.push({
    id: 'day-item-edit',
    kind: 'edit',
    label: labels.edit,
    icon: 'edit',
    run: handlers.onEditList,
  })

  actions.push({
    id: 'day-item-remove',
    kind: 'delete',
    label: labels.remove,
    icon: 'trash',
    destructive: true,
    confirm: true,
    confirmLabel: 'Confirmer le retrait',
    run: handlers.onRemove,
  })

  return actions
}

/** Libellés des changements de statut d'une activité. */
const ACTIVITY_STATUS_ACTIONS: Record<
  ActivityStatus,
  { label: string; icon: QuickActionIcon }
> = {
  planned: { label: 'Remettre « à faire »', icon: 'undo' },
  done: { label: 'Marquer comme fait', icon: 'check' },
  skipped: { label: 'Marquer comme annulé', icon: 'skip' },
}

export interface ActivityQuickActionHandlers {
  onEdit: () => void
  onStatusChange: (status: ActivityStatus) => void
  /** Déplace l'activité dans le programme (-1 vers le haut, +1 vers le bas) */
  onMove: (offset: number) => void
  onDelete: () => void
  onCopy: (text: string) => void
}

export interface ActivityQuickActionOptions {
  canMoveUp?: boolean
  canMoveDown?: boolean
  /** Ville de la journée, ajoutée à la recherche pour la resserrer */
  city?: string
}

/**
 * Activité : le geste le plus courant sur place est de dire où on en est, il
 * passe donc avant le reste. La suppression reste en dernier, et demande une
 * confirmation.
 */
export function buildActivityActions(
  activity: Activity,
  handlers: ActivityQuickActionHandlers,
  {
    canMoveUp = false,
    canMoveDown = false,
    city,
  }: ActivityQuickActionOptions = {},
): QuickAction[] {
  const status: ActivityStatus = activity.status ?? 'planned'

  const actions: QuickAction[] = [
    {
      id: 'activity-edit',
      kind: 'edit',
      label: "Modifier l'activité",
      icon: 'edit',
      run: handlers.onEdit,
    },
  ]

  for (const candidate of ACTIVITY_STATUS_CYCLE) {
    if (candidate === status) continue

    actions.push({
      id: `activity-status-${candidate}`,
      kind: 'status',
      label: ACTIVITY_STATUS_ACTIONS[candidate].label,
      icon: ACTIVITY_STATUS_ACTIONS[candidate].icon,
      run: () => handlers.onStatusChange(candidate),
    })
  }

  if (canMoveUp) {
    actions.push({
      id: 'activity-move-up',
      kind: 'move',
      label: 'Monter dans le programme',
      icon: 'move-up',
      run: () => handlers.onMove(-1),
    })
  }

  if (canMoveDown) {
    actions.push({
      id: 'activity-move-down',
      kind: 'move',
      label: 'Descendre dans le programme',
      icon: 'move-down',
      run: () => handlers.onMove(1),
    })
  }

  const address = activity.address
  const name = activity.name

  if (filled(address)) {
    actions.push({
      id: 'activity-copy-address',
      kind: 'copy',
      label: "Copier l'adresse",
      icon: 'copy',
      run: () => handlers.onCopy(address),
    })
  } else if (filled(name)) {
    actions.push({
      id: 'activity-copy-name',
      kind: 'copy',
      label: 'Copier le nom',
      icon: 'copy',
      run: () => handlers.onCopy(name),
    })
  }

  const mapQuery = coordinatesQuery(activity.coordinates) ?? activity.address
  if (filled(mapQuery)) {
    actions.push({
      id: 'activity-map',
      kind: 'open',
      label: 'Voir sur la carte',
      icon: 'navigation',
      href: mapsSearchUrl(mapQuery),
    })
  }

  if (filled(name)) {
    actions.push({
      id: 'activity-search',
      kind: 'open',
      label: 'Rechercher sur Google',
      icon: 'search',
      href: googleSearchUrl(query(name, city)),
    })
  }

  if (filled(activity.bookingUrl)) {
    actions.push({
      id: 'activity-booking',
      kind: 'open',
      label: 'Ouvrir la réservation',
      icon: 'external',
      href: activity.bookingUrl,
    })
  }

  actions.push({
    id: 'activity-delete',
    kind: 'delete',
    label: "Supprimer l'activité",
    icon: 'trash',
    destructive: true,
    confirm: true,
    confirmLabel: 'Confirmer la suppression',
    run: handlers.onDelete,
  })

  return actions
}

export interface EntityQuickActionHandlers {
  onEdit: () => void
  onDelete: () => void
  onCopy: (text: string) => void
}

/**
 * Transport : le billet et le point de rendez-vous sont ce qu'on cherche en
 * gare ou à l'aéroport, ils passent avant la suppression.
 */
export function buildTransportActions(
  transport: Transport,
  handlers: EntityQuickActionHandlers,
): QuickAction[] {
  const actions: QuickAction[] = [
    {
      id: 'transport-edit',
      kind: 'edit',
      label: 'Modifier le transport',
      icon: 'edit',
      run: handlers.onEdit,
    },
  ]

  const reference = transport.bookingReference

  if (filled(reference)) {
    actions.push({
      id: 'transport-copy-reference',
      kind: 'copy',
      label: 'Copier la référence',
      hint: reference,
      icon: 'copy',
      run: () => handlers.onCopy(reference),
    })
  }

  if (filled(transport.bookingUrl)) {
    actions.push({
      id: 'transport-booking',
      kind: 'open',
      label: 'Ouvrir le billet',
      icon: 'external',
      href: transport.bookingUrl,
    })
  }

  // En voiture, le point utile est la destination ; pour le reste, c'est le
  // quai, la gare ou le terminal d'où l'on part.
  const isCar = transport.type === 'car'
  const mapQuery = isCar
    ? transport.to
    : (transport.departureAddress ?? transport.from)

  if (filled(mapQuery)) {
    actions.push({
      id: 'transport-map',
      kind: 'open',
      label: isCar ? "Voir le point d'arrivée" : 'Voir le point de départ',
      icon: 'navigation',
      href: mapsSearchUrl(mapQuery),
    })
  }

  // Un numéro de train ou de vol se cherche sur Google plus souvent qu'on ne
  // le croit : horaires du jour, quai, retard.
  const searchQuery = filled(transport.details)
    ? query(transport.provider, transport.details)
    : query(transport.provider, transport.from, transport.to)

  if (filled(searchQuery)) {
    actions.push({
      id: 'transport-search',
      kind: 'open',
      label: 'Rechercher sur Google',
      hint: searchQuery,
      icon: 'search',
      href: googleSearchUrl(searchQuery),
    })
  }

  actions.push({
    id: 'transport-delete',
    kind: 'delete',
    label: 'Supprimer le transport',
    icon: 'trash',
    destructive: true,
    confirm: true,
    confirmLabel: 'Confirmer la suppression',
    run: handlers.onDelete,
  })

  return actions
}

/** Hébergement : l'adresse et la réservation, puis la suppression. */
export function buildAccommodationActions(
  accommodation: Accommodation,
  handlers: EntityQuickActionHandlers,
): QuickAction[] {
  const actions: QuickAction[] = [
    {
      id: 'accommodation-edit',
      kind: 'edit',
      label: "Modifier l'hébergement",
      icon: 'edit',
      run: handlers.onEdit,
    },
  ]

  if (filled(accommodation.address)) {
    actions.push({
      id: 'accommodation-copy-address',
      kind: 'copy',
      label: "Copier l'adresse",
      icon: 'copy',
      run: () => handlers.onCopy(accommodation.address),
    })
  }

  const reference = accommodation.bookingReference

  if (filled(reference)) {
    actions.push({
      id: 'accommodation-copy-reference',
      kind: 'copy',
      label: 'Copier la référence',
      hint: reference,
      icon: 'copy',
      run: () => handlers.onCopy(reference),
    })
  }

  if (filled(accommodation.bookingUrl)) {
    actions.push({
      id: 'accommodation-booking',
      kind: 'open',
      label: 'Ouvrir la réservation',
      icon: 'external',
      href: accommodation.bookingUrl,
    })
  }

  const destination = query(accommodation.name, accommodation.address)

  if (filled(destination)) {
    actions.push({
      id: 'accommodation-map',
      kind: 'open',
      label: 'Itinéraire vers le logement',
      icon: 'navigation',
      href: mapsDirectionsUrl(destination),
    })

    actions.push({
      id: 'accommodation-search',
      kind: 'open',
      label: 'Rechercher sur Google',
      icon: 'search',
      href: googleSearchUrl(destination),
    })
  }

  actions.push({
    id: 'accommodation-delete',
    kind: 'delete',
    label: "Supprimer l'hébergement",
    icon: 'trash',
    destructive: true,
    confirm: true,
    confirmLabel: 'Confirmer la suppression',
    run: handlers.onDelete,
  })

  return actions
}
