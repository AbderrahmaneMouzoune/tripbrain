import { deepEqual, mergeThreeWay } from '@/lib/trip-merge'

interface Activity {
  id: string
  name: string
  status?: 'planned' | 'done'
}
interface Day {
  id: string
  title: string
  notes?: string
  activities: Activity[]
}

const base: Day[] = [
  {
    id: 'd1',
    title: 'Tokyo',
    activities: [
      { id: 'a1', name: 'Senso-ji' },
      { id: 'a2', name: 'Ueno' },
    ],
  },
  {
    id: 'd2',
    title: 'Kyoto',
    activities: [{ id: 'a3', name: 'Fushimi Inari' }],
  },
]

function edit(days: Day[], fn: (days: Day[]) => void): Day[] {
  const copy = structuredClone(days)
  fn(copy)
  return copy
}

describe('mergeThreeWay', () => {
  it('garde les changements faits de chaque côté sur des journées différentes', () => {
    const local = edit(base, (d) => {
      d[0].activities[0].status = 'done'
    })
    const remote = edit(base, (d) => {
      d[1].activities.push({ id: 'a4', name: 'Nishiki' })
    })
    const { value, conflicts } = mergeThreeWay(base, local, remote)
    expect(conflicts).toBe(0)
    expect(value[0].activities[0].status).toBe('done')
    expect(value[1].activities.map((a) => a.id)).toEqual(['a3', 'a4'])
  })

  it('fusionne champ par champ dans la même activité', () => {
    const local = edit(base, (d) => {
      d[0].activities[1].status = 'done'
    })
    const remote = edit(base, (d) => {
      d[0].activities[1].name = 'Parc d’Ueno'
    })
    const { value, conflicts } = mergeThreeWay(base, local, remote)
    expect(conflicts).toBe(0)
    expect(value[0].activities[1]).toEqual({
      id: 'a2',
      name: 'Parc d’Ueno',
      status: 'done',
    })
  })

  it('donne raison au serveur quand le même champ diffère, et le compte', () => {
    const local = edit(base, (d) => {
      d[0].notes = 'Prendre le JR Pass'
    })
    const remote = edit(base, (d) => {
      d[0].notes = 'Réserver le dîner'
    })
    const { value, conflicts } = mergeThreeWay(base, local, remote)
    expect(conflicts).toBe(1)
    expect(value[0].notes).toBe('Réserver le dîner')
  })

  it('applique une suppression qui ne croise aucune modification', () => {
    const local = edit(base, (d) => {
      d[0].activities.splice(1, 1)
    })
    const remote = edit(base, (d) => {
      d[1].title = 'Kyoto et Nara'
    })
    const { value } = mergeThreeWay(base, local, remote)
    expect(value[0].activities.map((a) => a.id)).toEqual(['a1'])
    expect(value[1].title).toBe('Kyoto et Nara')
  })

  it('ne perd pas une modification faite sur un élément supprimé ailleurs', () => {
    const local = edit(base, (d) => {
      d[0].activities[1].status = 'done'
    })
    const remote = edit(base, (d) => {
      d[0].activities.splice(1, 1)
    })
    const { value, conflicts } = mergeThreeWay(base, local, remote)
    expect(conflicts).toBe(1)
    expect(value[0].activities.map((a) => a.id)).toEqual(['a1', 'a2'])
  })

  it('garde l’ordre choisi par celui qui a réordonné, avec les ajouts de l’autre', () => {
    const local = edit(base, (d) => {
      d[0].activities.reverse()
    })
    const remote = edit(base, (d) => {
      d[0].activities.push({ id: 'a5', name: 'Akihabara' })
    })
    const { value } = mergeThreeWay(base, local, remote)
    expect(value[0].activities.map((a) => a.id)).toEqual(['a2', 'a1', 'a5'])
  })

  it('accepte le serveur tel quel sans ancêtre commun', () => {
    const remote = edit(base, (d) => {
      d[0].title = 'Autre'
    })
    expect(mergeThreeWay(null, base, remote).value).toBe(remote)
  })
})

describe('deepEqual', () => {
  it('ignore l’ordre des clés et les champs à undefined', () => {
    expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true)
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
    expect(deepEqual([1, 2], [2, 1])).toBe(false)
  })
})
