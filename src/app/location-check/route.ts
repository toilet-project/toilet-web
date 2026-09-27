export const dynamic = 'force-dynamic'

// A same-origin, map-free native permission probe. No React hydration, automatic
// location request, analytics, coordinates in output, or outgoing network calls.
const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>위치 승인 확인 · 급똥 프리뷰</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f4f8f5;color:#183d31;font:16px/1.65 -apple-system,BlinkMacSystemFont,sans-serif}
main{max-width:520px;margin:40px auto;padding:28px;background:#fff;border:1px solid #dae7df;border-radius:20px}
h1{font-size:25px;line-height:1.35;margin:12px 0}p{margin:14px 0}.eyebrow{font-size:12px;color:#54806b}button{width:100%;padding:14px;border:0;border-radius:12px;font:inherit;font-weight:600;background:#17683a;color:white;cursor:pointer}button:disabled{opacity:.55;cursor:default}
#result{padding:16px;background:#f0f6f2;border-radius:12px}#detail{font-size:14px;color:#52665d}.secondary{margin-top:12px;background:#eef3f0;color:#23553c}a{color:#17683a;font-size:14px}details{margin-top:24px;font-size:13px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}nav{display:flex;gap:20px;flex-wrap:wrap;margin-top:20px}
@media(max-width:560px){main{margin:16px;padding:22px}}
</style></head><body><main>
<span class="eyebrow">급똥 · 프리뷰 점검</span><h1>위치 승인 확인</h1>
<p>아래 버튼으로 Chrome에 위치 사용을 요청합니다. 지도와 자동 위치 요청을 제외한 확인 화면입니다.</p>
<button id="request" type="button">승인 요청 확인</button>
<div id="result" role="status" aria-live="polite"><strong id="status">버튼을 눌러 주세요.</strong><p id="detail">이미 허용된 경우에는 승인창 없이 바로 완료될 수 있습니다.</p></div>
<button id="copy" class="secondary" type="button">확인 결과 복사</button>
<p id="copy-result" role="status"></p>
<p style="font-size:13px;color:#64776d">위도·경도는 화면에 표시하거나 저장·전송하지 않습니다.</p>
<details><summary>확인 정보</summary><pre id="report"></pre></details>
<nav><a href="/location-check">새로 확인하기</a><a href="/">지도로 돌아가기</a></nav>
</main><script>
(() => {
 const byId = id => document.getElementById(id);
 const state = {check:'location-prompt-v1',browser:navigator.userAgent,secure:isSecureContext,topLevel:window===window.top,
   visibility:document.visibilityState,policy:'unknown',result:'READY',permissionReport:'not requested',nativeCalls:0};
 let finished=false, started=0, deadline;
 try {const policy=document.permissionsPolicy||document.featurePolicy;if(policy)state.policy=policy.allowsFeature('geolocation');} catch {}
 const render=()=>{byId('report').textContent=JSON.stringify(state,null,2)};
 const show=(code,title,detail)=>{state.result=code;byId('status').textContent=title;byId('detail').textContent=detail;render()};
 const finish=(code,title,detail)=>{if(finished)return;finished=true;clearTimeout(deadline);state.elapsedMs=Math.round(performance.now()-started);show(code,title,detail)};
 byId('request').addEventListener('click',()=>{
  if(state.nativeCalls)return;
  byId('request').disabled=true;
  state.userGesture=navigator.userActivation?.isActive??'unknown';
  state.visibility=document.visibilityState;
  started=performance.now();
  if(!isSecureContext){finish('INSECURE','보안 연결을 확인해 주세요.','HTTPS 주소로 열어 주세요.');return;}
  if(!navigator.geolocation){finish('UNSUPPORTED','위치 요청을 지원하지 않습니다.','이 브라우저에는 위치 요청 기능이 없습니다.');return;}
  if(state.policy===false){finish('POLICY_BLOCK','페이지에서 위치 요청이 차단되어 있습니다.','사이트의 위치 사용 정책을 점검해야 합니다.');return;}
  show('PENDING','브라우저에 승인 요청을 전달했습니다.','승인창이 나타나면 선택해 주세요. 결과는 아래에 표시됩니다.');
  deadline=setTimeout(()=>{
   state.elapsedMs=Math.round(performance.now()-started);
   // This is an observation, NOT evidence of denied permission. Keep listening
   // so a subsequent actual native response replaces this provisional result.
   show('NO_RESPONSE','브라우저의 응답이 없습니다.','15초 동안 허용·거부 결과가 오지 않았습니다. 승인창이 뜨지 않았다면 이 결과를 알려주세요.');
  },15000);
  try {
   state.nativeCalls++;
   navigator.geolocation.getCurrentPosition(
    ()=>finish('SUCCESS','위치 사용이 허용되었습니다.','승인창이 없었어도 이 결과라면 브라우저가 위치를 전달한 상태입니다.'),
    error=>{state.nativeErrorCode=error.code;finish(error.code===1?'DENIED':error.code===3?'TIMEOUT':'UNAVAILABLE',
     error.code===1?'브라우저가 위치 접근을 거부했습니다.':error.code===3?'위치 확인 시간이 초과되었습니다.':'위치 정보를 받지 못했습니다.',
     error.code===1?'사이트 또는 기기 중 어느 권한이 원인인지는 이 결과만으로 구분할 수 없습니다.':'승인창이 나타났는지와 함께 확인 결과를 알려주세요.');},
    {enableHighAccuracy:true,timeout:10000,maximumAge:30000});
   render();
  } catch {finish('EXCEPTION','위치 요청을 실행하지 못했습니다.','확인 결과를 알려주세요.');}
  // Advisory only; never precedes, gates, or replaces the native request.
  if(navigator.permissions?.query){
   state.permissionReport='pending';render();
   try {navigator.permissions.query({name:'geolocation'}).then(permission=>{state.permissionReport=permission.state;render()},()=>{state.permissionReport='unsupported';render()});}
   catch {state.permissionReport='unsupported';render();}
  }
 });
 byId('copy').addEventListener('click',async()=>{
  try {await navigator.clipboard.writeText(JSON.stringify(state,null,2));byId('copy-result').textContent='복사했습니다. 대화에 붙여 넣어 주세요.';}
  catch {document.querySelector('details').open=true;byId('copy-result').textContent='아래 확인 정보를 선택해 복사해 주세요.';}
 });
 render();
})();
</script></body></html>`

export function GET(request: Request) {
  const headers = {
    'Cache-Control': 'private, no-store, max-age=0',
    'CDN-Cache-Control': 'no-store',
    'Cloudflare-CDN-Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
  }
  // Fail closed outside the explicitly non-indexable preview and its own origin.
  if (process.env.SITE_INDEXABLE !== 'false' || new URL(request.url).hostname !== 'preview.geupddong.com') {
    return new Response('Not found', { status: 404, headers })
  }
  return new Response(html, { headers: {
    ...headers,
    'Content-Type': 'text/html; charset=utf-8',
    'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
    'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  } })
}
