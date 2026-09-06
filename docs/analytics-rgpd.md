# Mesure d'audience et conformité RGPD

Ce document décrit comment TripBrain mesure son usage, ce qui est
techniquement empêché, et ce qui reste à régler côté PostHog.

## Le principe

TripBrain est une application locale : le voyage vit sur l'appareil. La mesure
d'audience sert **uniquement** à comprendre les parcours dans l'interface —
quels écrans servent, où l'on décroche, ce qui échoue. Elle ne sert ni à la
publicité, ni au profilage, ni à la revente.

Trois garde-fous, dans cet ordre :

1. **Pas de clé, pas de mesure.** Sans `NEXT_PUBLIC_POSTHOG_KEY`, aucun script
   n'est chargé et aucune requête ne part.
2. **Pas de consentement, pas de mesure.** `posthog.init()` n'est appelé
   qu'après un accord : le SDK contacte PostHog dès l'initialisation, pour sa
   configuration distante et ses drapeaux, et un simple `opt_out` laisserait
   donc déjà filer une adresse IP. Vercel Analytics est monté sous la même
   condition.
3. **Pas de catalogue, pas d'événement.** Ce qui part est vérifié deux fois :
   à l'émission (`trackEvent`) puis juste avant l'envoi (`before_send`).

## Où ça se passe

| Fichier                                 | Rôle                                                                              |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| `src/lib/analytics/events.ts`           | Catalogue : la liste exhaustive des événements et de leurs propriétés.            |
| `src/lib/analytics/sanitize.ts`         | Filtre : liste blanche d'événements, nettoyage des URL, retrait de tout le reste. |
| `src/lib/analytics/client.ts`           | Initialisation du SDK, application du consentement, `trackEvent`.                 |
| `src/lib/analytics/consent.ts`          | Lecture, écriture et diffusion du choix, conservé sur l'appareil.                 |
| `src/lib/analytics/metrics.ts`          | Transformation d'un itinéraire ou d'un fichier en compteurs.                      |
| `src/components/analytics/`             | Fournisseur React, bandeau de consentement, Vercel Analytics conditionné.         |
| `src/app/politique-de-confidentialite/` | Politique publique — la liste des événements y est générée depuis le catalogue.   |

## Ce qui est coupé, et pourquoi

L'écran d'un voyage contient des adresses, des noms d'hôtels, des documents.
Tout ce qui pourrait les capter est désactivé à l'initialisation :

- `autocapture: false` — la capture automatique remonte le texte des éléments
  cliqués, donc des villes et des hébergements.
- `disable_session_recording: true`, `capture_heatmaps: false`,
  `capture_dead_clicks: false`, `rageclick: false` — aucun enregistrement,
  aucune coordonnée de clic.
- `capture_exceptions: false` — un message d'erreur peut contenir une valeur
  saisie.
- `capture_performance.network_timing: false` — les URL de requêtes sont des
  données ; seules les Web Vitals sont conservées.
- `person_profiles: 'never'` et aucun appel à `identify` — aucune personne
  n'est créée, la mesure reste anonyme.
- `disable_surveys`, `disable_web_experiments`,
  `disable_external_dependency_loading` — aucun script tiers supplémentaire.
- `advanced_disable_flags: true` — aucun drapeau de fonctionnalité n'est
  utilisé, donc pas de requête pour les récupérer.
- `property_denylist: ['$ip']`, `mask_personal_data_properties: true` avec
  `import`, `code`, `payload`, `q` en propriétés personnalisées.
- Aucun fragment d'URL n'est conservé : un itinéraire arrivé du générateur
  voyage dans `#import=…`, et `before_send` le retire comme le reste.

## Ajouter un événement

1. Le déclarer dans `analyticsEvents` avec une description en français et des
   propriétés limitées à `choice(...)`, `count()` ou `flag()`.
2. L'appeler avec `trackEvent('mon_evenement', { … })`. Le typage refuse un nom
   ou une propriété inconnus.
3. `bun run test` — les invariants du catalogue interdisent une propriété
   nommée `name`, `query`, `city`, `code`… ou une valeur d'énumération qui
   ressemble à du texte libre.

Une propriété absente du catalogue est retirée avant l'envoi, même si elle est
passée à l'appel. Il n'y a pas de chemin détourné.

## Réglages à appliquer côté projet PostHog

Le code ne peut pas tout garantir seul. À vérifier dans le projet PostHog :

- [ ] **Instance européenne** (`https://eu.i.posthog.com`), déjà l'hôte par
      défaut. Un projet créé sur l'instance US ferait sortir les données de l'UE.
- [ ] **Discard client IP data** activé (Settings → Project → _IP data
      capture_). Le SDK retire déjà `$ip`, mais l'adresse IP de la requête est
      résolue côté serveur : seul ce réglage l'empêche.
- [ ] **Durée de conservation** alignée sur les 12 mois annoncés dans la
      politique de confidentialité.
- [ ] **Session replay désactivé** au niveau du projet, en plus du réglage SDK.
- [ ] **Accord de sous-traitance (DPA)** signé avec PostHog : <https://posthog.com/dpa>.
- [ ] **Registre des traitements** mis à jour avec cette finalité.

## Quand redemander le consentement

`CONSENT_VERSION` dans `src/lib/analytics/consent.ts` matérialise le texte
accepté. L'incrémenter invalide les choix précédents et repose la question :
à faire dès qu'une finalité, un destinataire ou une catégorie de données
change.
