import { createApiUrl } from '../config/api'
import { createSessionReader } from '../lib/sessionRead'

// Shared only by browser account reads; no response data or credentials are stored here.
export const fetchSessionRead = createSessionReader(createApiUrl('/api/v1/auth/refresh'))
