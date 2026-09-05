// Aperçu du lien de partage d'un itinéraire. Le rendu est mutualisé avec
// `/d/<code>` : seule l'annonce diffère, jamais le contenu partagé.

import {
  SHARE_OG_CONTENT_TYPE,
  SHARE_OG_SIZE,
  shareOpenGraphImage,
} from '@/lib/share-og-image'

export const size = SHARE_OG_SIZE
export const contentType = SHARE_OG_CONTENT_TYPE
export const alt = 'Un itinéraire de voyage partagé avec TripBrain'

export default function SharedTripOpenGraphImage() {
  return shareOpenGraphImage({
    title: 'Un voyage vous a été partagé',
    subtitle: 'Ouvrez ce lien pour retrouver l’itinéraire jour par jour',
    badge: 'Hébergements, transports et activités — sans compte',
  })
}
