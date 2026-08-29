/**
 * Détection de l'environnement d'installation et marche à suivre associée.
 *
 * Les navigateurs n'exposent pas tous une invite native (`beforeinstallprompt`) :
 * sur iOS, et sur plusieurs navigateurs Android/desktop, l'utilisateur doit
 * passer par un menu. Ce module traduit le user-agent en une fiche d'étapes
 * concrètes, sans dépendre du DOM pour rester testable.
 */

/** Plateforme hôte, telle que déduite du user-agent. */
export type InstallOs =
  | 'ios'
  | 'android'
  | 'macos'
  | 'windows'
  | 'linux'
  | 'unknown'

/** Navigateur, restreint à ceux dont la procédure d'installation diffère. */
export type InstallBrowser =
  | 'safari'
  | 'chrome'
  | 'edge'
  | 'firefox'
  | 'samsung'
  | 'opera'
  | 'other'

/** Regroupement affiché à l'utilisateur (un onglet par famille). */
export type InstallFamily = 'ios' | 'android' | 'desktop'

export interface InstallTarget {
  os: InstallOs
  browser: InstallBrowser
  family: InstallFamily
}

/** Illustration d'une étape ; l'icône concrète est choisie côté composant. */
export type InstallStepIcon =
  | 'share'
  | 'menu'
  | 'plus'
  | 'check'
  | 'download'
  | 'browser'

export interface InstallStep {
  icon: InstallStepIcon
  title: string
  detail?: string
}

export interface InstallGuide {
  id: string
  family: InstallFamily
  /** Libellé de la famille, ex. « iPhone / iPad ». */
  label: string
  /** Navigateur ciblé par la fiche, ex. « Safari ». */
  browserLabel: string
  steps: InstallStep[]
  /** Conseil complémentaire affiché sous les étapes. */
  note?: string
  /** Le navigateur n'installe pas les applications web : `steps` est vide. */
  unsupported?: boolean
}

export const INSTALL_FAMILIES: { id: InstallFamily; label: string }[] = [
  { id: 'ios', label: 'iPhone / iPad' },
  { id: 'android', label: 'Android' },
  { id: 'desktop', label: 'Ordinateur' },
]

/** Navigateur retenu quand on ouvre l'onglet d'une autre famille que la sienne. */
const DEFAULT_BROWSER: Record<InstallFamily, InstallBrowser> = {
  ios: 'safari',
  android: 'chrome',
  desktop: 'chrome',
}

// ── Détection ────────────────────────────────────────────────────────────────

function detectBrowser(ua: string): InstallBrowser {
  // L'ordre compte : Edge, Opera et Samsung Internet embarquent tous « chrome »
  // (et souvent « safari ») dans leur user-agent.
  if (/\bedg(?:e|a|ios)?\//.test(ua)) return 'edge'
  if (/\bopr\/|\bopera\b|\bopt\//.test(ua)) return 'opera'
  if (/samsungbrowser/.test(ua)) return 'samsung'
  if (/firefox\/|fxios\//.test(ua)) return 'firefox'
  if (/chrome\/|crios\/|chromium\//.test(ua)) return 'chrome'
  if (/safari\//.test(ua)) return 'safari'
  return 'other'
}

function detectOs(ua: string, maxTouchPoints: number): InstallOs {
  if (/iphone|ipad|ipod/.test(ua)) return 'ios'
  // iPadOS 13+ se présente comme un Mac : seul l'écran tactile les distingue.
  if (/macintosh|mac os x/.test(ua)) {
    return maxTouchPoints > 1 ? 'ios' : 'macos'
  }
  if (/android/.test(ua)) return 'android'
  if (/windows/.test(ua)) return 'windows'
  if (/linux|x11|cros/.test(ua)) return 'linux'
  return 'unknown'
}

export function familyOf(os: InstallOs): InstallFamily {
  if (os === 'ios') return 'ios'
  if (os === 'android') return 'android'
  return 'desktop'
}

export function detectInstallTarget(
  userAgent: string,
  options: { maxTouchPoints?: number } = {},
): InstallTarget {
  const ua = (userAgent ?? '').toLowerCase()
  const os = detectOs(ua, options.maxTouchPoints ?? 0)
  return { os, browser: detectBrowser(ua), family: familyOf(os) }
}

// ── Fiches d'installation ────────────────────────────────────────────────────

const IOS_SAFARI: InstallGuide = {
  id: 'ios-safari',
  family: 'ios',
  label: 'iPhone / iPad',
  browserLabel: 'Safari',
  steps: [
    {
      icon: 'share',
      title: 'Touchez le bouton Partager',
      detail: 'Le carré avec une flèche vers le haut, dans la barre de Safari.',
    },
    {
      icon: 'plus',
      title: 'Choisissez « Sur l’écran d’accueil »',
      detail: 'Faites défiler la liste des actions si vous ne le voyez pas.',
    },
    {
      icon: 'check',
      title: 'Confirmez avec « Ajouter »',
      detail: 'En haut à droite. TripBrain rejoint vos autres applications.',
    },
  ],
}

const IOS_OTHER: InstallGuide = {
  id: 'ios-other',
  family: 'ios',
  label: 'iPhone / iPad',
  browserLabel: 'Chrome, Firefox, Edge…',
  steps: [
    {
      icon: 'share',
      title: 'Touchez le bouton Partager',
      detail: 'Dans la barre du navigateur : un carré avec une flèche.',
    },
    {
      icon: 'plus',
      title: 'Choisissez « Ajouter à l’écran d’accueil »',
    },
    {
      icon: 'check',
      title: 'Confirmez avec « Ajouter »',
    },
  ],
  note: 'Sur iPhone et iPad, l’installation est plus fiable depuis Safari : ouvrez TripBrain dans Safari si l’option n’apparaît pas.',
}

const ANDROID_CHROME: InstallGuide = {
  id: 'android-chrome',
  family: 'android',
  label: 'Android',
  browserLabel: 'Chrome, Edge, Opera',
  steps: [
    {
      icon: 'menu',
      title: 'Ouvrez le menu ⋮',
      detail: 'En haut à droite, à côté de la barre d’adresse.',
    },
    {
      icon: 'download',
      title: 'Touchez « Installer l’application »',
      detail: 'Parfois libellé « Ajouter à l’écran d’accueil ».',
    },
    {
      icon: 'check',
      title: 'Confirmez avec « Installer »',
      detail: 'L’icône TripBrain apparaît sur votre écran d’accueil.',
    },
  ],
}

const ANDROID_SAMSUNG: InstallGuide = {
  id: 'android-samsung',
  family: 'android',
  label: 'Android',
  browserLabel: 'Samsung Internet',
  steps: [
    {
      icon: 'menu',
      title: 'Ouvrez le menu ☰',
      detail: 'En bas à droite de l’écran.',
    },
    {
      icon: 'plus',
      title: 'Touchez « Ajouter la page à »',
      detail: 'Puis choisissez « Écran d’accueil ».',
    },
    {
      icon: 'check',
      title: 'Confirmez avec « Ajouter »',
    },
  ],
}

const ANDROID_FIREFOX: InstallGuide = {
  id: 'android-firefox',
  family: 'android',
  label: 'Android',
  browserLabel: 'Firefox',
  steps: [
    {
      icon: 'menu',
      title: 'Ouvrez le menu ⋮',
      detail: 'En bas à droite de l’écran.',
    },
    {
      icon: 'plus',
      title: 'Touchez « Ajouter à l’écran d’accueil »',
    },
    {
      icon: 'check',
      title: 'Confirmez avec « Ajouter »',
    },
  ],
}

const DESKTOP_CHROMIUM: InstallGuide = {
  id: 'desktop-chromium',
  family: 'desktop',
  label: 'Ordinateur',
  browserLabel: 'Chrome, Edge, Opera',
  steps: [
    {
      icon: 'browser',
      title: 'Repérez l’icône d’installation',
      detail: 'À droite de la barre d’adresse : un écran avec une flèche.',
    },
    {
      icon: 'download',
      title: 'Cliquez sur « Installer »',
      detail: 'Sinon : menu ⋮ → « Installer TripBrain… ».',
    },
    {
      icon: 'check',
      title: 'TripBrain s’ouvre dans sa propre fenêtre',
      detail: 'Un raccourci est ajouté à votre bureau.',
    },
  ],
}

const DESKTOP_SAFARI: InstallGuide = {
  id: 'desktop-safari',
  family: 'desktop',
  label: 'Ordinateur',
  browserLabel: 'Safari (macOS)',
  steps: [
    {
      icon: 'browser',
      title: 'Ouvrez le menu « Fichier »',
      detail: 'Dans la barre de menus, en haut de l’écran.',
    },
    {
      icon: 'plus',
      title: 'Choisissez « Ajouter au Dock… »',
      detail: 'Disponible à partir de macOS Sonoma (14).',
    },
    {
      icon: 'check',
      title: 'Confirmez avec « Ajouter »',
      detail: 'TripBrain se lance depuis le Dock comme une application.',
    },
  ],
}

const DESKTOP_FIREFOX: InstallGuide = {
  id: 'desktop-firefox',
  family: 'desktop',
  label: 'Ordinateur',
  browserLabel: 'Firefox',
  steps: [],
  unsupported: true,
  note: 'Firefox pour ordinateur n’installe pas les applications web. Ouvrez TripBrain dans Chrome, Edge ou Safari pour l’installer — sinon, gardez simplement la page en favori.',
}

export function getInstallGuide(
  family: InstallFamily,
  browser: InstallBrowser,
): InstallGuide {
  if (family === 'ios') {
    return browser === 'safari' || browser === 'other' ? IOS_SAFARI : IOS_OTHER
  }

  if (family === 'android') {
    if (browser === 'samsung') return ANDROID_SAMSUNG
    if (browser === 'firefox') return ANDROID_FIREFOX
    return ANDROID_CHROME
  }

  if (browser === 'firefox') return DESKTOP_FIREFOX
  if (browser === 'safari') return DESKTOP_SAFARI
  return DESKTOP_CHROMIUM
}

/**
 * Fiche à afficher pour un onglet donné : celle de l'utilisateur quand
 * l'onglet correspond à sa plateforme, la fiche par défaut sinon.
 */
export function getGuideForFamily(
  family: InstallFamily,
  target?: InstallTarget | null,
): InstallGuide {
  const browser =
    target && target.family === family
      ? target.browser
      : DEFAULT_BROWSER[family]
  return getInstallGuide(family, browser)
}

// ── Bénéfices mis en avant dans le guide ─────────────────────────────────────

export type InstallBenefitIcon = 'offline' | 'fullscreen' | 'home' | 'shield'

export interface InstallBenefit {
  icon: InstallBenefitIcon
  title: string
  description: string
}

export const INSTALL_BENEFITS: InstallBenefit[] = [
  {
    icon: 'offline',
    title: 'Hors connexion',
    description:
      'Roadbook, photos et documents restent consultables en avion ou sans réseau.',
  },
  {
    icon: 'fullscreen',
    title: 'Plein écran',
    description:
      'Aucune barre d’adresse : l’affichage d’une vraie application.',
  },
  {
    icon: 'home',
    title: 'Sur l’écran d’accueil',
    description: 'Une icône à portée de pouce, sans passer par un magasin.',
  },
  {
    icon: 'shield',
    title: 'Vos données restent chez vous',
    description:
      'Tout est stocké sur votre appareil : rien n’est envoyé sur un serveur.',
  },
]
