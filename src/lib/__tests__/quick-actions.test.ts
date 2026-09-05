import { describe, it, expect, vi } from 'vitest'
import type {
  Accommodation,
  Activity,
  DayItinerary,
  Transport,
} from '../itinerary-data'
import {
  buildAccommodationActions,
  buildActivityActions,
  buildDayActions,
  buildTransportActions,
  type QuickAction,
} from '../quick-actions'

function makeDay(overrides: Partial<DayItinerary> = {}): DayItinerary {
  return {
    id: 'day-1',
    date: '2026-05-10',
    dayNumber: 1,
    city: 'Shanghai',
    title: 'Arrivée à Shanghai',
    coordinates: [31.2304, 121.4737],
    activities: [],
    ...overrides,
  }
}

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return { id: 'act-1', name: 'Temple Jing’an', type: 'visit', ...overrides }
}

function makeTransport(overrides: Partial<Transport> = {}): Transport {
  return { id: 'tr-1', type: 'train', ...overrides }
}

function makeAccommodation(
  overrides: Partial<Accommodation> = {},
): Accommodation {
  return {
    id: 'acc-1',
    name: 'B&B Jing’an',
    address: '123 rue de Shanghai',
    bookingUrl: '',
    checkIn: '2026-05-10',
    checkOut: '2026-05-12',
    ...overrides,
  }
}

/** Poignées inertes : chaque test n'observe que celles qui l'intéressent. */
function dayHandlers() {
  return {
    onEdit: vi.fn(),
    onAddActivity: vi.fn(),
    onAddTransport: vi.fn(),
    onAddAccommodation: vi.fn(),
    onCopy: vi.fn(),
  }
}

function activityHandlers() {
  return {
    onEdit: vi.fn(),
    onStatusChange: vi.fn(),
    onMove: vi.fn(),
    onDelete: vi.fn(),
    onCopy: vi.fn(),
  }
}

function entityHandlers() {
  return { onEdit: vi.fn(), onDelete: vi.fn(), onCopy: vi.fn() }
}

const ids = (actions: readonly QuickAction[]) =>
  actions.map((action) => action.id)

function find(actions: readonly QuickAction[], id: string): QuickAction {
  const action = actions.find((candidate) => candidate.id === id)
  if (!action) throw new Error(`action absente : ${id}`)
  return action
}

describe('buildDayActions', () => {
  it('propose de créer ce que la journée n’a pas encore', () => {
    const actions = buildDayActions(makeDay(), dayHandlers())

    expect(ids(actions)).toContain('day-add-transport')
    expect(ids(actions)).toContain('day-add-accommodation')
  })

  it('ne repropose pas un transport ni un hébergement déjà présents', () => {
    const day = makeDay({
      transport: makeTransport(),
      accommodation: makeAccommodation(),
    })

    const actions = buildDayActions(day, dayHandlers())

    expect(ids(actions)).not.toContain('day-add-transport')
    expect(ids(actions)).not.toContain('day-add-accommodation')
  })

  it('copie le titre et la ville, sans séparateur en trop', () => {
    const handlers = dayHandlers()

    find(buildDayActions(makeDay(), handlers), 'day-copy').run?.()
    expect(handlers.onCopy).toHaveBeenCalledWith('Arrivée à Shanghai — Shanghai')

    const handlersSansVille = dayHandlers()
    find(
      buildDayActions(makeDay({ city: '' }), handlersSansVille),
      'day-copy',
    ).run?.()
    expect(handlersSansVille.onCopy).toHaveBeenCalledWith('Arrivée à Shanghai')
  })
})

describe('buildActivityActions', () => {
  it('propose les statuts autres que celui en cours', () => {
    const planned = buildActivityActions(makeActivity(), activityHandlers())
    expect(ids(planned)).toEqual(
      expect.arrayContaining([
        'activity-status-done',
        'activity-status-skipped',
      ]),
    )
    expect(ids(planned)).not.toContain('activity-status-planned')

    const done = buildActivityActions(
      makeActivity({ status: 'done' }),
      activityHandlers(),
    )
    expect(ids(done)).not.toContain('activity-status-done')
    expect(ids(done)).toContain('activity-status-planned')
  })

  it('applique le statut choisi', () => {
    const handlers = activityHandlers()
    const actions = buildActivityActions(makeActivity(), handlers)

    find(actions, 'activity-status-done').run?.()

    expect(handlers.onStatusChange).toHaveBeenCalledWith('done')
  })

  it('ne propose un déplacement que là où il est possible', () => {
    const handlers = activityHandlers()
    const actions = buildActivityActions(makeActivity(), handlers, {
      canMoveUp: false,
      canMoveDown: true,
    })

    expect(ids(actions)).not.toContain('activity-move-up')
    find(actions, 'activity-move-down').run?.()
    expect(handlers.onMove).toHaveBeenCalledWith(1)
  })

  it('copie l’adresse quand il y en a une, le nom sinon', () => {
    const avecAdresse = activityHandlers()
    find(
      buildActivityActions(
        makeActivity({ address: '1788 Nanjing Rd' }),
        avecAdresse,
      ),
      'activity-copy-address',
    ).run?.()
    expect(avecAdresse.onCopy).toHaveBeenCalledWith('1788 Nanjing Rd')

    const sansAdresse = activityHandlers()
    const actions = buildActivityActions(makeActivity(), sansAdresse)
    expect(ids(actions)).not.toContain('activity-copy-address')
    find(actions, 'activity-copy-name').run?.()
    expect(sansAdresse.onCopy).toHaveBeenCalledWith('Temple Jing’an')
  })

  it('vise les coordonnées en priorité pour la carte', () => {
    const actions = buildActivityActions(
      makeActivity({ coordinates: [31.223, 121.446], address: 'Nanjing Rd' }),
      activityHandlers(),
    )

    expect(find(actions, 'activity-map').href).toContain('31.223%2C121.446')
  })

  it('n’ouvre une carte ou une réservation que s’il y a de quoi', () => {
    const actions = buildActivityActions(makeActivity(), activityHandlers())

    expect(ids(actions)).not.toContain('activity-map')
    expect(ids(actions)).not.toContain('activity-booking')
  })

  it('termine par une suppression, à confirmer', () => {
    const handlers = activityHandlers()
    const actions = buildActivityActions(makeActivity(), handlers)
    const remove = actions[actions.length - 1]

    expect(remove.id).toBe('activity-delete')
    expect(remove.confirm).toBe(true)
    expect(remove.destructive).toBe(true)

    remove.run?.()
    expect(handlers.onDelete).toHaveBeenCalledOnce()
  })
})

describe('buildTransportActions', () => {
  it('pointe la carte sur le départ, ou sur l’arrivée en voiture', () => {
    const train = buildTransportActions(
      makeTransport({ from: 'Shanghai', to: 'Qingdao' }),
      entityHandlers(),
    )
    expect(find(train, 'transport-map').href).toContain('Shanghai')

    const voiture = buildTransportActions(
      makeTransport({ type: 'car', from: 'Shanghai', to: 'Qingdao' }),
      entityHandlers(),
    )
    expect(find(voiture, 'transport-map').href).toContain('Qingdao')
  })

  it("préfère l'adresse de départ au nom de la ville", () => {
    const actions = buildTransportActions(
      makeTransport({ from: 'Shanghai', departureAddress: 'Gare Hongqiao' }),
      entityHandlers(),
    )

    expect(find(actions, 'transport-map').href).toContain('Gare%20Hongqiao')
  })

  it('ne propose billet et référence que quand ils existent', () => {
    const nu = buildTransportActions(makeTransport(), entityHandlers())
    expect(ids(nu)).not.toContain('transport-booking')
    expect(ids(nu)).not.toContain('transport-copy-reference')
    expect(ids(nu)).not.toContain('transport-map')

    const handlers = entityHandlers()
    const complet = buildTransportActions(
      makeTransport({
        bookingReference: 'G195-12F',
        bookingUrl: 'https://example.test/billet',
      }),
      handlers,
    )
    expect(find(complet, 'transport-booking').href).toBe(
      'https://example.test/billet',
    )

    find(complet, 'transport-copy-reference').run?.()
    expect(handlers.onCopy).toHaveBeenCalledWith('G195-12F')
  })
})

describe('buildAccommodationActions', () => {
  it('trace un itinéraire vers le nom et l’adresse', () => {
    const actions = buildAccommodationActions(
      makeAccommodation(),
      entityHandlers(),
    )
    const map = find(actions, 'accommodation-map')

    expect(map.href).toContain('/maps/dir/')
    expect(map.href).toContain(encodeURIComponent('B&B Jing’an'))
  })

  it('ignore une adresse ou un lien vides', () => {
    const actions = buildAccommodationActions(
      makeAccommodation({ address: '   ', bookingUrl: '' }),
      entityHandlers(),
    )

    expect(ids(actions)).not.toContain('accommodation-copy-address')
    expect(ids(actions)).not.toContain('accommodation-booking')
  })

  it('demande une confirmation avant de supprimer', () => {
    const handlers = entityHandlers()
    const actions = buildAccommodationActions(makeAccommodation(), handlers)
    const remove = find(actions, 'accommodation-delete')

    expect(remove.confirm).toBe(true)
    expect(remove.confirmLabel).toBeTruthy()

    remove.run?.()
    expect(handlers.onDelete).toHaveBeenCalledOnce()
  })
})
