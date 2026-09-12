import { createApiUrl } from '../config/api'
import { fetchSessionRead } from './session'
import { createReviewApi } from '../lib/reviewApi'

export const reviewApi = createReviewApi({ url: createApiUrl, read: fetchSessionRead })
