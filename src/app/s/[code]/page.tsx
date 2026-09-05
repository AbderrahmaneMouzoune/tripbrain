// Page d'atterrissage d'un lien de partage : `/s/<code>`.
//
// Elle existe pour deux raisons. D'abord l'aperçu : rendue par le serveur, elle
// porte les métadonnées Open Graph qu'une messagerie affiche à la place d'une
// URL nue. Ensuite l'ouverture : elle bascule vers `/?code=<code>`, le chemin
// que l'application traite déjà pour proposer l'import.
//
// Le code n'est jamais résolu ici : ni le titre, ni l'image, ni la page ne
// disent quoi que ce soit du voyage. Un robot d'aperçu ne voit donc rien
// d'autre que la carte générique de TripBrain.

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SharedTripHandoff } from './shared-trip-handoff'

/** Ce qu'un code de partage peut contenir, séparateurs de lecture compris. */
const CODE_PATTERN = /^[A-Za-z0-9-]{4,24}$/

const TITLE = 'Un voyage vous a été partagé'
const DESCRIPTION =
  'Ouvrez ce lien pour récupérer l’itinéraire dans TripBrain : jour par jour, hébergements, transports et documents, sur votre téléphone comme sur votre ordinateur.'

interface SharePageProps {
  params: Promise<{ code: string }>
}

export async function generateMetadata({
  params,
}: SharePageProps): Promise<Metadata> {
  const { code } = await params

  return {
    title: `${TITLE} — TripBrain`,
    description: DESCRIPTION,
    // Un lien de partage est un jeton au porteur : il n'a rien à faire dans un
    // index de moteur de recherche. Les aperçus, eux, lisent quand même la page.
    robots: { index: false, follow: false },
    // Sans cette ligne, la page hériterait du canonique de l'accueil : certains
    // robots d'aperçu le suivent et montreraient la mauvaise carte.
    alternates: { canonical: `/s/${encodeURIComponent(code)}` },
    openGraph: {
      type: 'website',
      siteName: 'TripBrain',
      title: TITLE,
      description: DESCRIPTION,
      url: `/s/${encodeURIComponent(code)}`,
      locale: 'fr_FR',
    },
    twitter: {
      card: 'summary_large_image',
      title: TITLE,
      description: DESCRIPTION,
    },
  }
}

export default async function SharePage({ params }: SharePageProps) {
  const { code } = await params
  if (!CODE_PATTERN.test(code)) notFound()

  return <SharedTripHandoff code={code} />
}
