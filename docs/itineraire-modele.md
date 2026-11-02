# Itinéraires modèles — besoin raffiné

Maquettes : https://claude.ai/artifact/RJvk8Dzw8kdQ2XjqeNrcbp

## 1. Le besoin d'origine

Retour d'Amar, un utilisateur :

> « Par exemple j'allais te demander de me dire ce que t'as fait au Japon, et au lieu de
> préparer l'itinéraire moi-même, je peux copier le tien dans ton app et le modifier à ma
> sauce. »

## 2. Reformulation

**Job** — Quand quelqu'un a déjà préparé un voyage là où je vais, je veux reprendre son
itinéraire et le caler sur mes dates, pour ne pas tout rechercher moi-même.

Deux rôles :

- **L'auteur** (Yanis) a fait le voyage, ou l'a préparé. Il veut le donner à plusieurs
  personnes, sans leur envoyer ses réservations.
- **Le repreneur** (Amar) part plus tard, à d'autres dates, souvent moins longtemps, avec
  d'autres goûts.

## 3. Pourquoi l'existant ne suffit pas

| | Partage actuel (lien / QR / code) | Voyage de groupe | **Modèle (nouveau)** |
|---|---|---|---|
| Pour qui | celui qui part avec moi | ceux qui partent avec moi | ceux qui veulent refaire le voyage |
| Durée du lien | 1 heure | permanent | permanent, retirable |
| Contenu | copie exacte | copie synchronisée | copie **nettoyée** |
| Dates | identiques | identiques | **recalées** sur le repreneur |
| Après réception | copie figée | modifs partagées | copie indépendante |

Le partage envoie aujourd'hui les références de réservation, les sièges, les statuts
fait / annulé et des dates passées. C'est voulu pour un co-voyageur, et c'est faux pour
un modèle.

## 4. Périmètre

### V1 — publier, reprendre, recaler

**Côté auteur** (écrans A1 → A3)
1. Dans *Partager*, une 4ᵉ option « Publier comme modèle », rangée sous « Avec ceux qui
   veulent le refaire ».
2. Écran de tri : ce qui part / ce qui reste, avec les chiffres réels du voyage.
   Interrupteurs : notes de journée (désactivé par défaut), prix payés (activé).
   Signature facultative (prénom libre).
3. Lien permanent `tripbrain.fr/m/<id>` : partager, copier, compteurs ouvertures /
   reprises, « Mettre le modèle à jour », « Retirer le modèle ».

**Côté repreneur** (écrans B1 → B5)
1. Aperçu Open Graph dédié « Modèle TripBrain ».
2. Page d'aperçu : villes, parcours, jours. Un seul bouton : « Reprendre ce voyage ».
3. Date de départ, puis durée (identique, plus courte, autre).
4. Choix des jours gardés, regroupés par ville. Les dates se resserrent en direct.
5. Voyage créé en local, avec bannière « D'après le voyage de Yanis » et la liste de ce
   qui reste à réserver. Le mode édition existant prend le relais.

### V2 — Adapter avec l'IA (écran B6)
Consignes libres + raccourcis (moins de marche, budget serré, avec enfants…), branchées
sur `/api/generate/refine`. Aperçu des changements avant application.

### Plus tard
Catalogue public de modèles, recherche par destination. Seulement si les reprises
décollent en V1.

## 5. Règles de nettoyage à la publication

| Champ | Modèle |
|---|---|
| `bookingReference`, `seat`, `gate`, `terminal` | retirés |
| `status` (activité, transport, hébergement) | retiré, le repreneur repart de « prévu » |
| Documents | jamais envoyés |
| `DayItinerary.notes`, `Transport.notes` | retirés, sauf si l'auteur active l'interrupteur |
| `price`, `currency` | gardés si l'interrupteur « prix » est activé |
| `bookingUrl` | gardé si c'est une page publique (site de l'hôtel), retiré s'il contient un identifiant de réservation |
| Tout le reste (activités, horaires, adresses, conseils, plats, bagages, coordonnées, images) | gardé |

## 6. Règles de recalage

- Écart = nouvelle date de départ − date du jour 1 de l'auteur. Chaque `date`, `checkIn` et
  `checkOut` glisse de cet écart.
- Les heures (`departureTime`, `openAt`…) ne bougent pas.
- Retirer des jours renumérote `dayNumber` et resserre les dates sans trou.
- Retirer tous les jours d'une ville retire son hébergement et le transport qui y arrive.
- Hébergements et transports arrivent avec le badge « À réserver ».

## 7. Modèle de données (piste)

- Nouvelle source de voyage : `TripSource = … | 'template'`.
- `StoredTrip.origin?: { templateId: string; authorName?: string; publishedAt: number }`.
- Côté auteur : `StoredTrip.publishedTemplate?: { id: string; ownerToken: string }`. Le jeton
  reste sur l'appareil. Il autorise la mise à jour et le retrait sans compte.
- Stockage : réutiliser le bucket R2 de `share-store.ts`, sous un préfixe `templates/`, sans
  expiration. Identifiant non devinable (≥ 10 caractères base32), car le lien est public.
  Page `/m/[id]` en `noindex`.

## 8. Mesure

- Modèles publiés par semaine.
- Taux de reprise = reprises / ouvertures de `/m/[id]`.
- Part des reprises suivies d'au moins une modification dans les 7 jours.
- Installations de l'app venant d'un lien modèle.

## 9. Cas limites

- Voyage de démo : non publiable.
- Voyage sans dates : on demande une date de départ quand même, et le jour 1 devient
  cette date.
- Modèle retiré : la page affiche « Ce modèle a été retiré », sans bouton.
- Payload > 2 Mo : même limite que le partage, message explicite.
- Contenu signalé : hors V1 (lien non indexé, diffusion de proche en proche).

## 10. Décisions ouvertes

1. Prix payés inclus par défaut ?
2. Signature de l'auteur : prénom libre, ou rien en V1 ?
3. Notes de journée exclues par défaut ?
4. Mise à jour d'un modèle : prévenir les repreneurs d'une nouvelle version (V2), ou jamais ?
