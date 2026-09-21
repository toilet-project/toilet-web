import handler from './.open-next/worker.js'
import { protectNavigationResponse } from './worker-cache-policy.mjs'
import { reviewVerificationResponse } from './review-verification-proxy.mjs'
import { placeSearchResponse } from './place-search-worker.mjs'
import { mapProviderConfigResponse } from './map-provider-worker.mjs'

export default {
  async fetch(request, env, ctx) {
    const mapProviderConfig = mapProviderConfigResponse(request, env)
    if (mapProviderConfig) return mapProviderConfig
    const placeSearch = await placeSearchResponse(request, env)
    if (placeSearch) return placeSearch
    const verification = await reviewVerificationResponse(request, env)
    if (verification) return verification
    return protectNavigationResponse(request, await handler.fetch(request, env, ctx))
  },
}
export { DOQueueHandler } from './.open-next/worker.js'
