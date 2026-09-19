(() => {
  const adminOrigin = 'https://admin.geupddong.com'
  const currentPreview = '/admin-toilets-preview/'

  document.querySelectorAll('.admin-brand, .admin-nav-link, .admin-notification').forEach(link => {
    const url = new URL(link.getAttribute('href') || '/', window.location.href)
    link.href = url.pathname === '/toilets.html' ? currentPreview : `${adminOrigin}${url.pathname}${url.search}`
  })
})()
