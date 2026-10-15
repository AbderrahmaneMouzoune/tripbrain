/**
 * Fusion à trois voies d'un itinéraire partagé entre plusieurs téléphones.
 *
 * Chaque téléphone garde la dernière version reçue du groupe (`base`). Quand
 * sa copie (`local`) et celle du serveur (`remote`) ont toutes deux avancé, on
 * compare chacune à `base` pour savoir qui a changé quoi :
 *
 * - un seul côté a changé une valeur : on garde ce changement ;
 * - les deux l'ont changée de la même façon : rien à arbitrer ;
 * - les deux l'ont changée différemment : on descend d'un niveau (champ par
 *   champ, activité par activité) et, tout en bas, le serveur l'emporte — il
 *   a été écrit le premier. Ces cas sont comptés dans `conflicts`.
 *
 * Les tableaux d'objets portant un `id` (journées, activités) se fusionnent
 * élément par élément : Léa qui ajoute un restaurant au jour 2 pendant que
 * Karim coche une visite du jour 4, ce sont deux changements qui coexistent.
 */

type Json = unknown

function isPlainObject(value: Json): value is Record<string, Json> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

function hasId(value: Json): value is { id: string } {
  return isPlainObject(value) && typeof value.id === 'string'
}

function isIdList(value: Json): value is { id: string }[] {
  return Array.isArray(value) && value.every(hasId)
}

/** Égalité profonde ; une clé à `undefined` vaut une clé absente. */
export function deepEqual(a: Json, b: Json): boolean {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false
    }
    return a.every((item, index) => deepEqual(item, b[index]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const key of keys) {
      if (!deepEqual(a[key], b[key])) return false
    }
    return true
  }
  return false
}

interface Merge<T> {
  value: T
  conflicts: number
}

function mergeValue(base: Json, local: Json, remote: Json): Merge<Json> {
  if (deepEqual(local, remote)) return { value: local, conflicts: 0 }
  if (deepEqual(local, base)) return { value: remote, conflicts: 0 }
  if (deepEqual(remote, base)) return { value: local, conflicts: 0 }

  // Les deux côtés ont changé : on regarde de plus près.
  if (isIdList(local) && isIdList(remote)) {
    return mergeById(isIdList(base) ? base : [], local, remote)
  }
  if (isPlainObject(local) && isPlainObject(remote)) {
    return mergeObject(isPlainObject(base) ? base : {}, local, remote)
  }
  return { value: remote, conflicts: 1 }
}

function mergeObject(
  base: Record<string, Json>,
  local: Record<string, Json>,
  remote: Record<string, Json>,
): Merge<Record<string, Json>> {
  const value: Record<string, Json> = {}
  let conflicts = 0
  const keys = new Set([...Object.keys(remote), ...Object.keys(local)])
  for (const key of keys) {
    const merged = mergeValue(base[key], local[key], remote[key])
    conflicts += merged.conflicts
    if (merged.value !== undefined) value[key] = merged.value
  }
  return { value, conflicts }
}

function ids(list: { id: string }[]): string[] {
  return list.map((item) => item.id)
}

function mergeById<T extends { id: string }>(
  base: T[],
  local: T[],
  remote: T[],
): Merge<T[]> {
  const byId = (list: T[]) => new Map(list.map((item) => [item.id, item]))
  const b = byId(base)
  const l = byId(local)
  const r = byId(remote)

  const kept = new Map<string, T>()
  let conflicts = 0
  for (const id of new Set([...r.keys(), ...l.keys()])) {
    const inBase = b.get(id)
    const mine = l.get(id)
    const theirs = r.get(id)
    if (mine && theirs) {
      const merged = mergeValue(inBase, mine, theirs)
      conflicts += merged.conflicts
      kept.set(id, merged.value as T)
    } else if (mine) {
      if (!inBase)
        kept.set(id, mine) // ajouté ici
      else if (!deepEqual(mine, inBase)) {
        // Supprimé là-bas, modifié ici : on ne perd pas la modification.
        kept.set(id, mine)
        conflicts++
      }
    } else if (theirs) {
      if (!inBase)
        kept.set(id, theirs) // ajouté là-bas
      else if (!deepEqual(theirs, inBase)) {
        kept.set(id, theirs)
        conflicts++
      }
    }
  }

  // L'ordre : celui de qui l'a changé, sinon celui du serveur.
  const baseOrder = ids(base).filter((id) => kept.has(id))
  const localOrder = ids(local).filter((id) => kept.has(id))
  const remoteOrder = ids(remote).filter((id) => kept.has(id))
  const localReordered = !deepEqual(
    localOrder.filter((id) => b.has(id)),
    baseOrder.filter((id) => l.has(id)),
  )
  const remoteReordered = !deepEqual(
    remoteOrder.filter((id) => b.has(id)),
    baseOrder.filter((id) => r.has(id)),
  )
  const [primary, secondary] =
    localReordered && !remoteReordered
      ? [localOrder, remoteOrder]
      : [remoteOrder, localOrder]

  const order = [...primary]
  // Ce que seul l'autre côté connaît s'insère avant son voisin suivant
  // d'origine ; un ajout en fin de liste reste en fin de liste.
  for (let index = secondary.length - 1; index >= 0; index--) {
    const id = secondary[index]
    if (order.includes(id)) continue
    const anchor = secondary
      .slice(index + 1)
      .find((other) => order.includes(other))
    if (anchor) order.splice(order.indexOf(anchor), 0, id)
    else order.push(id)
  }

  return { value: order.map((id) => kept.get(id) as T), conflicts }
}

export interface MergeResult<T> {
  value: T
  /** Valeurs modifiées des deux côtés, tranchées en faveur du serveur. */
  conflicts: number
}

/**
 * Fusionne deux versions d'un même document à partir de leur ancêtre commun.
 * Sans ancêtre (premier échange), la version du serveur fait foi.
 */
export function mergeThreeWay<T>(
  base: T | null,
  local: T,
  remote: T,
): MergeResult<T> {
  if (base === null) return { value: remote, conflicts: 0 }
  const merged = mergeValue(base, local, remote)
  return { value: merged.value as T, conflicts: merged.conflicts }
}
