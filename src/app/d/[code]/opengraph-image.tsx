// Aperçu du lien de partage de documents. Même carte que `/s/<code>`, avec
// l'annonce qui correspond : rien du contenu partagé n'y figure.

import {
  SHARE_OG_CONTENT_TYPE,
  SHARE_OG_SIZE,
  shareOpenGraphImage,
} from '@/lib/share-og-image'

export const size = SHARE_OG_SIZE
export const contentType = SHARE_OG_CONTENT_TYPE
export const alt = 'Des documents de voyage partagés avec TripBrain'

export default function SharedDocumentsOpenGraphImage() {
  return shareOpenGraphImage({
    title: 'Des documents vous ont été partagés',
    subtitle: 'Ouvrez ce lien pour récupérer ces documents de voyage',
    badge: 'Billets, réservations et confirmations — sans compte',
  })
}
