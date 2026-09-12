import handler from './.open-next/worker.js'
import { protectNavigationResponse } from './worker-cache-policy.mjs'
import { reviewVerificationResponse } from './review-verification-proxy.mjs'

export default {
  async fetch(request, env, ctx) {
    const verification = await reviewVerificationResponse(request, env)
    if (verification) return verification
    return protectNavigationResponse(request, await handler.fetch(request, env, ctx))
  },
}
export { DOQueueHandler } from './.open-next/worker.js'
