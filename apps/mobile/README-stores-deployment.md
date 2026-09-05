# 📱 Déploiement stores — TripBrain

Guide complet pour builder et déployer l'app TripBrain sur l'App Store (iOS) et le Google Play Store (Android), pour les builds de test interne (**preview**) et de **production**.

---

## Prérequis

### Comptes à avoir

| Compte                                                 | Utilité                                    | Coût                                        |
| ------------------------------------------------------ | ------------------------------------------ | ------------------------------------------- |
| [Apple Developer](https://developer.apple.com)         | Publier sur l'App Store + TestFlight       | 99 $/an                                     |
| [Google Play Console](https://play.google.com/console) | Publier sur le Play Store + tests internes | 25 $ (une seule fois)                       |
| [Expo / EAS](https://expo.dev)                         | Builder les binaires dans le cloud         | Gratuit (plan free suffisant pour démarrer) |

### Apps Mac à installer

| App             | Utilité                            | Où la télécharger                        |
| --------------- | ---------------------------------- | ---------------------------------------- |
| **Transporter** | Uploader un `.ipa` vers TestFlight | Mac App Store (rechercher "Transporter") |

> ⚠️ Transporter est **Mac uniquement**. Un Mac est obligatoire pour soumettre sur l'App Store. Sans Mac, `eas submit --platform ios` fait le même travail depuis le cloud EAS.

---

## Profils de build

| Profil       | Commande                         | Environnement cible                           |
| ------------ | -------------------------------- | --------------------------------------------- |
| `preview`    | `eas build --profile preview`    | Distribution interne — `https://app.tripbrain.fr (ou une préproduction Vercel via `EXPO_PUBLIC_WEBAPP_URL`)` |
| `production` | `eas build --profile production` | Production — `https://app.tripbrain.fr`      |

Les URLs sont injectées automatiquement depuis `eas.json` au moment du build — pas besoin de `.env` local.

---

## iOS

### Test interne (profil `preview`) — TestFlight

1. **Builder le `.ipa`**

```bash
eas build --profile preview --platform ios
```

EAS build dans le cloud et génère un lien de téléchargement vers le `.ipa`.

1. **Télécharger le `.ipa`** depuis le [dashboard EAS](https://expo.dev).

2. **Uploader sur TestFlight via Transporter**
   - Ouvrir **Transporter** sur Mac
   - Se connecter avec l'Apple Developer account
   - Glisser-déposer le `.ipa` dans Transporter
   - Cliquer sur **Deliver**

3. **Vérifier sur App Store Connect**
   - Aller sur [App Store Connect](https://appstoreconnect.apple.com) → **TestFlight**
   - Le build apparaît après quelques minutes (processing Apple ~5–10 min)
   - L'inviter à un groupe de testeurs internes → ils reçoivent un mail, installent l'app **TestFlight**, et peuvent télécharger la version de test

---

### Production — App Store

1. **Builder le `.ipa`**

```bash
eas build --profile production --platform ios
```

1. **Soumettre manuellement quand le build est validé**

```bash
eas submit --profile production --platform ios
```

EAS demande les credentials Apple et soumet directement sur App Store Connect.

1. **Suivre la review Apple** depuis [App Store Connect](https://appstoreconnect.apple.com) (délai habituel : 1–3 jours).

> ✅ Le build production passe aussi par TestFlight avant d'être mis en ligne — tu peux le tester une dernière fois avant de le soumettre à la review.

---

## Android

### Test interne (profil `preview`) — Piste de test interne (Google Play)

1. **Builder l'`.apk` / `.aab`**

```bash
eas build --profile preview --platform android
```

EAS build dans le cloud et génère un lien de téléchargement.

1. **Télécharger le fichier** (`.aab` recommandé) depuis le [dashboard EAS](https://expo.dev).

2. **Uploader sur Google Play Console**
   - Aller sur [Google Play Console](https://play.google.com/console)
   - Sélectionner l'app TripBrain
   - **Tests** → **Tests internes** → **Créer une version**
   - Glisser-déposer le `.aab`
   - Enregistrer et publier la version

3. **Vérifier que les testeurs reçoivent le lien**
   - Dans **Tests internes** → onglet **Testeurs** → copier le lien d'opt-in
   - Les testeurs cliquent sur le lien et peuvent télécharger l'app directement depuis le **Play Store** (pas d'app tierce nécessaire)

> 💡 La piste de test interne est **invisible du public** — elle n'apparaît jamais sur le Play Store.

---

### Production — Play Store

1. **Builder l'`.aab`**

```bash
eas build --profile production --platform android
```

1. **Soumettre manuellement quand le build est validé**

```bash
eas submit --profile production --platform android
```

Ou manuellement depuis **Google Play Console** → **Production** → **Créer une version** → glisser-déposer le `.aab`.

1. **Suivre la review Google** depuis la Play Console (délai habituel : quelques heures à 1 jour).

---

## Résumé des commandes

```bash
# Builder la version de test interne (les deux plateformes)
eas build --profile preview --platform all

# Builder production (les deux plateformes)
eas build --profile production --platform all

# Soumettre production iOS
eas submit --profile production --platform ios

# Soumettre production Android
eas submit --profile production --platform android
```

---

## Ce qui nécessite un nouveau build

| Changement                                                 | Nouveau build nécessaire ?         |
| ---------------------------------------------------------- | ---------------------------------- |
| Nouvelle feature dans la webapp                            | ❌ Non — déployer la webapp suffit |
| Changement de l'URL de la webapp                           | ✅ Oui                             |
| Modification du code natif (gestion offline, UI d'erreur…) | ✅ Oui                             |
| Mise à jour de dépendances natives / Expo SDK              | ✅ Oui                             |

> 💡 L'architecture WebView signifie que 95% des mises à jour de TripBrain ne nécessitent **aucun rebuild** — tu déploies juste ta webapp.
