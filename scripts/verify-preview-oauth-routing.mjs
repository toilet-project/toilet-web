// Isolated unauthenticated OAuth start/cancel checks. No user login, tokens or business writes.
import assert from 'node:assert/strict'
const api='https://api.geupddong.com'
const preview='https://preview.geupddong.com'
const results=[]
for(const provider of ['google','kakao']) {
  const cookies=new Map()
  async function request(path) {
    const response=await fetch(new URL(path,api),{redirect:'manual',signal:AbortSignal.timeout(30_000),
      headers:cookies.size?{Cookie:[...cookies].map(([key,value])=>`${key}=${value}`).join('; ')}:{}})
    for(const cookie of response.headers.getSetCookie()) {
      const pair=cookie.split(';',1)[0]; const i=pair.indexOf('=')
      if(i>0) cookies.set(pair.slice(0,i),pair.slice(i+1))
    }
    await response.arrayBuffer()
    return response
  }
  const start=await request(`/api/v1/auth/login/${provider}?returnTo=preview`)
  assert.equal(start.status,302)
  const startUrl=new URL(start.headers.get('location'),api)
  assert.equal(startUrl.origin,api)
  assert.equal(startUrl.pathname,`/oauth2/authorization/${provider}`)
  const authorize=await request(startUrl.pathname)
  assert.equal(authorize.status,302)
  const authorization=new URL(authorize.headers.get('location'))
  assert.equal(authorization.hostname,provider==='google'?'accounts.google.com':'kauth.kakao.com')
  assert.equal(authorization.searchParams.get('redirect_uri'),`${api}/login/oauth2/code/${provider}`)
  const state=authorization.searchParams.get('state')
  assert.ok(state)
  const canceled=await request(`/login/oauth2/code/${provider}?${new URLSearchParams({error:'access_denied',state})}`)
  assert.equal(canceled.status,302)
  assert.equal(canceled.headers.get('location'),preview+'/?login=failed')
  results.push({provider,start:start.status,providerCallbackUnchanged:true,cancelReturn:preview+'/?login=failed'})
}
const denied=await fetch(api+'/api/v1/auth/login/google?returnTo=https%3A%2F%2Fevil.example',{redirect:'manual'})
assert.equal(denied.status,400)
console.log(JSON.stringify({results,arbitraryReturnRejected:denied.status,note:'Real user login/consent success still requires user verification.'},null,2))
