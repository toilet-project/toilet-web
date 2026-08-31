import type { ReactNode } from 'react'

type PolicyPageKind = 'terms' | 'privacy' | 'location'

const updatedAt = '2026년 9월 1일'

function PolicyLayout({ title, children }: { title: string; children: ReactNode }) {
  return <main className="policy-page">
    <header className="policy-header">
      <a href="/" className="policy-brand">급똥</a>
      <a href="/" className="policy-home-link">지도로 돌아가기</a>
    </header>
    <article className="policy-document">
      <p className="policy-eyebrow">급똥 정책 안내</p>
      <h1>{title}</h1>
      <p className="policy-effective">시행일·최종 수정일: {updatedAt}</p>
      {children}
      <section>
        <h2>문의처</h2>
        <p>운영자: 급똥(개인 운영 서비스)</p>
        <p>개인정보 관련 문의: <a href="mailto:privacy@geupddong.com">privacy@geupddong.com</a></p>
      </section>
    </article>
    <PolicyFooter />
  </main>
}

export function PolicyPage({ kind }: { kind: PolicyPageKind }) {
  if (kind === 'terms') return <PolicyLayout title="서비스 이용약관">
    <section><h2>1. 목적</h2><p>이 약관은 개인 운영 서비스인 급똥이 제공하는 공중화장실 조회, 소셜 로그인, 정보 제보와 관련한 이용 조건을 정합니다.</p></section>
    <section><h2>2. 이용 대상</h2><p>지도와 화장실 조회는 로그인 없이 이용할 수 있습니다. 회원가입, 로그인 및 정보 제보 기능은 만 14세 이상만 이용할 수 있습니다.</p></section>
    <section><h2>3. 계정과 소셜 로그인</h2><p>Google 또는 Kakao 계정으로 본인 인증 후 필수 약관에 동의하면 계정이 활성화됩니다. 이용자는 자신의 계정을 안전하게 관리해야 하며 타인의 계정을 이용해서는 안 됩니다.</p></section>
    <section><h2>4. 제보와 콘텐츠</h2><p>이용자는 화장실 위치와 개방시간 등 사실에 근거한 정보를 제보해야 합니다. 제보는 관리자 검토 후 승인·반려되며, 서비스 품질과 안전을 위해 수정되거나 반영되지 않을 수 있습니다.</p></section>
    <section><h2>5. 서비스 정보의 한계</h2><p>공공데이터와 사용자 제보를 바탕으로 정보를 제공하므로 실제 운영 여부, 위치, 시설 상태가 다를 수 있습니다. 긴급한 상황에서는 현장 안내와 관계기관 정보를 우선 확인해 주세요.</p></section>
    <section><h2>6. 이용 제한과 탈퇴</h2><p>서비스 방해, 허위 제보, 권리 침해가 확인되면 이용을 제한할 수 있습니다. 이용자는 계정 화면에서 탈퇴할 수 있으며, 탈퇴 시 소셜 연결 정보와 로그인 세션이 폐기됩니다.</p></section>
    <section><h2>7. 약관 변경</h2><p>중요한 변경은 시행 전에 서비스 화면을 통해 알립니다. 변경된 필수 약관은 다시 동의를 요청할 수 있습니다.</p></section>
  </PolicyLayout>

  if (kind === 'privacy') return <PolicyLayout title="개인정보 처리방침">
    <section id="collection"><h2>1. 수집하는 개인정보</h2><ul><li>소셜 로그인: 제공자, 제공자 회원 식별값의 해시, 표시 이름, 이메일, 이메일 인증 여부</li><li>서비스 이용: 역할, 동의한 정책과 버전·시각, 최근 로그인 시각</li><li>정보 제보: 대상 화장실, 제보 내용, 선택한 좌표와 도로명 주소, 처리 상태와 관리자 메모</li><li>운영·보안: 접속 기록, 감사 로그, 오류 기록</li></ul></section>
    <section><h2>2. 이용 목적</h2><p>회원 식별, 소셜 로그인, 제보 접수·처리 결과 제공, 부정 이용 방지, 장애 대응, 서비스 품질 개선에 사용합니다.</p></section>
    <section><h2>3. 보유 기간</h2><ul><li>계정·소셜 연결 정보: 회원 탈퇴 시까지</li><li>리프레시 토큰: 발급 후 최대 14일 또는 로그아웃·탈퇴 시까지</li><li>제보 및 처리 이력: 처리 완료 후 3년</li><li>동의 이력과 운영 감사 로그: 분쟁 대응과 동의 증명을 위해 탈퇴 또는 처리 완료 후 3년</li><li>일반 접속 로그: 최대 3개월</li></ul><p>보유 목적이 끝난 정보는 복구하기 어려운 방법으로 파기하며, 관계 법령에서 별도 보존을 요구하는 경우 해당 기간만 보관합니다.</p></section>
    <section><h2>4. 외부 서비스 이용</h2><p>로그인을 위해 Google·Kakao OAuth, 지도와 주소 확인을 위해 Kakao Maps, 웹 제공·보안·이메일 전달을 위해 Cloudflare를 이용합니다. 각 제공자가 인증과 전송 과정에서 처리하는 정보에는 해당 제공자의 정책이 적용됩니다.</p></section>
    <section><h2>5. 이용자의 권리</h2><p>이용자는 자신의 제보 처리 상태를 확인하고, 계정 화면에서 탈퇴할 수 있습니다. 개인정보 열람·정정·삭제·처리정지 요청은 문의 이메일로 접수할 수 있습니다.</p></section>
    <section><h2>6. 안전성 확보 조치</h2><p>HttpOnly 보안 쿠키, JWT 단기 만료, Redis 기반 리프레시 토큰 폐기, 비밀번호·토큰의 저장소 분리, 접근 권한 통제와 감사 로그를 적용합니다.</p></section>
    <section><h2>7. 만 14세 미만</h2><p>급똥의 회원 기능은 만 14세 미만 아동을 대상으로 하지 않습니다. 만 14세 미만임이 확인되면 회원 기능 이용을 중단하고 관련 계정 정보를 삭제합니다.</p></section>
  </PolicyLayout>

  return <PolicyLayout title="위치정보 이용 안내">
    <section><h2>1. 언제 위치를 사용하나요?</h2><p>현재 위치 버튼을 누르거나 첫 방문 시 브라우저가 위치 권한을 요청할 때, 주변 화장실 조회와 직선거리 계산에 사용합니다.</p></section>
    <section><h2>2. 서버에 저장하나요?</h2><p>일반 지도 조회에 사용한 기기 GPS 좌표는 급똥 서버에 저장하지 않습니다. 브라우저 안에서 지도 중심과 거리 계산에만 사용합니다.</p></section>
    <section><h2>3. 예외: 위치 제보</h2><p>이용자가 위치 제보를 직접 제출하면 화면에서 확인한 좌표와 도로명 주소가 제보 처리 목적으로 저장됩니다. 제출 전 최종 확인 화면을 제공합니다.</p></section>
    <section><h2>4. 권한을 거부하거나 철회하는 방법</h2><p>위치 권한을 거부해도 주소·장소 검색과 지도 탐색은 이용할 수 있습니다. 권한은 브라우저 주소창의 사이트 설정에서 언제든 변경할 수 있습니다.</p></section>
  </PolicyLayout>
}

export function PolicyFooter() {
  return <div className="policy-footer"><nav aria-label="서비스 정책"><a href="/policies/terms">이용약관</a><a href="/policies/privacy">개인정보 처리방침</a><a href="/policies/location">위치정보 안내</a><a href="mailto:privacy@geupddong.com">문의</a></nav><small>© 2026 급똥</small></div>
}
