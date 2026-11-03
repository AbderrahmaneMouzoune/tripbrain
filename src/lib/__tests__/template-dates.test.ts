// Flou des dates d'un modèle publié (`template-dates.ts`) : exemples, puis
// propriétés sur des voyages tirés au hasard (`FUZZ_RUNS`, `FUZZ_SEED`).

import type { DayItinerary } from '@/lib/itinerary-data'
import { isIsoDate, toDayNumber } from '@/lib/iso-date'
import {
  blurTemplateDates,
  templateDateAnchor,
  templateDateOffset,
} from '@/lib/template-dates'
import { tripYear } from '@/lib/template-model'
import {
  checkProperty,
  randomClock,
  randomItinerary,
  refIsIsoDate,
  refShiftDeep,
  type Rng,
} from './helpers/random-itinerary'
import { activity, day, hotel, transport } from './helpers/template-fixtures'

/** Un voyage préparé, pas encore fait : départ le samedi 17 avril 2027. */
function upcomingTrip(): DayItinerary[] {
  return [
    day(1, {
      date: '2027-04-17',
      accommodation: hotel({
        checkIn: '2027-04-17T15:00',
        checkOut: '2027-04-19T11:00',
      }),
      activities: [activity({ openAt: '09:00–17:00' })],
    }),
    day(2, { date: '2027-04-18' }),
    day(3, {
      date: '2027-04-19',
      city: 'Kyoto',
      transport: transport({
        departureTime: '2027-04-19T09:12+09:00',
        arrivalTime: '2027-04-19 11:24',
        details: 'Shinkansen du 2027-04-19, voiture 7',
      }),
    }),
  ]
}

function weekday(iso: string): number {
  return ((toDayNumber(iso.slice(0, 10)) % 7) + 7) % 7
}

describe('templateDateOffset', () => {
  it('recule par semaines entières jusqu’à la première semaine du mois', () => {
    expect(templateDateOffset('2027-04-01')).toBe(0)
    expect(templateDateOffset('2027-04-07')).toBe(0)
    expect(templateDateOffset('2027-04-08')).toBe(-7)
    expect(templateDateOffset('2027-04-17')).toBe(-14)
    expect(templateDateOffset('2027-04-22')).toBe(-21)
    expect(templateDateOffset('2027-04-28')).toBe(-21)
    expect(templateDateOffset('2027-01-29')).toBe(-28)
    expect(templateDateOffset('2027-01-31')).toBe(-28)
  })
})

describe('templateDateAnchor', () => {
  it('prend la première date seule, sinon la première date-heure, sinon rien', () => {
    expect(templateDateAnchor(upcomingTrip())).toBe('2027-04-17')
    expect(
      templateDateAnchor([
        day(1, { date: '' }),
        day(2, { date: '2027-04-17T00:00' }),
        day(3, { date: '2027-04-18' }),
      ]),
    ).toBe('2027-04-18')
    expect(
      templateDateAnchor([
        day(1, { date: '2027-02-30' }),
        day(2, { date: '2027-04-17 09:30' }),
        day(3, { date: '2027-04-18T10:00' }),
      ]),
    ).toBe('2027-04-17')
    expect(templateDateAnchor([day(1, { date: 'à définir' })])).toBeNull()
    expect(templateDateAnchor([])).toBeNull()
  })
})

describe('blurTemplateDates', () => {
  it('recule tout le voyage de deux semaines : même samedi d’avril, quantième caché', () => {
    const blurred = blurTemplateDates(upcomingTrip())

    expect(blurred.map((d) => d.date)).toEqual([
      '2027-04-03',
      '2027-04-04',
      '2027-04-05',
    ])
    expect(blurred[0].accommodation).toMatchObject({
      checkIn: '2027-04-03T15:00',
      checkOut: '2027-04-05T11:00',
    })
    expect(blurred[2].transport).toMatchObject({
      departureTime: '2027-04-05T09:12+09:00',
      arrivalTime: '2027-04-05 11:24',
      // Un texte libre n'est pas une date : il part tel quel.
      details: 'Shinkansen du 2027-04-19, voiture 7',
    })
    expect(blurred[0].activities[0].openAt).toBe('09:00–17:00')
    expect(weekday(blurred[0].date)).toBe(weekday('2027-04-17'))
    expect(tripYear(blurred)).toBe(2027)
    expect(JSON.stringify(blurred)).not.toMatch(/2027-04-1[789](?!, voiture)/)
  })

  it('laisse tel quel un voyage dont le jour 1 est déjà dans la première semaine', () => {
    const trip = upcomingTrip().map((d, index) => ({
      ...d,
      date: `2027-04-0${index + 2}`,
    }))
    const blurred = blurTemplateDates(trip)
    expect(blurred).toEqual(trip)
    expect(blurred).not.toBe(trip)
  })

  it('recule de 4 semaines un départ le 29, le 30 ou le 31', () => {
    const blurred = blurTemplateDates([
      day(1, { date: '2028-01-31' }),
      day(2, { date: '2028-02-01' }),
    ])
    expect(blurred.map((d) => d.date)).toEqual(['2028-01-03', '2028-01-04'])
  })

  it('garde les ids, même quand ils ont la forme d’une date', () => {
    const blurred = blurTemplateDates([
      day(1, {
        id: '2027-04-17',
        date: '2027-04-17',
        activities: [activity({ id: '2027-04-17T10:00' })],
        accommodation: hotel({ id: '2027-04-17' }),
        transport: transport({ id: '2027-04-17 09:00' }),
      }),
    ])
    expect(blurred[0]).toMatchObject({
      id: '2027-04-17',
      date: '2027-04-03',
      activities: [{ id: '2027-04-17T10:00' }],
      accommodation: { id: '2027-04-17' },
      transport: { id: '2027-04-17 09:00' },
    })
  })

  it('se repère sur la première journée datée quand le jour 1 n’a pas de date', () => {
    // Sans quoi les dates exactes d'un voyage à venir partaient telles
    // quelles dès que son jour 1 était « à définir ».
    for (const date of ['', 'à définir', '2027-02-30', '17/04/2027']) {
      const trip = [
        day(1, { date }),
        day(2, {
          date: '2027-04-18',
          accommodation: hotel({
            checkIn: '2027-04-18T15:00',
            checkOut: '2027-04-19T11:00',
          }),
        }),
        day(3, { date: '2027-04-19' }),
      ]
      const blurred = blurTemplateDates(trip)
      expect(blurred.map((d) => d.date)).toEqual([
        date,
        '2027-04-04',
        '2027-04-05',
      ])
      expect(blurred[1].accommodation).toMatchObject({
        checkIn: '2027-04-04T15:00',
        checkOut: '2027-04-05T11:00',
      })
      expect(weekday(blurred[1].date)).toBe(weekday('2027-04-18'))
      expect(tripYear(blurred)).toBe(2027)
      expect(blurTemplateDates(blurred)).toEqual(blurred)
    }
  })

  it('décale aussi un jour 1 daté d’une date-heure, repéré sur la journée suivante', () => {
    const blurred = blurTemplateDates([
      day(1, { date: '2027-04-17T00:00' }),
      day(2, { date: '2027-04-18' }),
    ])
    expect(blurred.map((d) => d.date)).toEqual([
      '2027-04-03T00:00',
      '2027-04-04',
    ])
  })

  it('se repère sur une date-heure quand aucune journée n’a de date seule', () => {
    const trip = [
      day(1, { date: 'à définir' }),
      day(2, { date: '2027-04-17T08:00' }),
      day(3, {
        date: '2027-04-18 09:30',
        transport: transport({ departureTime: '2027-04-18T09:12' }),
      }),
    ]
    const blurred = blurTemplateDates(trip)
    expect(blurred.map((d) => d.date)).toEqual([
      'à définir',
      '2027-04-03T08:00',
      '2027-04-04 09:30',
    ])
    expect(blurred[2].transport?.departureTime).toBe('2027-04-04T09:12')
    expect(blurTemplateDates(blurred)).toEqual(blurred)
  })

  it('ne touche à rien sans aucune date de journée', () => {
    const undated = [
      day(1, {
        date: '',
        accommodation: hotel({ checkIn: '2027-04-18T15:00' }),
      }),
      day(2, { date: 'à définir' }),
      day(3, { date: '2027-02-30T10:00' }),
    ]
    expect(blurTemplateDates(undated)).toEqual(undated)
    expect(blurTemplateDates([])).toEqual([])
  })

  it('garde l’année du voyage à cheval sur deux ans', () => {
    // La date seule l'emporte sur une date-heure placée avant elle, comme
    // pour `tripYear` : le voyage reste « de 2028 ».
    const trip = [
      day(1, { date: '2027-12-31T00:00' }),
      day(2, { date: '2028-01-01' }),
    ]
    expect(tripYear(trip)).toBe(2028)
    const blurred = blurTemplateDates(trip)
    expect(blurred).toEqual(trip)
    expect(tripYear(blurred)).toBe(2028)
  })

  it('est idempotente et ne modifie jamais son entrée', () => {
    const trip = upcomingTrip()
    const before = JSON.stringify(trip)
    const once = blurTemplateDates(trip)
    expect(JSON.stringify(trip)).toBe(before)
    expect(blurTemplateDates(once)).toEqual(once)
  })

  it('laisse en place une date de l’an 0000 que le recul ferait sortir du calendrier', () => {
    const blurred = blurTemplateDates([
      day(1, {
        date: '2027-04-17',
        accommodation: hotel({
          checkIn: '0000-01-03T15:00',
          checkOut: '2027-04-19',
        }),
      }),
    ])
    expect(blurred[0].date).toBe('2027-04-03')
    expect(blurred[0].accommodation).toMatchObject({
      checkIn: '0000-01-03T15:00',
      checkOut: '2027-04-05',
    })
  })
})

// ── Propriétés ────────────────────────────────────────────────────────────────

const TIMEOUT = 60_000

/**
 * Un voyage tiré au hasard ; parfois sans date au jour 1 (ou sur les
 * premières journées), parfois daté de dates-heures, comme un import.
 */
function generate(rng: Rng): DayItinerary[] {
  const itinerary = randomItinerary(rng, { maxDays: 20 })
  const undated = rng.bool(0.2) ? rng.int(1, 3) : 0
  const timed = rng.bool(0.2)
  return itinerary.map((day, index) => {
    if (index < undated) {
      return { ...day, date: rng.pick(['', 'à définir', '2027-02-30']) }
    }
    if (timed && refIsIsoDate(day.date) && rng.bool(0.6)) {
      const clock = randomClock(rng)
      return { ...day, date: `${day.date}${rng.bool(0.7) ? 'T' : ' '}${clock}` }
    }
    return day
  })
}

/**
 * Oracle de la journée repère : la première datée `AAAA-MM-JJ`, sinon la
 * première datée d'une date-heure (`T` ou espace), sinon aucune.
 */
function anchorOf(
  itinerary: readonly DayItinerary[],
): { index: number; date: string } | null {
  const plain = itinerary.findIndex((day) => refIsIsoDate(day.date))
  if (plain !== -1) return { index: plain, date: itinerary[plain].date }
  for (const [index, day] of itinerary.entries()) {
    const match =
      /^([0-9]{4}-[0-9]{2}-[0-9]{2})(T.*| [0-9]{2}:[0-9]{2}.*)$/.exec(day.date)
    if (match && refIsIsoDate(match[1])) return { index, date: match[1] }
  }
  return null
}

/** Ce que doit donner le flou : l'oracle de décalage, ids d'origine remis. */
function expectedBlur(
  itinerary: readonly DayItinerary[],
  offset: number,
): DayItinerary[] {
  return itinerary.map((original) => {
    const moved = refShiftDeep(original, offset)
    const result: DayItinerary = {
      ...moved,
      id: original.id,
      activities: moved.activities.map((item, index) => ({
        ...item,
        id: original.activities[index].id,
      })),
    }
    if (moved.accommodation && original.accommodation) {
      result.accommodation = {
        ...moved.accommodation,
        id: original.accommodation.id,
      }
    }
    if (moved.transport && original.transport) {
      result.transport = { ...moved.transport, id: original.transport.id }
    }
    return result
  })
}

describe('blurTemplateDates — propriétés', () => {
  it(
    'journée repère entre le 1er et le 7, même jour de la semaine, même mois, même année',
    () => {
      checkProperty('flou de la journée repère', generate, (itinerary) => {
        const anchor = anchorOf(itinerary)
        const blurred = blurTemplateDates(itinerary)
        expect(templateDateAnchor(itinerary)).toBe(anchor?.date ?? null)
        if (!anchor) {
          expect(blurred).toEqual(itinerary)
          return
        }
        // La même journée reste le repère, sa date dans la première semaine.
        expect(anchorOf(blurred)?.index).toBe(anchor.index)
        const date = blurred[anchor.index].date.slice(0, 10)
        expect(isIsoDate(date)).toBe(true)
        expect(Number(date.slice(8, 10))).toBeGreaterThanOrEqual(1)
        expect(Number(date.slice(8, 10))).toBeLessThanOrEqual(7)
        expect(date.slice(0, 7)).toBe(anchor.date.slice(0, 7))
        expect(weekday(date)).toBe(weekday(anchor.date))
        expect(tripYear(blurred)).toBe(tripYear(itinerary))
        // Un repère au-delà du 7 bouge toujours : aucun chemin ne laisse
        // passer le quantième.
        if (Number(anchor.date.slice(8, 10)) > 7) {
          expect(blurred).not.toEqual(itinerary)
        }
      })
    },
    TIMEOUT,
  )

  it(
    'chaque date et date-heure recule du même nombre de semaines, ids et reste intacts',
    () => {
      checkProperty('flou uniforme', generate, (itinerary) => {
        const anchor = anchorOf(itinerary)
        if (!anchor) return
        const offset = templateDateOffset(anchor.date)
        expect(Math.abs(offset) % 7).toBe(0)
        expect(offset).toBeLessThanOrEqual(0)
        expect(offset).toBeGreaterThan(-35)
        expect(blurTemplateDates(itinerary)).toEqual(
          expectedBlur(itinerary, offset),
        )
      })
    },
    TIMEOUT,
  )

  it(
    'idempotente, et ne modifie jamais son entrée',
    () => {
      checkProperty('flou idempotent', generate, (itinerary) => {
        const before = JSON.stringify(itinerary)
        const once = blurTemplateDates(itinerary)
        expect(JSON.stringify(itinerary)).toBe(before)
        expect(blurTemplateDates(once)).toEqual(once)
      })
    },
    TIMEOUT,
  )
})
