// Page d'atterrissage d'un lien de partage de documents : `/d/<code>`.
//
// Jumelle de `/s/<code>`, pour la même raison : l'aperçu affiché par une
// messagerie doit annoncer ce qui a été partagé, ici des documents et non un
// itinéraire. L'ouverture, elle, passe par le même chemin — `/?code=<code>`,
// que l'application résout ensuite selon ce que le serveur renvoie.
//
// Le code n'est jamais résolu ici : ni le titre, ni l'image, ni la page ne
// disent quoi que ce soit des documents. Un robot d'aperçu ne voit donc rien
// d'autre que la carte générique de TripBrain.

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ShareHandoff } from '@/components/share-handoff'
import { SHARE_URL_CODE_PATTERN } from '@/lib/share'

const TITLE = 'Des documents vous ont été partagés'
const DESCRIPTION =
  'Ouvrez ce lien pour récupérer ces documents de voyage dans TripBrain : billets, réservations et confirmations, consultables hors connexion sur votre téléphone comme sur votre ordinateur.'

interface DocumentsSharePageProps {
  params: Promise<{ code: string }>
}

export async function generateMetadata({
  params,
}: DocumentsSharePageProps): Promise<Metadata> {
  const { code } = await params

  return {
    title: `${TITLE} — TripBrain`,
    description: DESCRIPTION,
    // Un lien de partage est un jeton au porteur : il n'a rien à faire dans un
    // index de moteur de recherche. Les aperçus, eux, lisent quand même la page.
    robots: { index: false, follow: false },
    // Sans cette ligne, la page hériterait du canonique de l'accueil : certains
    // robots d'aperçu le suivent et montreraient la mauvaise carte.
    alternates: { canonical: `/d/${encodeURIComponent(code)}` },
    openGraph: {
      type: 'website',
      siteName: 'TripBrain',
      title: TITLE,
      description: DESCRIPTION,
      url: `/d/${encodeURIComponent(code)}`,
      locale: 'fr_FR',
    },
    twitter: {
      card: 'summary_large_image',
      title: TITLE,
      description: DESCRIPTION,
    },
  }
}

export default async function DocumentsSharePage({
  params,
}: DocumentsSharePageProps) {
  const { code } = await params
  if (!SHARE_URL_CODE_PATTERN.test(code)) notFound()

  return (
    <ShareHandoff
      code={code}
      title={TITLE}
      waiting="Ouverture des documents dans TripBrain…"
      cta="Ouvrir les documents"
    />
  )
}
