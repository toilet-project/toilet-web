import handler from './.open-next/worker.js'
import { protectNavigationResponse } from './worker-cache-policy.mjs'

export default {
  async fetch(request, env, ctx) {
    return protectNavigationResponse(request, await handler.fetch(request, env, ctx))
  },
}
export { DOQueueHandler } from './.open-next/worker.js'
