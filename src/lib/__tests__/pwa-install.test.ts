import { describe, it, expect } from 'vitest'
import {
  detectInstallTarget,
  familyOf,
  getGuideForFamily,
  getInstallGuide,
  INSTALL_FAMILIES,
} from '../pwa-install'

// User-agents réels, tronqués aux segments qui portent la détection.
const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0.6312.52 Mobile/15E148 Safari/604.1',
  iphoneFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/124.0 Mobile/15E148 Safari/605.1.15',
  ipadOs:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
  androidSamsung:
    'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
  androidFirefox:
    'Mozilla/5.0 (Android 14; Mobile; rv:124.0) Gecko/124.0 Firefox/124.0',
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.2420.65',
  windowsFirefox:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  linuxOpera:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 OPR/108.0.0.0',
}

describe('detectInstallTarget', () => {
  it('reconnaît Safari sur iPhone', () => {
    expect(detectInstallTarget(UA.iphoneSafari)).toEqual({
      os: 'ios',
      browser: 'safari',
      family: 'ios',
    })
  })

  it('reconnaît Chrome et Firefox iOS malgré leur suffixe Safari', () => {
    expect(detectInstallTarget(UA.iphoneChrome).browser).toBe('chrome')
    expect(detectInstallTarget(UA.iphoneFirefox).browser).toBe('firefox')
    expect(detectInstallTarget(UA.iphoneChrome).os).toBe('ios')
  })

  it('distingue un iPad (tactile) d’un Mac malgré un user-agent identique', () => {
    expect(detectInstallTarget(UA.ipadOs, { maxTouchPoints: 5 }).os).toBe('ios')
    expect(detectInstallTarget(UA.macSafari, { maxTouchPoints: 0 }).os).toBe(
      'macos',
    )
  })

  it('reconnaît les navigateurs Android', () => {
    expect(detectInstallTarget(UA.androidChrome)).toEqual({
      os: 'android',
      browser: 'chrome',
      family: 'android',
    })
    expect(detectInstallTarget(UA.androidSamsung).browser).toBe('samsung')
    expect(detectInstallTarget(UA.androidFirefox).browser).toBe('firefox')
  })

  it('reconnaît les navigateurs de bureau', () => {
    expect(detectInstallTarget(UA.windowsChrome)).toEqual({
      os: 'windows',
      browser: 'chrome',
      family: 'desktop',
    })
    // Edge et Opera embarquent « Chrome » : l'ordre des tests doit les isoler.
    expect(detectInstallTarget(UA.windowsEdge).browser).toBe('edge')
    expect(detectInstallTarget(UA.linuxOpera).browser).toBe('opera')
    expect(detectInstallTarget(UA.windowsFirefox).browser).toBe('firefox')
    expect(detectInstallTarget(UA.macSafari).browser).toBe('safari')
  })

  it('retombe sur « unknown » sans planter pour un user-agent vide', () => {
    expect(detectInstallTarget('')).toEqual({
      os: 'unknown',
      browser: 'other',
      family: 'desktop',
    })
  })
})

describe('familyOf', () => {
  it('regroupe tous les postes fixes dans la famille « desktop »', () => {
    expect(familyOf('ios')).toBe('ios')
    expect(familyOf('android')).toBe('android')
    expect(familyOf('macos')).toBe('desktop')
    expect(familyOf('windows')).toBe('desktop')
    expect(familyOf('linux')).toBe('desktop')
    expect(familyOf('unknown')).toBe('desktop')
  })
})

describe('getInstallGuide', () => {
  it('donne la procédure Safari sur iOS et la variante « Partager » ailleurs', () => {
    expect(getInstallGuide('ios', 'safari').id).toBe('ios-safari')
    expect(getInstallGuide('ios', 'chrome').id).toBe('ios-other')
    // La variante non-Safari signale que Safari reste le chemin le plus sûr.
    expect(getInstallGuide('ios', 'chrome').note).toContain('Safari')
  })

  it('adapte la procédure Android au navigateur', () => {
    expect(getInstallGuide('android', 'chrome').id).toBe('android-chrome')
    expect(getInstallGuide('android', 'edge').id).toBe('android-chrome')
    expect(getInstallGuide('android', 'samsung').id).toBe('android-samsung')
    expect(getInstallGuide('android', 'firefox').id).toBe('android-firefox')
  })

  it('sépare Chromium, Safari macOS et Firefox sur ordinateur', () => {
    expect(getInstallGuide('desktop', 'chrome').id).toBe('desktop-chromium')
    expect(getInstallGuide('desktop', 'edge').id).toBe('desktop-chromium')
    expect(getInstallGuide('desktop', 'safari').id).toBe('desktop-safari')
    expect(getInstallGuide('desktop', 'firefox').id).toBe('desktop-firefox')
  })

  it('marque Firefox bureau comme non installable, avec une alternative', () => {
    const guide = getInstallGuide('desktop', 'firefox')
    expect(guide.unsupported).toBe(true)
    expect(guide.steps).toHaveLength(0)
    expect(guide.note).toBeTruthy()
  })

  it('fournit des étapes numérotables partout ailleurs', () => {
    for (const family of INSTALL_FAMILIES) {
      const guide = getInstallGuide(family.id, 'chrome')
      expect(guide.family).toBe(family.id)
      expect(guide.steps.length).toBeGreaterThan(0)
      for (const step of guide.steps) expect(step.title).not.toBe('')
    }
  })
})

describe('getGuideForFamily', () => {
  const target = detectInstallTarget(UA.androidSamsung)

  it('utilise le navigateur détecté pour l’onglet de la plateforme courante', () => {
    expect(getGuideForFamily('android', target).id).toBe('android-samsung')
  })

  it('retombe sur le navigateur par défaut pour les autres onglets', () => {
    expect(getGuideForFamily('ios', target).id).toBe('ios-safari')
    expect(getGuideForFamily('desktop', target).id).toBe('desktop-chromium')
  })

  it('fonctionne avant la détection, côté serveur', () => {
    expect(getGuideForFamily('ios', null).id).toBe('ios-safari')
    expect(getGuideForFamily('android', undefined).id).toBe('android-chrome')
  })
})
