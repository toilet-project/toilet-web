type AccountScope = { owner: string | null; authLoading: boolean }
export type MapAccountScopeChange = 'unchanged' | 'preserve-initial-public' | 'reset'

// The first session check identifies an existing visitor; it does not change a
// public map query. Every later account transition still resets the map scope.
export function createMapAccountScope(initial: AccountScope) {
  let owner = initial.owner
  let initialAuthResolved = !initial.authLoading
  return {
    update(next: AccountScope & { publicSelection: boolean }): MapAccountScopeChange {
      const firstResolution = !initialAuthResolved && !next.authLoading
      if (!next.authLoading) initialAuthResolved = true
      const previousOwner = owner
      owner = next.owner
      if (previousOwner === next.owner) return 'unchanged'
      if (firstResolution && previousOwner === null && next.owner !== null && next.publicSelection)
        return 'preserve-initial-public'
      return 'reset'
    },
  }
}
