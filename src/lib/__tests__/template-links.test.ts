import { analyticsEvents } from '@/lib/analytics/events'
import { readIncomingShare } from '@/lib/share'
import {
  TEMPLATE_PUBLIC_ORIGIN,
  getTemplateTakeUrl,
  getTemplateUrl,
  readIncomingTemplate,
  readTemplatePath,
  readTemplateTakeOptions,
  type IncomingTemplateVia,
} from '@/lib/template-links'
import { createTemplateId, isTemplateId } from '@/lib/template-model'

/** Un id tel que le serveur en produit : 16 caractères de base32 Crockford. */
const ID = 'k3v9x2mq8r7t4wza'

describe('getTemplateUrl', () => {
  it('donne le lien public permanent, sur la production', () => {
    expect(getTemplateUrl(ID)).toBe(
      'https://app.tripbrain.fr/m/k3v9x2mq8r7t4wza',
    )
    expect(TEMPLATE_PUBLIC_ORIGIN).toBe('https://app.tripbrain.fr')
  })

  it('accepte une autre origine, sans doubler la barre oblique', () => {
    expect(getTemplateUrl(ID, 'http://localhost:3000')).toBe(
      'http://localhost:3000/m/k3v9x2mq8r7t4wza',
    )
    expect(getTemplateUrl(ID, 'https://preprod.tripbrain.fr/')).toBe(
      'https://preprod.tripbrain.fr/m/k3v9x2mq8r7t4wza',
    )
  })

  it('se relit avec readTemplatePath', () => {
    const id = createTemplateId()
    expect(readTemplatePath(new URL(getTemplateUrl(id)).pathname)).toBe(id)
  })
})

describe('getTemplateTakeUrl', () => {
  it('mène à la reprise sur l’accueil', () => {
    expect(getTemplateTakeUrl(ID)).toBe(
      'https://app.tripbrain.fr/?modele=k3v9x2mq8r7t4wza',
    )
    expect(getTemplateTakeUrl(ID, {}, 'http://localhost:3000/')).toBe(
      'http://localhost:3000/?modele=k3v9x2mq8r7t4wza',
    )
  })

  it('reste sur le même hôte avec une origine vide', () => {
    expect(getTemplateTakeUrl(ID, { via: 'site' }, '')).toBe(
      '/?modele=k3v9x2mq8r7t4wza&from=site',
    )
  })

  it('ajoute l’étape et la provenance demandées, et elles seules', () => {
    expect(getTemplateTakeUrl(ID, { step: 'dates' })).toBe(
      'https://app.tripbrain.fr/?modele=k3v9x2mq8r7t4wza&etape=dates',
    )
    expect(getTemplateTakeUrl(ID, { via: 'site' })).toBe(
      'https://app.tripbrain.fr/?modele=k3v9x2mq8r7t4wza&from=site',
    )
    expect(getTemplateTakeUrl(ID, { step: 'dates', via: 'site' })).toBe(
      'https://app.tripbrain.fr/?modele=k3v9x2mq8r7t4wza&etape=dates&from=site',
    )
    // Un lien est la provenance par défaut, l'aperçu l'étape par défaut.
    expect(getTemplateTakeUrl(ID, { step: null, via: 'link' })).toBe(
      getTemplateTakeUrl(ID),
    )
  })

  it('se relit avec readIncomingTemplate, étape et provenance comprises', () => {
    const id = createTemplateId()
    for (const step of ['dates', null] as const) {
      for (const via of ['link', 'site'] as const) {
        expect(
          readIncomingTemplate(
            new URL(getTemplateTakeUrl(id, { step, via })).search,
          ),
        ).toEqual({ templateId: id, step, via })
      }
    }
  })
})

describe('readIncomingTemplate', () => {
  it('lit le modèle à reprendre, arrivé par un lien', () => {
    expect(readIncomingTemplate(`?modele=${ID}`)).toEqual({
      templateId: ID,
      step: null,
      via: 'link',
    })
  })

  it('reconnaît l’arrivée depuis le site vitrine', () => {
    expect(readIncomingTemplate(`?modele=${ID}&from=site`)).toEqual({
      templateId: ID,
      step: null,
      via: 'site',
    })
  })

  it('compte toute autre provenance comme un lien', () => {
    expect(readIncomingTemplate(`?modele=${ID}&from=generator`)).toEqual({
      templateId: ID,
      step: null,
      via: 'link',
    })
  })

  it('ouvre la reprise sur les dates avec etape=dates', () => {
    expect(readIncomingTemplate(`?etape=dates&modele=${ID}`)).toEqual({
      templateId: ID,
      step: 'dates',
      via: 'link',
    })
    expect(readIncomingTemplate(`?modele=${ID}&from=site&etape=dates`)).toEqual(
      { templateId: ID, step: 'dates', via: 'site' },
    )
  })

  it('ignore toute autre étape', () => {
    for (const step of ['jours', 'DATES', '', 'dates ']) {
      expect(
        readIncomingTemplate(`?modele=${ID}&etape=${encodeURIComponent(step)}`)
          ?.step,
      ).toBeNull()
    }
  })

  it('lit la query avec ou sans point d’interrogation', () => {
    expect(readIncomingTemplate(`modele=${ID}`)?.templateId).toBe(ID)
  })

  it('ne voit rien dans une URL sans modèle', () => {
    expect(readIncomingTemplate('')).toBeNull()
    expect(readIncomingTemplate('?code=48205137')).toBeNull()
    expect(readIncomingTemplate('?modele=')).toBeNull()
    expect(readIncomingTemplate('?etape=dates&from=site')).toBeNull()
  })

  it('refuse un id qui n’a pas la forme d’un id de modèle', () => {
    // Trop court, majuscules, lettres exclues du base32 de Crockford (i, l, o, u).
    for (const id of [
      'k3v9x2mq',
      'K3V9X2MQ8R7T4WZA',
      'k3v9x2mq8r7t4wzi',
      'k3v9x2mq8r7t4wzu',
      `${ID}0`,
      '../../api/share',
    ]) {
      expect(
        readIncomingTemplate(`?modele=${encodeURIComponent(id)}`),
      ).toBeNull()
    }
  })

  it('n’offre à la mesure que des chemins déclarés dans le catalogue', () => {
    const vias: IncomingTemplateVia[] = ['link', 'site']
    const declared: readonly string[] =
      analyticsEvents.template_opened.properties.via.values
    for (const via of vias) expect(declared).toContain(via)
  })
})

describe('readTemplateTakeOptions', () => {
  it('lit l’étape et la provenance d’une page /m/<id>, sans exiger de modèle', () => {
    expect(readTemplateTakeOptions('?from=site&etape=dates')).toEqual({
      step: 'dates',
      via: 'site',
    })
    expect(readTemplateTakeOptions('')).toEqual({ step: null, via: 'link' })
  })
})

describe('readIncomingShare reste à l’écart des modèles', () => {
  it('ne prend pas un modèle pour un partage', () => {
    expect(readIncomingShare(`?modele=${ID}`, '')).toBeNull()
    expect(readIncomingShare(`?modele=${ID}&from=site`, '')).toBeNull()
  })
})

describe('readTemplatePath', () => {
  it('lit l’id d’un chemin /m/<id>, avec ou sans barre finale', () => {
    expect(readTemplatePath(`/m/${ID}`)).toBe(ID)
    expect(readTemplatePath(`/m/${ID}/`)).toBe(ID)
  })

  it('ignore tout autre chemin', () => {
    expect(readTemplatePath('/')).toBeNull()
    expect(readTemplatePath('/m/')).toBeNull()
    expect(readTemplatePath(`/s/${ID}`)).toBeNull()
    expect(readTemplatePath(`/m/${ID}/v/2`)).toBeNull()
    expect(readTemplatePath(`/x/m/${ID}`)).toBeNull()
    expect(readTemplatePath(`/m/${ID}//`)).toBeNull()
    expect(readTemplatePath('/m/k3v9x2mq')).toBeNull()
    expect(readTemplatePath('/guide')).toBeNull()
  })

  it('accepte tout id que le serveur peut produire', () => {
    for (let i = 0; i < 20; i++) {
      const id = createTemplateId()
      expect(isTemplateId(id)).toBe(true)
      expect(readTemplatePath(`/m/${id}`)).toBe(id)
    }
  })
})
