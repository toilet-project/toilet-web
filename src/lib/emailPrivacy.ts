/** Safe, idempotent display hint, also used while older API instances finish rolling out. */
export function maskEmail(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const email = value.trim(), at = email.lastIndexOf('@');
  if (at < 1 || at !== email.indexOf('@') || at === email.length - 1 || /[\s\u0000-\u001f\u007f-\u009f]/u.test(email)) return '***';
  const local = email.slice(0, at), prefix = local.split('*')[0] ?? '';
  const points = [...prefix];
  const visible = Math.min(2, Math.max(0, points.length - (local.includes('*') ? 0 : 1)));
  return points.slice(0, visible).join('') + '***' + email.slice(at);
}
