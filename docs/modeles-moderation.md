# Itinéraires modèles — retrait par l'opérateur

Quand retirer un modèle sans son auteur : contenu signalé, abus, ou auteur qui a perdu son
téléphone (le jeton qui lui permettait de retirer son modèle était dessus). Le retrait est
**définitif** et a les mêmes effets qu'un retrait par l'auteur : le lien et la page répondent
410, les versions (tout l'itinéraire) sont supprimées, le titre, le prénom et les slugs en clair
sont effacés de R2, le modèle sort de la liste publique. Il ne reste qu'une pierre tombale (id,
dates, empreinte du jeton, « était listé ou non »). Conception :
`docs/itineraire-modele-technique.md` §4.

Les slugs restent tout de même réservés **pour toujours**, mais seulement sous leur empreinte
SHA-256 (clés R2 `templates/slugs/<64 caractères hexadécimaux>`) : le slug actuel et ceux que le
modèle a portés avant une mise à jour (le slug suit la durée et les 3 premières villes). Un slug
contient le pays (en toutes lettres), un nombre de jours et jusqu'à 3 villes saisies par
l'auteur, par exemple `japon-3-jours-tokyo-kyoto` : après le retrait, R2 ne dit plus lesquels.
Qui connaît l'adresse de la page (lien partagé, moteur de recherche) obtient un 410, et le slug
ne servira jamais à un autre modèle.

> **Abus dans un nom de ville.** Chaque slug du modèle reprend les 3 premières villes du voyage
> au moment où il a été pris (en minuscules, sans accents). Le retrait les efface de R2 et la
> page répond 410, ce qui la fait sortir des moteurs de recherche. Ce qui reste hors de notre
> portée : les liens `https://tripbrain.fr/itineraires/<slug>` déjà partagés ailleurs, et les
> copies en cache des moteurs le temps qu'ils repassent.

## 1. Qui reçoit les demandes

Les signalements et les demandes d'auteurs arrivent à l'adresse de l'éditeur,
`contact@tripbrain.fr` (`publisher.email` dans `src/lib/legal-config.ts`).

## 2. Trouver le modèle

Le script accepte l'id, le slug, ou le lien entier.

| On a reçu…                                | On garde…                                   |
| ----------------------------------------- | ------------------------------------------- |
| `https://tripbrain.fr/itineraires/<slug>` | le slug, par exemple `japon-14-jours-tokyo` |
| `https://app.tripbrain.fr/m/<id>`         | l'id, 16 caractères, par exemple `k3x9m2…`  |

Un auteur qui a perdu son téléphone retrouve le lien `/m/<id>` dans les messages où il l'a
partagé.

Un ancien slug (la page d'avant une mise à jour qui a changé la durée ou les villes) désigne le
modèle aussi bien que l'actuel : le script le signale (« … est un ancien slug de ce modèle : son
slug actuel est … ») et retire le modèle sur tous ses slugs. Un slug désigne aussi un modèle déjà
retiré : le script le hache pour retrouver sa réservation, même si R2 ne le contient plus.

Parti d'un slug, tu n'as pas encore l'id : le script l'affiche (§3), et la vérification du §4 en
a besoin.

## 3. Retirer

Il faut Bun, ce dépôt, et les 4 variables R2 de **production** : Vercel → projet de l'app →
Settings → Environment Variables → filtre _Production_.

- Si Vercel affiche les valeurs (icône en forme d'œil), copie-les.
- Si elles sont marquées _Sensitive_, leur valeur ne peut plus être relue nulle part, ni dans
  Vercel ni dans Cloudflare. Crée plutôt une clé temporaire :
  1. Cloudflare → R2 → _Overview_ : copie l'_Account ID_ (`R2_ACCOUNT_ID`) et le nom du bucket
     de production (`R2_BUCKET_NAME`). S'il y a plusieurs buckets et que Vercel masque aussi ce
     nom, demande-le à l'équipe technique plutôt que de deviner.
  2. Même page → _Manage API tokens_ (selon l'interface : _API Tokens_ → _Manage_) → créer un
     token : permission _Object Read & Write_, limitée à ce seul bucket (_Apply to specific
     buckets only_).
  3. Copie **tout de suite** l'_Access Key ID_ (`R2_ACCESS_KEY_ID`) et le _Secret Access Key_
     (`R2_SECRET_ACCESS_KEY`) : Cloudflare ne les affiche qu'une fois.
  4. Une fois le retrait vérifié (§4), supprime ce token dans _Manage API tokens_.

```sh
export R2_ACCOUNT_ID='<id du compte Cloudflare>'
export R2_BUCKET_NAME='<bucket de production>'
export R2_ACCESS_KEY_ID='<clé d’accès>'
export R2_SECRET_ACCESS_KEY='<clé secrète>'
bun --no-env-file scripts/retire-template.ts '<id, slug ou lien>'
```

`--no-env-file` empêche Bun de compléter avec un `.env` local : seules les variables du shell
comptent. Le script affiche le bucket visé, l'état du modèle avant (id, slug, titre, prénom,
pays : de quoi vérifier que c'est le bon), puis après — sans slug : la pierre tombale n'en garde
aucun. Note l'id de la ligne `id <16 caractères> · …` : c'est lui qui va dans la vérification du
§4, même si tu es parti d'un slug.

- Code de sortie `0` : retiré, hors de la liste publique, et plus aucune version stockée
  (`versions : aucune, contenu effacé`). La réservation de sa publication
  (`templates/owners/<empreinte>`, quand le téléphone avait tiré le jeton) part avec les
  versions.
- `1` avec « l'index public n'a pas suivi » : le modèle répond déjà 410. Relance la même
  commande, sans risque.
- `1` avec « ses versions (le contenu de l'auteur) n'ont pas été supprimées » : le modèle répond
  déjà 410, mais son itinéraire est encore dans R2. Relance la même commande, sans risque,
  jusqu'au code `0`.
- `1` avec « pas entièrement retiré » : la vérification finale a trouvé le modèle encore dans
  la liste publique ou une version encore stockée (ligne `versions : …` de « Après »). Relance
  la même commande.
- `2` : argument absent ou mal formé.

## 4. Vérifier

L'API répond 410 tout de suite (jamais en cache) :

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://app.tripbrain.fr/api/templates/<id>
```

`<id>` : celui que le script a affiché sur la ligne `id … · …` (avec un slug à la place, cette
adresse répond 404).

La page du site vitrine répond 410 dans l'heure (régénération ISR), si le modèle était listé,
sur son slug actuel comme sur ses anciens ; sinon elle n'a jamais existé et répond 404 :

```sh
curl -sI https://tripbrain.fr/itineraires/<slug> | head -1
```

## 5. Index public plein

Les modèles listés figurent dans l'index public, découpé en 32 morceaux (`templates/index/<c>`,
un par premier caractère de l'id). Un morceau ne peut pas dépasser 4 Mio : seule une vague de
publications abusives peut l'en approcher. Un modèle listé qui ne peut plus y entrer reste en
ligne et joignable par son lien, mais n'apparaît plus sur tripbrain.fr (sitemap, pages pays).

**L'alerte.** Chaque refus laisse une ligne dans les journaux de la fonction (Vercel → projet de
l'app → _Logs_, recherche `template_index_full`) :

```
template_index_full : le morceau d’index index/k ne peut plus grandir, le modèle k3x9m2… n’y entre pas.
```

Note chaque id cité : ce sont les modèles à rattraper.

**La procédure** (mêmes variables R2 de production qu'au §3) :

1. Trouver les publications abusives : l'index public se lit par pages de 500, de
   `curl -s 'https://app.tripbrain.fr/api/templates/index?page=0'` jusqu'à la page dont
   `nextPage` vaut `null` (`?page=1`, `?page=2`…). Repérer les entrées du morceau en cause (id
   qui commence par la lettre de l'alerte) au titre ou aux villes absurdes.
2. Retirer chacune avec `scripts/retire-template.ts` (§3) : le retrait libère sa place.
3. Remettre dans l'index les modèles cités par l'alerte :

   ```sh
   bun --no-env-file scripts/resync-template-index.ts '<id>' '<id>' …
   ```

   Code `0` : chaque modèle a sa ligne (`dans l’index public`), ou n'en a pas parce qu'il
   n'est plus listé (un modèle retiré s'affiche par son id seul, `<id> (retiré)`). Code `1`
   avec « l'index n'a pas suivi » : le morceau est encore plein, reprends à l'étape 2. Rejouer
   la commande est sans risque.

Le site vitrine reprend les modèles rattrapés à sa régénération suivante (une heure au plus).
