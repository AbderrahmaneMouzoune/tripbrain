import {
  Bus,
  Camera,
  Car,
  Plane,
  ShoppingBag,
  Sparkles,
  Train,
  Utensils,
  type LucideIcon,
} from 'lucide-react'
import type { EditFieldIcon } from '@/lib/edit-fields'

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
}
