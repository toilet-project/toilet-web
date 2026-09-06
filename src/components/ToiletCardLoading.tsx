// Match the real card's layout; never invent an address, distance or facility value.
export function LoadingOpenTime() {
  return <p className="open-time detail-loading-open-time" aria-label="개방시간 불러오는 중"><span className="detail-loading-bar" aria-hidden="true" /></p>
}

export function DetailLoadingFields({ inline = false }: { inline?: boolean }) {
  return <div className={inline ? 'detail-loading-fields' : 'card-details detail-loading-fields'} role="status" aria-label="주소와 시설 정보 불러오는 중">
    <div className={`detail-row ${inline ? 'coordinate-inline-address' : 'detail-address'}`}>
      <dt>주소</dt><dd><span className="detail-loading-bar" aria-hidden="true" /><button className="copy-address-button" type="button" disabled>주소 복사</button></dd>
    </div>
    <section className={inline ? 'coordinate-inline-section' : 'detail-section'} aria-hidden="true">
      <h2>화장실 수</h2>
      {inline ? <dl className="coordinate-inline-capacity">{['남성 대변기', '여성 대변기'].map(label => <div key={label}><dt>{label}</dt><dd><span className="detail-loading-bar" /></dd></div>)}</dl>
        : <div className="capacity-groups">{['남성', '여성'].map(label => <div className="capacity-group" key={label}><h3>{label}</h3><dl>{['대변기', '소변기'].map(item => <div key={item}><dt>{item}</dt><dd><span className="detail-loading-bar" /></dd></div>)}</dl></div>)}</div>}
    </section>
    <section className={inline ? 'coordinate-inline-facilities' : 'detail-section facility-section'} aria-hidden="true">
      <h2>편의·안전</h2>
      <div className={inline ? 'coordinate-facility-list' : undefined}>{['비상벨', 'CCTV', '기저귀 교환대'].map(label => inline
        ? <div className="coordinate-facility" key={label}><span>{label}</span><span className="detail-loading-bar" /></div>
        : <div className="facility-row" key={label}><strong>{label}</strong><span className="detail-loading-bar" /><span /></div>)}</div>
    </section>
  </div>
}
