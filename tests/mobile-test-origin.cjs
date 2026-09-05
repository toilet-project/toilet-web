// Return a fixed origin, never an unchecked environment value or URL fragment.
function mobileTestOrigin(raw, {allowLoopback = false} = {}) {
  switch (raw) {
    case 'https://preview.geupddong.com': return 'https://preview.geupddong.com'
    case 'http://192.168.0.4:4174': return 'http://192.168.0.4:4174'
    case 'http://127.0.0.1:4174':
      if (allowLoopback) return 'http://127.0.0.1:4174'
      break
  }
  throw new Error('Only exact isolated preview/local origins are allowed')
}
module.exports = {mobileTestOrigin}
