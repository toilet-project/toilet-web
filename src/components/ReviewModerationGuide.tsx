import type { Locale } from '../i18n/locale'
import { reviewModerationGuide, reviewModerationReasonCodes } from '../i18n/reviewModerationGuide'
import { reviewModerationPolicyPublication, reviewModerationPolicyPublicationAttributes } from '../lib/reviewModerationPolicyPublication'

export function ReviewModerationGuide({ locale = 'ko', embedded = false }: { locale?: Locale; embedded?: boolean }) {
  const copy = reviewModerationGuide[locale], policy = reviewModerationPolicyPublication
  const Heading = embedded ? 'h3' : 'h2'
  const notice = policy.status === 'published'
    ? `${copy.effective}: ${new Date(policy.effectiveAt!).toLocaleDateString(locale, { timeZone: 'Asia/Seoul' })} (KST)`
    : copy.draft
  return <section id="review-moderation" {...reviewModerationPolicyPublicationAttributes(policy)}>
    <Heading>{copy.title}</Heading>
    <p className="policy-effective">{notice}</p>
    <p>{copy.purpose}</p><p>{copy.protection}</p><p>{copy.criteria}</p>
    <ul>{reviewModerationReasonCodes.map(code => <li key={code}><strong>{copy.reasons[code][0]}</strong>: {copy.reasons[code][1]}</li>)}</ul>
    <p>{copy.effects}</p><p>{copy.difference}</p><p>{copy.appeal}</p>
    <p><a href="mailto:privacy@geupddong.com">{copy.contact}: privacy@geupddong.com</a></p>
  </section>
}

export function ReviewModerationRetentionNotice({ locale = 'ko' }: { locale?: Locale }) {
  const path = locale === 'ko' ? '' : `/${locale.toLowerCase()}`
  return <> <a href={`${path}/policies/terms#review-moderation`}>{reviewModerationGuide[locale].retention}</a></>
}
