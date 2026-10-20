export const INDEXNOW_RETENTION_MS = 30 * 86_400_000
export class IndexNowBudgetError extends Error {
  constructor() { super('IndexNow dispatch budget exhausted'); this.name = 'IndexNowBudgetError' }
}
export type IndexNowLifecycle = {
  createdAt?: number; updatedAt?: number; settledAt?: number; compactedAt?: number
  recoveries?: number; recoveredAt?: number
}
export async function indexNowDigest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}
export function validLifecycle(value: IndexNowLifecycle) {
  return ['createdAt', 'updatedAt', 'settledAt', 'compactedAt', 'recoveredAt'].every(key => {
    const time = value[key as keyof IndexNowLifecycle]
    return time === undefined || Number.isSafeInteger(time) && time >= 0
  }) && (value.recoveries === undefined || Number.isSafeInteger(value.recoveries)
    && value.recoveries >= 0 && value.recoveries <= 3)
}
export function indexNowMetadata(value: IndexNowLifecycle & { state: string }) {
  return { indexnow: '1', state: value.state,
    ...(value.settledAt === undefined ? {} : { settledAt: String(value.settledAt) }),
    ...(value.compactedAt === undefined ? {} : { compactedAt: String(value.compactedAt) }) }
}
/** Metadata is written atomically with the body. Missing/legacy metadata falls back to a validated read. */
export function skipSettledIndexNow(metadata: Record<string, string> | undefined, state: string, now: number) {
  if (metadata?.indexnow !== '1' || metadata.state !== state) return false
  const validTime = (value: string | undefined) => value !== undefined && /^\d+$/.test(value)
    && Number.isSafeInteger(Number(value))
  return validTime(metadata.compactedAt) || validTime(metadata.settledAt)
    && Number(metadata.settledAt) + INDEXNOW_RETENTION_MS > now
}
export function canCompactIndexNow(value: IndexNowLifecycle, now: number) {
  return value.compactedAt === undefined && value.settledAt !== undefined
    && value.settledAt + INDEXNOW_RETENTION_MS <= now
}
export function recoveredIndexNow<T extends IndexNowLifecycle & { state: string }>(value: T, now: number) {
  return { ...value, state: 'pending' as const, attempts: 0, leaseUntil: 0, dueAt: now + 600_000,
    updatedAt: now, settledAt: undefined, recoveredAt: now, recoveries: (value.recoveries ?? 0) + 1 }
}
