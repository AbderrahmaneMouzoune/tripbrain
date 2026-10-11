import { syncGroupTrip, type GroupSyncApi } from '@/lib/group-sync-engine'
import { GroupNotFoundError, type GroupState } from '@/lib/group-sync'
import type { DayItinerary } from '@/lib/itinerary-data'
import type { StoredTrip } from '@/lib/trips'

function day(id: string, title: string, extra: Partial<DayItinerary> = {}) {
  return {
    id,
    date: '2027-05-10',
    dayNumber: 1,
    city: 'Lisbonne',
    title,
    coordinates: [38.7, -9.1],
    activities: [],
    ...extra,
  } as unknown as DayItinerary
}

/** Faux serveur : garde une version et n'accepte qu'une écriture à jour. */
function fakeServer(initial: { itinerary: DayItinerary[]; title: string }) {
  let version = 1
  let state: GroupState = {
    data: JSON.stringify(initial.itinerary),
    title: initial.title,
    author: 'Léa',
    etag: '"v1"',
    updatedAt: '2027-01-01T10:00:00.000Z',
  }
  let gone = false
  const api: GroupSyncApi = {
    compress: async (itinerary) => JSON.stringify(itinerary),
    decompress: (data) => JSON.parse(data),
    async fetch(_id, etag) {
      if (gone) throw new GroupNotFoundError()
      return etag === state.etag
        ? { status: 'unchanged' }
        : { status: 'changed', state }
    },
    async push(_id, body, ifMatch) {
      if (gone) throw new GroupNotFoundError()
      if (ifMatch !== state.etag) return { status: 'conflict', current: state }
      version++
      state = {
        data: body.data,
        title: body.title,
        author: body.author,
        etag: `"v${version}"`,
        updatedAt: `2027-01-01T10:0${version}:00.000Z`,
      }
      return { status: 'saved', etag: state.etag, updatedAt: state.updatedAt }
    },
  }
  return {
    api,
    /** Un autre téléphone écrit directement. */
    write(itinerary: DayItinerary[], author = 'Karim') {
      version++
      state = {
        ...state,
        data: JSON.stringify(itinerary),
        author,
        etag: `"v${version}"`,
      }
    },
    read: () => JSON.parse(state.data) as DayItinerary[],
    remove: () => {
      gone = true
    },
  }
}

const initial = [day('d1', 'Alfama'), day('d2', 'Belém')]

function syncedTrip(itinerary = initial): StoredTrip {
  return {
    id: 'trip-1',
    title: 'Lisbonne',
    itinerary,
    source: 'share',
    createdAt: 0,
    updatedAt: 0,
    group: {
      id: 'g'.repeat(22),
      etag: '"v1"',
      base: { title: 'Lisbonne', itinerary: initial },
      dirty: false,
      syncedAt: 0,
      lastAuthor: 'Léa',
      remoteUpdatedAt: 0,
    },
  }
}

describe('syncGroupTrip', () => {
  it('ne télécharge rien quand personne n’a rien changé', async () => {
    const server = fakeServer({ itinerary: initial, title: 'Lisbonne' })
    const outcome = await syncGroupTrip(
      syncedTrip(),
      server.api,
      'Moi',
      () => 5,
    )
    expect(outcome.kind).toBe('unchanged')
    expect(outcome.trip.group?.syncedAt).toBe(5)
  })

  it('récupère les modifications des autres', async () => {
    const server = fakeServer({ itinerary: initial, title: 'Lisbonne' })
    server.write([day('d1', 'Alfama et Graça'), day('d2', 'Belém')])
    const outcome = await syncGroupTrip(syncedTrip(), server.api, 'Moi')
    expect(outcome.kind).toBe('received')
    if (outcome.kind !== 'received') return
    expect(outcome.author).toBe('Karim')
    expect(outcome.trip.itinerary[0].title).toBe('Alfama et Graça')
    expect(outcome.trip.group?.base?.itinerary[0].title).toBe('Alfama et Graça')
  })

  it('envoie une modification locale', async () => {
    const server = fakeServer({ itinerary: initial, title: 'Lisbonne' })
    const trip = syncedTrip([day('d1', 'Alfama'), day('d2', 'Belém et LX')])
    trip.group!.dirty = true
    const outcome = await syncGroupTrip(trip, server.api, 'Moi')
    expect(outcome.kind).toBe('sent')
    expect(outcome.trip.group?.dirty).toBe(false)
    expect(server.read()[1].title).toBe('Belém et LX')
  })

  it('fusionne quand quelqu’un a écrit entre-temps, sans rien perdre', async () => {
    const server = fakeServer({ itinerary: initial, title: 'Lisbonne' })
    server.write([day('d1', 'Alfama et Graça'), day('d2', 'Belém')])
    const trip = syncedTrip([day('d1', 'Alfama'), day('d2', 'Belém et LX')])
    trip.group!.dirty = true

    const outcome = await syncGroupTrip(trip, server.api, 'Moi')
    expect(outcome.kind).toBe('sent')
    if (outcome.kind !== 'sent') return
    expect(outcome.receivedFrom).toBe('Karim')
    expect(outcome.conflicts).toBe(0)
    expect(server.read().map((d) => d.title)).toEqual([
      'Alfama et Graça',
      'Belém et LX',
    ])
    expect(outcome.trip.itinerary).toEqual(server.read())
  })

  it('n’envoie rien si la fusion retombe sur la version du serveur', async () => {
    const server = fakeServer({ itinerary: initial, title: 'Lisbonne' })
    const same = [day('d1', 'Alfama et Graça'), day('d2', 'Belém')]
    server.write(same)
    const trip = syncedTrip(same)
    trip.group!.dirty = true
    const outcome = await syncGroupTrip(trip, server.api, 'Moi')
    expect(outcome.kind).toBe('received')
    expect(outcome.trip.group?.dirty).toBe(false)
  })

  it('détache le voyage quand le groupe a disparu', async () => {
    const server = fakeServer({ itinerary: initial, title: 'Lisbonne' })
    server.remove()
    const outcome = await syncGroupTrip(syncedTrip(), server.api, 'Moi')
    expect(outcome.kind).toBe('gone')
    expect(outcome.trip.group).toBeUndefined()
    expect(outcome.trip.itinerary).toEqual(initial)
  })
})
