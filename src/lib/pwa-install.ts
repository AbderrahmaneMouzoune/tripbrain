/**
 * Détection de l'environnement d'installation et marche à suivre associée.
 *
 * Les navigateurs n'exposent pas tous une invite native (`beforeinstallprompt`) :
 * sur iOS, et sur plusieurs navigateurs Android/desktop, l'utilisateur doit
 * passer par un menu. Ce module traduit le user-agent en une poignée d'étapes,
 * sans dépendre du DOM pour rester testable.
 *
 * Les libellés sont volontairement courts : on installe une app en regardant
 * son écran, pas en lisant un mode d'emploi.
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
  /** Une ligne, l'action à faire — pas une phrase. */
  title: string
  /** Précision réservée aux étapes où l'on peut se tromper de bouton. */
  detail?: string
}

export interface InstallGuide {
  id: string
  family: InstallFamily
  /** Navigateur ciblé par la fiche, ex. « Safari ». */
  browserLabel: string
  steps: InstallStep[]
  /** Réserve ou alternative, en une phrase. */
  note?: string
  /** Le navigateur n'installe pas les applications web : `steps` est vide. */
  unsupported?: boolean
}

export const INSTALL_FAMILIES: { id: InstallFamily; label: string }[] = [
  { id: 'ios', label: 'iPhone' },
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
  browserLabel: 'Safari',
  steps: [
    {
      icon: 'share',
      title: 'Bouton Partager',
      detail: 'Le carré avec une flèche, dans la barre Safari.',
    },
    { icon: 'plus', title: '« Sur l’écran d’accueil »' },
    { icon: 'check', title: '« Ajouter »' },
  ],
}

const IOS_OTHER: InstallGuide = {
  id: 'ios-other',
  family: 'ios',
  browserLabel: 'Chrome, Firefox, Edge',
  steps: [
    { icon: 'share', title: 'Bouton Partager' },
    { icon: 'plus', title: '« Ajouter à l’écran d’accueil »' },
    { icon: 'check', title: '« Ajouter »' },
  ],
  note: 'Plus fiable depuis Safari.',
}

const ANDROID_CHROME: InstallGuide = {
  id: 'android-chrome',
  family: 'android',
  browserLabel: 'Chrome, Edge, Opera',
  steps: [
    { icon: 'menu', title: 'Menu ⋮, en haut à droite' },
    {
      icon: 'download',
      title: '« Installer l’application »',
      detail: 'Parfois libellé « Ajouter à l’écran d’accueil ».',
    },
    { icon: 'check', title: '« Installer »' },
  ],
}

const ANDROID_SAMSUNG: InstallGuide = {
  id: 'android-samsung',
  family: 'android',
  browserLabel: 'Samsung Internet',
  steps: [
    { icon: 'menu', title: 'Menu ☰, en bas à droite' },
    { icon: 'plus', title: '« Ajouter la page à » → « Écran d’accueil »' },
    { icon: 'check', title: '« Ajouter »' },
  ],
}

const ANDROID_FIREFOX: InstallGuide = {
  id: 'android-firefox',
  family: 'android',
  browserLabel: 'Firefox',
  steps: [
    { icon: 'menu', title: 'Menu ⋮' },
    { icon: 'plus', title: '« Ajouter à l’écran d’accueil »' },
    { icon: 'check', title: '« Ajouter »' },
  ],
}

const DESKTOP_CHROMIUM: InstallGuide = {
  id: 'desktop-chromium',
  family: 'desktop',
  browserLabel: 'Chrome, Edge, Opera',
  steps: [
    {
      icon: 'browser',
      title: 'Icône d’installation dans la barre d’adresse',
      detail: 'Sinon : menu ⋮ → « Installer TripBrain… ».',
    },
    { icon: 'check', title: '« Installer »' },
  ],
}

const DESKTOP_SAFARI: InstallGuide = {
  id: 'desktop-safari',
  family: 'desktop',
  browserLabel: 'Safari (macOS)',
  steps: [
    { icon: 'browser', title: 'Menu « Fichier »' },
    { icon: 'plus', title: '« Ajouter au Dock… »' },
  ],
  note: 'À partir de macOS Sonoma.',
}

const DESKTOP_FIREFOX: InstallGuide = {
  id: 'desktop-firefox',
  family: 'desktop',
  browserLabel: 'Firefox',
  steps: [],
  unsupported: true,
  note: 'Firefox n’installe pas les applications web. Ouvrez TripBrain dans Chrome, Edge ou Safari.',
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
