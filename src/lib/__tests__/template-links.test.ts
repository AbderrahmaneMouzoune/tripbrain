import { analyticsEvents } from '@/lib/analytics/events'
import { readIncomingShare } from '@/lib/share'
import {
  TEMPLATE_PUBLIC_ORIGIN,
  getTemplateTakeUrl,
  getTemplateUrl,
  readIncomingTemplate,
  readTemplatePath,
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
    expect(getTemplateTakeUrl(ID, 'http://localhost:3000/')).toBe(
      'http://localhost:3000/?modele=k3v9x2mq8r7t4wza',
    )
  })

  it('se relit avec readIncomingTemplate', () => {
    const id = createTemplateId()
    expect(
      readIncomingTemplate(new URL(getTemplateTakeUrl(id)).search),
    ).toEqual({ templateId: id, via: 'link' })
  })
})

describe('readIncomingTemplate', () => {
  it('lit le modèle à reprendre, arrivé par un lien', () => {
    expect(readIncomingTemplate(`?modele=${ID}`)).toEqual({
      templateId: ID,
      via: 'link',
    })
  })

  it('reconnaît l’arrivée depuis le site vitrine', () => {
    expect(readIncomingTemplate(`?modele=${ID}&from=site`)).toEqual({
      templateId: ID,
      via: 'site',
    })
  })

  it('compte toute autre provenance comme un lien', () => {
    expect(readIncomingTemplate(`?modele=${ID}&from=generator`)).toEqual({
      templateId: ID,
      via: 'link',
    })
  })

  it('lit la query avec ou sans point d’interrogation', () => {
    expect(readIncomingTemplate(`modele=${ID}`)?.templateId).toBe(ID)
  })

  it('ne voit rien dans une URL sans modèle', () => {
    expect(readIncomingTemplate('')).toBeNull()
    expect(readIncomingTemplate('?code=48205137')).toBeNull()
    expect(readIncomingTemplate('?modele=')).toBeNull()
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
