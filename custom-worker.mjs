import handler from './.open-next/worker.js'
import { protectNavigationResponse } from './worker-cache-policy.mjs'
import { reviewVerificationResponse } from './review-verification-proxy.mjs'
import { reportPreviewResponse } from './report-preview-proxy.mjs'
import { placeSearchResponse } from './place-search-worker.mjs'
import { mapProviderConfigResponse } from './map-provider-worker.mjs'
import { regionMarkersResponse } from './region-markers-worker.ts'
import { runScheduledIndexNow } from './indexnow-dispatch.mjs'
import { withHomeServerTiming } from './home-server-timing.mjs'

export default {
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(runScheduledIndexNow(env, request => handler.fetch(request, env, ctx)))
  },
  async fetch(request, env, ctx) {
    const reportPreview = await reportPreviewResponse(request, env)
    if (reportPreview) return reportPreview
    const regionMarkers = await regionMarkersResponse(request, env)
    if (regionMarkers) return regionMarkers
    const mapProviderConfig = mapProviderConfigResponse(request, env)
    if (mapProviderConfig) return mapProviderConfig
    const placeSearch = await placeSearchResponse(request, env)
    if (placeSearch) return placeSearch
    const verification = await reviewVerificationResponse(request, env)
    if (verification) return verification
    const response = await withHomeServerTiming(request, env, ctx, (input, bindings, context) => handler.fetch(input, bindings, context))
    // OpenNext initializes this from the compiled deploymentId during fetch.
    // Never use the client's x-deployment-id to identify a server response.
    return protectNavigationResponse(request, response, process.env.DEPLOYMENT_ID)
  },
}
export { DOQueueHandler } from './.open-next/worker.js'
