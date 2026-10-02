import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { apiBaseUrl } from '../config/api'
import { fetchSessionRead } from '../api/session'
import { createEngagementApi } from '../lib/toiletEngagement'
import { likedListView } from '../lib/likedListView'
import { loadMapFilterLikedIds } from '../lib/mapFilterLikes'

const api = createEngagementApi(apiBaseUrl, fetchSessionRead)
type State = { owner: string | null; revision: number; ids: number[] | null; error: boolean }
export function useMapFilterLikes(owner: string | null) {
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<State>({ owner: null, revision: 0, ids: null, error: false })
  const controller = useRef<AbortController | null>(null)
  // Invalidate before paint; a former owner's map cannot appear while the new read starts.
  useLayoutEffect(() => {
    controller.current?.abort()
    setState({ owner, revision, ids: null, error: false })
    if (!owner) return
    const request = new AbortController()
    controller.current = request
    void loadMapFilterLikedIds(page => api.listLikes('newest', page), request.signal).then(ids => {
      if (!request.signal.aborted) setState({ owner, revision, ids, error: false })
    }).catch(() => {
      if (!request.signal.aborted) setState({ owner, revision, ids: null, error: true })
    })
    return () => request.abort()
  }, [owner, revision])
  useEffect(() => likedListView.subscribe(changedOwner => {
    if (!owner) return
    controller.current?.abort()
    setState({ owner: null, revision: -1, ids: null, error: false })
    if (changedOwner === owner) setRevision(value => value + 1)
  }), [owner])
  const valid = state.owner === owner && state.revision === revision
  return { ids: valid ? state.ids : null, error: valid && state.error,
    retry: () => setRevision(value => value + 1) }
}
