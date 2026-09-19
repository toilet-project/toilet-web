'use client'
import { useMessages } from '../i18n/context'

// Match the real card's layout; never invent an address, distance or facility value.
export function LoadingOpenTime() {
  const t = useMessages()
  return <p className="open-time detail-loading-open-time" aria-label={t('detail.openingLoading')}><span className="detail-loading-bar" aria-hidden="true" /></p>
}

export function DetailLoadingFields({ inline = false }: { inline?: boolean }) {
  const t = useMessages()
  return <div className={inline ? 'detail-loading-fields' : 'card-details detail-loading-fields'} role="status" aria-label={t('detail.loading')}>
    <div className={`detail-row ${inline ? 'coordinate-inline-address' : 'detail-address'}`}>
      <dt>{t('detail.address')}</dt><dd><span className="detail-loading-bar" aria-hidden="true" /><button className="copy-address-button" type="button" disabled>{t('detail.copy')}</button></dd>
    </div>
    <section className={inline ? 'coordinate-inline-section' : 'detail-section'} aria-hidden="true">
      <h2>{t('detail.capacity')}</h2>
      {inline ? <dl className="coordinate-inline-capacity">{[t('detail.maleToilets'), t('detail.femaleToilets')].map(label => <div key={label}><dt>{label}</dt><dd><span className="detail-loading-bar" /></dd></div>)}</dl>
        : <div className="capacity-groups">{[t('detail.male'), t('detail.female')].map(label => <div className="capacity-group" key={label}><h3>{label}</h3><dl>{[t('detail.toilets'), t('detail.urinals')].map(item => <div key={item}><dt>{item}</dt><dd><span className="detail-loading-bar" /></dd></div>)}</dl></div>)}</div>}
    </section>
    <section className={inline ? 'coordinate-inline-facilities' : 'detail-section facility-section'} aria-hidden="true">
      <h2>{t('detail.safety')}</h2>
      <div className={inline ? 'coordinate-facility-list' : undefined}>{[t('detail.bell'), 'CCTV', t('detail.diaper')].map(label => inline
        ? <div className="coordinate-facility" key={label}><span>{label}</span><span className="detail-loading-bar" /></div>
        : <div className="facility-row" key={label}><strong>{label}</strong><span className="detail-loading-bar" /><span /></div>)}</div>
    </section>
  </div>
}
