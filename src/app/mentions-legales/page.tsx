import type { Metadata } from 'next'
import Link from 'next/link'
import {
  LegalDefinitionList,
  LegalSection,
  LegalShell,
} from '@/components/legal/legal-shell'
import { LegalPageView } from '@/components/legal/legal-page-tools'
import { legalConfig } from '@/lib/legal-config'

export const metadata: Metadata = {
  title: 'Mentions légales — TripBrain',
  description:
    'Éditeur, directeur de publication, hébergeur et conditions d’utilisation de l’application TripBrain.',
  alternates: { canonical: '/mentions-legales' },
}

const { publisher, host, product } = legalConfig

/** Les lignes sans valeur ne sont pas affichées plutôt que d'afficher un vide. */
const publisherItems = [
  { term: 'Éditeur', description: publisher.name },
  publisher.legalForm && {
    term: 'Statut',
    description: publisher.legalForm,
  },
  publisher.address && { term: 'Adresse', description: publisher.address },
  publisher.siret && { term: 'Immatriculation', description: publisher.siret },
  {
    term: 'Contact',
    description: (
      <a
        href={`mailto:${publisher.email}`}
        className="text-foreground underline underline-offset-4"
      >
        {publisher.email}
      </a>
    ),
  },
  {
    term: 'Directeur de la publication',
    description: publisher.publicationDirector,
  },
].filter(Boolean) as { term: string; description: React.ReactNode }[]

export default function LegalNoticePage() {
  return (
    <LegalShell
      title="Mentions légales"
      intro={`Informations relatives à l’éditeur et à l’hébergeur de ${product.name}, conformément à l’article 6 III de la loi pour la confiance dans l’économie numérique.`}
    >
      <LegalPageView page="mentions-legales" />

      <LegalSection title="Éditeur du service">
        <LegalDefinitionList items={publisherItems} />
      </LegalSection>

      <LegalSection title="Hébergeur">
        <LegalDefinitionList
          items={[
            { term: 'Société', description: host.name },
            { term: 'Adresse', description: host.address },
            {
              term: 'Site',
              description: (
                <a
                  href={host.website}
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground underline underline-offset-4"
                >
                  {host.website}
                </a>
              ),
            },
          ]}
        />
      </LegalSection>

      <LegalSection title="Nature du service">
        <p>
          {product.name} est un compagnon de voyage qui fonctionne sur ton
          appareil : l’itinéraire, les documents et les images sont stockés dans
          le navigateur et restent accessibles hors ligne. L’accès est gratuit
          et ne demande aucun compte.
        </p>
        <p>
          Le service est fourni en l’état. Les itinéraires, horaires, adresses
          et conseils affichés proviennent de ce que tu as importé : ils ne sont
          ni vérifiés ni garantis par l’éditeur. Vérifie toujours les horaires
          et les réservations auprès des sources officielles avant de partir.
        </p>
      </LegalSection>

      <LegalSection title="Propriété intellectuelle">
        <p>
          La marque {product.name}, l’identité visuelle et les textes de
          l’application sont la propriété de leur auteur. Le code source est
          publié sur{' '}
          <a
            href={product.repositoryUrl}
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline underline-offset-4"
          >
            GitHub
          </a>{' '}
          ; les conditions de réutilisation sont celles indiquées dans le dépôt.
        </p>
        <p>
          Les contenus que tu importes — itinéraires, documents, photos —
          restent les tiens. Ils ne sont ni collectés, ni exploités, ni
          transmis.
        </p>
      </LegalSection>

      <LegalSection title="Données personnelles et cookies">
        <p>
          Le détail de ce qui reste sur ton appareil, de ce qui transite lors
          d’un partage et de la mesure d’audience figure dans la{' '}
          <Link
            href="/politique-de-confidentialite"
            className="text-foreground underline underline-offset-4"
          >
            politique de confidentialité
          </Link>
          , qui permet aussi de régler ou de retirer ton accord à tout moment.
        </p>
      </LegalSection>

      <LegalSection title="Responsabilité">
        <p>
          Tes données de voyage vivant sur ton appareil, leur conservation
          dépend de ton navigateur : vider les données du site, désinstaller
          l’application ou changer d’appareil les supprime. Pense à exporter ton
          voyage si tu veux le garder.
        </p>
        <p>
          L’éditeur ne peut être tenu responsable des dommages liés à
          l’indisponibilité du service, à la perte de données locales, ou à
          l’usage de liens vers des sites tiers dont il ne maîtrise pas le
          contenu.
        </p>
      </LegalSection>

      <LegalSection title="Droit applicable">
        <p>
          Les présentes mentions sont soumises au droit français. À défaut
          d’accord amiable, les tribunaux français sont compétents.
        </p>
      </LegalSection>
    </LegalShell>
  )
}
