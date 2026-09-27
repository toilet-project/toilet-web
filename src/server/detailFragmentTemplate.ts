import type { DetailPresentation } from '../lib/detailPresentation'

// A plain HTML fragment, with no React Flight/chunk/build references. Its
// version is generated from this source at build time, independently of chrome.
const escape = (value: string | number) => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)

export function renderDetailFragment(model: DetailPresentation) {
  const e = escape
  const row = (value: { label: string; value: string }, className = '', copy = false) =>
    `<div class="detail-row${className ? ` ${className}` : ''}"><dt>${e(value.label)}</dt><dd><span>${e(value.value)}</span>${copy ? `<button type="button" class="copy-address-button">${e(model.copy)}</button>` : ''}</dd></div>`
  const region = model.region.value ? model.region.href
    ? `<div class="detail-row detail-region-link"><dt>${e(model.region.label)}</dt><dd><a href="${e(encodeURI(model.region.href))}">${e(model.region.value)}<span aria-hidden="true">↗</span></a></dd></div>`
    : row(model.region) : ''
  const capacity = model.capacity.groups.length ? `<section class="detail-section"><h2>${e(model.capacity.title)}</h2><div class="capacity-groups">${model.capacity.groups.map(group =>
    `<div class="capacity-group"><h3>${e(group.title)}</h3><dl>${group.items.map(item => `<div><dt>${e(item.label)}</dt><dd>${e(item.count)}${e(model.countSuffix)}</dd></div>`).join('')}</dl></div>`).join('')}</div></section>` : ''
  const facilities = model.safety.items.map(item => {
    const label = `<strong>${e(item.label)}</strong><span class="facility-status${item.available ? '' : ' is-unavailable'}">${e(item.available ? model.safety.available : model.safety.unavailable)}</span>`
    return item.location === null
      ? `<div class="facility-row">${label}<span class="facility-location-placeholder" aria-hidden="true"></span></div>`
      : `<details class="facility-row facility-row-expandable"><summary>${label}<span class="facility-location-label">${e(model.safety.location)} <span class="facility-location-arrow" aria-hidden="true"></span></span></summary><p>${e(model.safety.location)}: ${e(item.location)}</p></details>`
  }).join('')
  return `<div class="card-details" tabindex="0" aria-label="${e(model.title)}">${model.address.value ? row(model.address, 'detail-address', true) : ''}${region}${row(model.opening)}${model.installed ? row(model.installed) : ''}${capacity}<section class="detail-section facility-section"><h2>${e(model.safety.title)}</h2>${facilities}</section>${model.other.map(value => row(value)).join('')}</div>`
}
