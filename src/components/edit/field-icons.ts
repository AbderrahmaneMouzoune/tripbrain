import {
  Bus,
  Camera,
  Car,
  Clock,
  Compass,
  Footprints,
  ListChecks,
  MapPin,
  Plane,
  ShoppingBag,
  Sparkles,
  Ticket,
  Train,
  Utensils,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { EditAccent, EditFieldIcon } from '@/lib/edit-fields'

/** Associe les icônes nommées des descripteurs de champs à leur composant. */
export const FIELD_ICONS: Record<EditFieldIcon, LucideIcon> = {
  camera: Camera,
  utensils: Utensils,
  sparkles: Sparkles,
  'shopping-bag': ShoppingBag,
  train: Train,
  plane: Plane,
  bus: Bus,
  car: Car,
  clock: Clock,
  footprints: Footprints,
  'map-pin': MapPin,
  ticket: Ticket,
  wallet: Wallet,
  list: ListChecks,
  compass: Compass,
}

/** Couleur du pictogramme d'une carte de choix non sélectionnée. */
export const ACCENT_TEXT_CLASS: Record<EditAccent, string> = {
  primary: 'text-primary',
  secondary: 'text-secondary-strong',
  accent: 'text-accent',
  success: 'text-success',
  muted: 'text-muted-foreground',
}
