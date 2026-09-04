import type { Metadata } from 'next'
import Link from 'next/link'
import {
  LegalDefinitionList,
  LegalSection,
  LegalShell,
} from '@/components/legal/legal-shell'
import {
  ConsentPreferences,
  LegalPageView,
} from '@/components/legal/legal-page-tools'
import { legalConfig } from '@/lib/legal-config'
import { analyticsEvents } from '@/lib/analytics/events'

export const metadata: Metadata = {
  title: 'Politique de confidentialité — TripBrain',
  description:
    'Ce que TripBrain fait de tes données : ce qui reste sur ton appareil, ce qui transite, et la mesure d’audience anonyme soumise à ton accord.',
  alternates: { canonical: '/politique-de-confidentialite' },
}

const { publisher, processors, supervisoryAuthority, product } = legalConfig

/**
 * La liste des événements n'est pas recopiée à la main : elle est lue dans le
 * catalogue que le code utilise réellement. Le texte ne peut donc pas se
 * désynchroniser de ce qui est envoyé.
 */
const trackedEvents = Object.entries(analyticsEvents).map(
  ([name, definition]) => ({
    name,
    description: definition.description,
    properties: Object.keys(definition.properties),
  }),
)

export default function PrivacyPolicyPage() {
  return (
    <LegalShell
      title="Politique de confidentialité"
      intro="TripBrain est une application locale : ton voyage vit sur ton appareil, pas sur un serveur. Cette page dit précisément ce qui reste chez toi, ce qui en sort, et pourquoi."
    >
      <LegalPageView page="politique-de-confidentialite" />

      <LegalSection title="En deux lignes">
        <p>
          Ton itinéraire, tes documents et tes photos ne quittent jamais ton
          appareil, sauf si tu demandes toi-même un partage. La mesure
          d’audience est anonyme, hébergée dans l’Union européenne, limitée aux
          parcours dans l’interface, et ne démarre qu’avec ton accord.
        </p>
      </LegalSection>

      <LegalSection title="Qui est responsable de ces données ?">
        <p>
          {publisher.name}
          {publisher.legalForm ? `, ${publisher.legalForm}` : ''}, éditeur de{' '}
          {product.name}.
          {publisher.address ? ` Adresse : ${publisher.address}.` : ''} Contact
          :{' '}
          <a
            href={`mailto:${publisher.email}`}
            className="text-foreground underline underline-offset-4"
          >
            {publisher.email}
          </a>
          .
        </p>
        <p>
          Aucun délégué à la protection des données n’a été désigné : le
          traitement est limité et ne relève pas des cas où la désignation est
          obligatoire (art. 37 du RGPD).
        </p>
      </LegalSection>

      <LegalSection id="donnees-locales" title="Ce qui reste sur ton appareil">
        <p>
          {product.name} n’a pas de compte, pas de serveur d’application et pas
          de base de données centrale. Tout est écrit dans le stockage de ton
          navigateur (IndexedDB) et n’en bouge pas :
        </p>
        <LegalDefinitionList
          items={[
            {
              term: 'Itinéraire',
              description:
                'Journées, activités, transports, hébergements, notes et conseils. Base de données « tripbrain ».',
            },
            {
              term: 'Documents',
              description:
                'Billets, réservations, confirmations et fichiers ajoutés. Base « tripbrain-documents ».',
            },
            {
              term: 'Images',
              description:
                'Cache des images de l’itinéraire, pour la consultation hors ligne. Base « tripbrain-images ».',
            },
            {
              term: 'Préférences',
              description:
                'Ton choix sur la mesure d’audience, conservé en stockage local pour ne pas te le redemander.',
            },
          ]}
        />
        <p>
          Ces données restent jusqu’à ce que tu les effaces : le bouton «
          Effacer les données » du panneau « Partager &amp; données » les
          supprime, et vider les données du site depuis ton navigateur produit
          le même résultat. Personne d’autre, éditeur compris, n’y a accès.
        </p>
      </LegalSection>

      <LegalSection id="partage" title="Ce qui transite quand tu partages">
        <p>
          Un petit voyage tient entièrement dans le QR code : rien ne part sur
          un serveur. Au-delà d’une certaine taille, ou quand tu demandes un
          code à dicter, l’itinéraire compressé est déposé sur un espace de
          stockage sous un code à huit caractères, puis effacé automatiquement
          au bout d’une heure.
        </p>
        <LegalDefinitionList
          items={[
            {
              term: 'Ce qui est déposé',
              description:
                'L’itinéraire que tu as choisi de partager, compressé. Tes documents et tes photos ne sont jamais envoyés.',
            },
            {
              term: 'Combien de temps',
              description:
                'Une heure, après quoi le code ne mène plus à rien. Aucune copie n’est conservée.',
            },
            {
              term: 'Adresse IP',
              description:
                'Utilisée en mémoire vive le temps de la requête pour limiter les abus (20 partages par minute). Elle n’est ni journalisée par l’application, ni conservée.',
            },
            {
              term: 'Base légale',
              description:
                'L’exécution d’une action que tu as demandée (art. 6.1.b du RGPD). Sans partage demandé, aucune donnée ne sort.',
            },
          ]}
        />
        <p>
          Un code de partage est un jeton au porteur : qui l’a peut lire le
          voyage. Ne le diffuse qu’aux personnes concernées.
        </p>
      </LegalSection>

      <LegalSection id="mesure-audience" title="Mesure d’audience">
        <p>
          Pour savoir quels écrans servent vraiment et où le parcours coince,{' '}
          {product.name} utilise {processors.analytics.name}, hébergé sur son
          instance européenne ({processors.analytics.region}). Cette mesure a
          une seule finalité : améliorer l’expérience d’utilisation de
          l’application. Elle ne sert ni à la publicité, ni à la revente, ni au
          profilage.
        </p>

        <p className="text-foreground font-medium">
          Ce qui n’est jamais envoyé
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Aucun contenu de voyage : destination, ville, hébergement, activité,
            note, conseil, adresse, date de séjour.
          </li>
          <li>
            Aucun document, aucun nom de fichier, aucune image, aucun texte
            saisi ni terme recherché.
          </li>
          <li>
            Aucun code ni charge utile de partage : les paramètres d’URL sont
            retirés avant l’envoi.
          </li>
          <li>
            Aucune identification : pas de compte, pas de profil, pas d’adresse
            e-mail, pas de nom.
          </li>
          <li>
            Aucun enregistrement de session, aucune capture d’écran, aucune
            carte de chaleur, aucune capture automatique des éléments cliqués.
          </li>
        </ul>

        <p className="text-foreground font-medium">Ce qui est envoyé</p>
        <p>
          Un identifiant technique anonyme (aucun profil n’est créé), la page
          consultée, la langue, le type d’appareil et de navigateur, la taille
          d’écran, la provenance de la visite, quelques indicateurs de
          performance d’affichage, et les événements ci-dessous — uniquement
          ceux-ci&nbsp;:
        </p>

        <div className="border-border/70 divide-border/70 divide-y overflow-hidden rounded-xl border">
          {trackedEvents.map((event) => (
            <div key={event.name} className="px-3 py-2.5">
              <p className="text-foreground font-mono text-xs">{event.name}</p>
              <p className="mt-0.5 text-sm leading-relaxed">
                {event.description}
              </p>
              {event.properties.length > 0 && (
                <p className="text-muted-foreground/80 mt-1 font-mono text-[11px]">
                  {event.properties.join(' · ')}
                </p>
              )}
            </div>
          ))}
        </div>

        <p>
          Cette liste est produite à partir du catalogue d’événements du code
          lui-même : un événement absent de ce catalogue est refusé avant
          l’envoi, et une propriété non déclarée est retirée. La vérification
          est faite deux fois, à l’émission puis juste avant le départ de la
          requête.
        </p>

        <LegalDefinitionList
          items={[
            {
              term: 'Base légale',
              description:
                'Ton consentement (art. 6.1.a du RGPD), recueilli avant toute mesure et retirable à tout moment.',
            },
            {
              term: 'Destinataire',
              description: `${processors.analytics.entity}, sous-traitant au sens de l’article 28 du RGPD, sur son instance ${processors.analytics.region}.`,
            },
            {
              term: 'Transfert hors UE',
              description:
                'Aucun pour la mesure d’audience : l’instance européenne traite et conserve les données dans l’Union.',
            },
            {
              term: 'Conservation',
              description: `${processors.analytics.retentionMonths} mois au maximum, puis suppression.`,
            },
            {
              term: 'Adresse IP',
              description:
                'Retirée côté navigateur avant l’envoi, et la collecte d’IP est désactivée côté projet PostHog.',
            },
          ]}
        />

        <p>
          En complément, la mesure d’audience de notre hébergeur (Vercel
          Analytics) ne se charge, elle aussi, qu’après ton accord.
        </p>
      </LegalSection>

      <LegalSection id="preferences" title="Régler ou retirer ton accord">
        <p>
          Ton choix est enregistré sur ton appareil et respecté partout dans
          l’application. Le retirer coupe immédiatement l’envoi et efface
          l’identifiant anonyme.
        </p>
        <ConsentPreferences />
      </LegalSection>

      <LegalSection id="cookies" title="Cookies et traceurs">
        <p>
          {product.name} ne dépose aucun cookie publicitaire et ne pratique
          aucun suivi entre sites. Tant que tu n’as pas accepté la mesure
          d’audience, rien n’est écrit à cette fin et rien n’est demandé à
          PostHog : son SDK n’est même pas démarré.
        </p>
        <LegalDefinitionList
          items={[
            {
              term: 'tripbrain:analytics-consent',
              description:
                'Stockage local. Mémorise ton choix pour ne pas te le redemander. Nécessaire au respect de ce choix, donc exempté de consentement.',
            },
            {
              term: 'Identifiant PostHog',
              description:
                'Stockage local, écrit seulement après acceptation, effacé au retrait. Sert à ne pas compter deux fois la même visite.',
            },
            {
              term: 'Données de l’application',
              description:
                'IndexedDB, nécessaire au fonctionnement hors ligne. Ne quitte pas l’appareil.',
            },
          ]}
        />
      </LegalSection>

      <LegalSection id="droits" title="Tes droits">
        <p>
          Tu disposes des droits d’accès, de rectification, d’effacement, de
          limitation, d’opposition et de portabilité prévus par les articles 15
          à 22 du RGPD, ainsi que du droit de retirer ton consentement à tout
          moment.
        </p>
        <p>
          En pratique, la plupart s’exercent sans nous : tes données de voyage
          sont sur ton appareil, tu peux les exporter depuis le panneau «
          Partager &amp; données » et les effacer d’un bouton. Pour la mesure
          d’audience, le réglage ci-dessus suffit à l’arrêter. Pour toute autre
          demande, écris à{' '}
          <a
            href={`mailto:${publisher.email}`}
            className="text-foreground underline underline-offset-4"
          >
            {publisher.email}
          </a>{' '}
          : une réponse est apportée sous un mois.
        </p>
        <p>
          Si la réponse ne te convient pas, tu peux saisir la{' '}
          <a
            href={supervisoryAuthority.url}
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline underline-offset-4"
          >
            {supervisoryAuthority.name}
          </a>{' '}
          ({supervisoryAuthority.address}).
        </p>
      </LegalSection>

      <LegalSection title="Sécurité">
        <p>
          Les échanges se font en HTTPS. Les partages déposés sont accessibles
          par un code de 40 bits tiré au hasard, expirent au bout d’une heure et
          sont protégés contre le balayage par une limitation de débit. Les
          identifiants du stockage restent côté serveur et ne sont jamais
          exposés au navigateur.
        </p>
      </LegalSection>

      <LegalSection title="Modifications">
        <p>
          Toute évolution des finalités, des destinataires ou des données
          collectées entraîne une nouvelle demande de consentement : le choix
          précédent devient caduc et la question t’est reposée.
        </p>
        <p>
          Voir aussi les{' '}
          <Link
            href="/mentions-legales"
            className="text-foreground underline underline-offset-4"
          >
            mentions légales
          </Link>
          .
        </p>
      </LegalSection>
    </LegalShell>
  )
}
