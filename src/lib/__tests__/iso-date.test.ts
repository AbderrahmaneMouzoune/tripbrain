import {
  addDays,
  daysBetween,
  fromDayNumber,
  MAX_DAY_NUMBER,
  MIN_DAY_NUMBER,
  isIsoDate,
  localIsoDate,
  shiftDatesDeep,
  shiftIsoDateValue,
  splitIsoDateValue,
  toDayNumber,
} from '@/lib/iso-date'

/**
 * Exécute `run` dans un autre fuseau horaire. Node relit `TZ` à chaque
 * changement : c'est ce qui permet de vérifier que rien ne dépend du fuseau
 * de l'appareil, heure d'été comprise.
 */
function inTimeZone(timeZone: string, run: () => void) {
  const previous = process.env.TZ
  process.env.TZ = timeZone
  try {
    run()
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
}

/** Fuseaux extrêmes (+14 h, −11 h), à heure d'été au nord et au sud, ou à demi-heure. */
const TIME_ZONES = [
  'UTC',
  'Europe/Paris',
  'America/New_York',
  'America/Sao_Paulo',
  'Australia/Lord_Howe',
  'Pacific/Kiritimati',
  'Pacific/Pago_Pago',
]

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}

describe('isIsoDate', () => {
  it('accepte une date qui existe au calendrier', () => {
    expect(isIsoDate('2026-05-10')).toBe(true)
    expect(isIsoDate('2026-12-31')).toBe(true)
    expect(isIsoDate('1970-01-01')).toBe(true)
  })

  it('connaît les années bissextiles, siècles compris', () => {
    expect(isIsoDate('2028-02-29')).toBe(true)
    expect(isIsoDate('2000-02-29')).toBe(true)
    expect(isIsoDate('2026-02-29')).toBe(false)
    expect(isIsoDate('2100-02-29')).toBe(false)
  })

  it('refuse les jours et les mois qui n’existent pas', () => {
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('2026-04-31')).toBe(false)
    expect(isIsoDate('2026-13-01')).toBe(false)
    expect(isIsoDate('2026-00-10')).toBe(false)
    expect(isIsoDate('2026-05-00')).toBe(false)
  })

  it('n’accepte que la forme AAAA-MM-JJ exacte', () => {
    expect(isIsoDate('2026-5-1')).toBe(false)
    expect(isIsoDate(' 2026-05-10')).toBe(false)
    expect(isIsoDate('2026-05-10 ')).toBe(false)
    expect(isIsoDate('2026-05-10T10:00')).toBe(false)
    expect(isIsoDate('10/05/2026')).toBe(false)
    expect(isIsoDate('+002026-05-10')).toBe(false)
    expect(isIsoDate('')).toBe(false)
    expect(isIsoDate('bientôt')).toBe(false)
  })

  it('refuse ce qui n’est pas une chaîne', () => {
    expect(isIsoDate(undefined)).toBe(false)
    expect(isIsoDate(null)).toBe(false)
    expect(isIsoDate(20260510)).toBe(false)
    expect(isIsoDate(new Date(2026, 4, 10))).toBe(false)
    expect(isIsoDate(['2026-05-10'])).toBe(false)
  })

  it('lit les années 0 à 99 telles quelles, pas comme 1900 à 1999', () => {
    expect(isIsoDate('0050-03-01')).toBe(true)
    expect(isIsoDate('0004-02-29')).toBe(true)
    expect(isIsoDate('0001-02-29')).toBe(false)
  })
})

describe('toDayNumber et fromDayNumber', () => {
  it('comptent les jours depuis l’époque', () => {
    expect(toDayNumber('1970-01-01')).toBe(0)
    expect(toDayNumber('1970-01-02')).toBe(1)
    expect(toDayNumber('1969-12-31')).toBe(-1)
    expect(fromDayNumber(0)).toBe('1970-01-01')
    expect(fromDayNumber(-1)).toBe('1969-12-31')
  })

  it('font l’aller-retour sur plusieurs années, jour par jour', () => {
    const first = toDayNumber('2027-11-01')
    for (let day = first; day < first + 800; day++) {
      const iso = fromDayNumber(day)
      expect(isIsoDate(iso)).toBe(true)
      expect(toDayNumber(iso)).toBe(day)
    }
  })

  it('ne confondent pas l’an 50 avec 1950', () => {
    expect(fromDayNumber(toDayNumber('0050-03-01'))).toBe('0050-03-01')
    // 1 900 ans de 365 jours, plus 460 jours bissextiles (grégorien proleptique).
    expect(daysBetween('0050-03-01', '1950-03-01')).toBe(693_960)
  })
})

describe('addDays', () => {
  it('passe les fins de mois et d’année', () => {
    expect(addDays('2026-05-30', 3)).toBe('2026-06-02')
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
  })

  it('passe le 29 février des années bissextiles, et lui seul', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01')
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
  })

  it('ne bouge pas avec un écart nul', () => {
    expect(addDays('2026-05-10', 0)).toBe('2026-05-10')
  })

  it('ne dépend ni du fuseau ni de l’heure d’été', () => {
    for (const timeZone of TIME_ZONES) {
      inTimeZone(timeZone, () => {
        // Passages à l'heure d'été : Europe le 29 mars 2026, États-Unis le
        // 8 mars, Brésil (historique) en octobre, Lord Howe d'une demi-heure.
        expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
        expect(addDays('2026-03-07', 2)).toBe('2026-03-09')
        expect(addDays('2026-10-24', 2)).toBe('2026-10-26')
        expect(addDays('2026-04-04', 1)).toBe('2026-04-05')
        expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31)
      })
    }
  })
})

describe('bornes du calendrier', () => {
  it('écrivent 0000-01-01 et 9999-12-31', () => {
    expect(fromDayNumber(MIN_DAY_NUMBER)).toBe('0000-01-01')
    expect(fromDayNumber(MAX_DAY_NUMBER)).toBe('9999-12-31')
    expect(toDayNumber('0000-01-01')).toBe(MIN_DAY_NUMBER)
    expect(toDayNumber('9999-12-31')).toBe(MAX_DAY_NUMBER)
  })

  it('lèvent RangeError au-delà, plutôt que d’écrire « +010000-01 »', () => {
    expect(() => addDays('9999-12-31', 1)).toThrow(RangeError)
    expect(() => addDays('0000-01-01', -1)).toThrow(RangeError)
    expect(() => fromDayNumber(MAX_DAY_NUMBER + 1)).toThrow(/hors calendrier/)
    expect(() => fromDayNumber(1.5)).toThrow(RangeError)
    expect(() => fromDayNumber(Number.NaN)).toThrow(RangeError)
    expect(() => shiftIsoDateValue('9999-12-31T10:00', 1)).toThrow(RangeError)
    // Une valeur qui n'est pas une date ne bouge toujours pas.
    expect(shiftIsoDateValue('10:00', 1_000_000)).toBe('10:00')
  })
})

describe('daysBetween', () => {
  it('compte dans les deux sens', () => {
    expect(daysBetween('2026-05-10', '2026-05-20')).toBe(10)
    expect(daysBetween('2026-05-20', '2026-05-10')).toBe(-10)
    expect(daysBetween('2026-05-10', '2026-05-10')).toBe(0)
  })

  it('compte 366 jours sur une année bissextile', () => {
    expect(daysBetween('2028-01-01', '2029-01-01')).toBe(366)
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365)
  })
})

describe('localIsoDate', () => {
  it('donne la date de l’appareil, pas celle d’UTC', () => {
    for (const timeZone of TIME_ZONES) {
      inTimeZone(timeZone, () => {
        // 23 h 59 locales : en UTC, c'est souvent déjà le lendemain (ou la veille).
        expect(localIsoDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
        expect(localIsoDate(new Date(2026, 2, 29, 0, 30))).toBe('2026-03-29')
        expect(localIsoDate(new Date(2026, 11, 31, 12))).toBe('2026-12-31')
      })
    }
  })

  it('écrit toujours l’année sur quatre chiffres', () => {
    const date = new Date(2026, 4, 10)
    date.setFullYear(50)
    expect(localIsoDate(date)).toBe('0050-05-10')
  })

  it('prend aujourd’hui par défaut', () => {
    expect(isIsoDate(localIsoDate())).toBe(true)
  })
})

describe('splitIsoDateValue', () => {
  it('sépare une date de son heure', () => {
    expect(splitIsoDateValue('2026-05-10')).toEqual({
      date: '2026-05-10',
      time: '',
    })
    expect(splitIsoDateValue('2026-05-10T15:00:00')).toEqual({
      date: '2026-05-10',
      time: 'T15:00:00',
    })
    expect(splitIsoDateValue('2026-05-10T23:30:00.000+09:00')).toEqual({
      date: '2026-05-10',
      time: 'T23:30:00.000+09:00',
    })
    expect(splitIsoDateValue('2026-05-10 08:30')).toEqual({
      date: '2026-05-10',
      time: ' 08:30',
    })
  })

  it('ne reconnaît rien d’autre', () => {
    expect(splitIsoDateValue('08:30')).toBeNull()
    expect(splitIsoDateValue('')).toBeNull()
    expect(splitIsoDateValue('2026-05-10 au matin')).toBeNull()
    expect(splitIsoDateValue('2026-02-30T10:00')).toBeNull()
    expect(splitIsoDateValue('le 2026-05-10')).toBeNull()
  })
})

describe('shiftIsoDateValue', () => {
  it('décale une date nue', () => {
    expect(shiftIsoDateValue('2026-05-31', 3)).toBe('2026-06-03')
    expect(shiftIsoDateValue('2026-01-02', -3)).toBe('2025-12-30')
  })

  it('décale la date d’une date-heure sans toucher à l’heure', () => {
    expect(shiftIsoDateValue('2026-05-31T15:00:00', 3)).toBe(
      '2026-06-03T15:00:00',
    )
    expect(shiftIsoDateValue('2026-12-31T23:59', 1)).toBe('2027-01-01T23:59')
    expect(shiftIsoDateValue('2026-05-10T08:00:00Z', 1)).toBe(
      '2026-05-11T08:00:00Z',
    )
    expect(shiftIsoDateValue('2026-05-10T08:00:00+09:00', -10)).toBe(
      '2026-04-30T08:00:00+09:00',
    )
    expect(shiftIsoDateValue('2028-02-28 22:15', 1)).toBe('2028-02-29 22:15')
  })

  it('laisse une heure seule, un texte ou une date impossible', () => {
    expect(shiftIsoDateValue('08:30', 5)).toBe('08:30')
    expect(shiftIsoDateValue('', 5)).toBe('')
    expect(shiftIsoDateValue('bientôt', 5)).toBe('bientôt')
    expect(shiftIsoDateValue('2026-02-30', 5)).toBe('2026-02-30')
    expect(shiftIsoDateValue('2026-02-30T10:00', 5)).toBe('2026-02-30T10:00')
    expect(shiftIsoDateValue('2026-05-10 au matin', 5)).toBe(
      '2026-05-10 au matin',
    )
    expect(shiftIsoDateValue('Départ le 2026-05-10', 5)).toBe(
      'Départ le 2026-05-10',
    )
  })

  it('ne touche à rien avec un écart nul', () => {
    expect(shiftIsoDateValue('2026-05-10T15:00', 0)).toBe('2026-05-10T15:00')
  })

  it('ne dépend pas du fuseau', () => {
    for (const timeZone of TIME_ZONES) {
      inTimeZone(timeZone, () => {
        expect(shiftIsoDateValue('2026-03-28T02:30:00', 1)).toBe(
          '2026-03-29T02:30:00',
        )
      })
    }
  })
})

describe('shiftDatesDeep', () => {
  const hotel = {
    id: 'acc-1',
    name: 'Hotel Gracery Shinjuku',
    checkIn: '2026-05-10T15:00:00',
    checkOut: '2026-05-14',
    price: 180,
    images: ['https://example.com/2026-05-10.jpg'],
    nested: { at: ['2026-05-12', '09:00', null, true] },
    missing: undefined,
  }

  it('décale toutes les dates, où qu’elles soient', () => {
    expect(shiftDatesDeep(hotel, 2)).toEqual({
      id: 'acc-1',
      name: 'Hotel Gracery Shinjuku',
      checkIn: '2026-05-12T15:00:00',
      checkOut: '2026-05-16',
      price: 180,
      images: ['https://example.com/2026-05-10.jpg'],
      nested: { at: ['2026-05-14', '09:00', null, true] },
      missing: undefined,
    })
  })

  it('recopie sans jamais modifier l’original', () => {
    const frozen = deepFreeze(structuredClone(hotel))
    const shifted = shiftDatesDeep(frozen, -1)
    expect(frozen).toEqual(hotel)
    expect(shifted).not.toBe(frozen)
    expect(shifted.nested).not.toBe(frozen.nested)
    expect(shifted.nested.at).not.toBe(frozen.nested.at)
  })

  it('laisse les valeurs simples telles quelles', () => {
    expect(shiftDatesDeep(42, 3)).toBe(42)
    expect(shiftDatesDeep(null, 3)).toBeNull()
    expect(shiftDatesDeep(undefined, 3)).toBeUndefined()
    expect(shiftDatesDeep('2026-05-10', 3)).toBe('2026-05-13')
  })
})
