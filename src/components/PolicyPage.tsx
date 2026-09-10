import type { ReactNode } from 'react'
import { accountPolicyPublication, policyPublicationAttributes } from '../lib/accountPolicyPublication'

type PolicyPageKind = 'terms' | 'privacy' | 'location' | 'all'

// Publication and feature activation are separate. The backend remains authoritative.
const publicationNotice = accountPolicyPublication.status === 'draft' ? '검토용 개정안 · 시행일 미정'
  : `개정 정책 · 공지: ${new Date(accountPolicyPublication.announcedAt!).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} · 시행: ${new Date(accountPolicyPublication.effectiveAt!).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} (한국시간)`

function PolicyLayout({ title, children, embedded = false }: { title: string; children: ReactNode; embedded?: boolean }) {
  if (embedded) return <section className="policy-combined-section"><h2>{title}</h2>{children}</section>
  return <main className="policy-page">
    <header className="policy-header">
      <a href="/" className="policy-brand">급똥</a>
      <a href="/" className="policy-home-link">지도로 돌아가기</a>
    </header>
    <article className="policy-document" {...policyPublicationAttributes(accountPolicyPublication)}>
      <p className="policy-eyebrow">급똥 정책 안내</p>
      <h1>{title}</h1>
      <p className="policy-effective">{publicationNotice}</p>
      <p><a href="/policy-history/2026-09-01.html">이전 정책 보기 (2026년 9월 1일)</a></p>
      {accountPolicyPublication.status === 'published' && <section className="policy-change-notice" aria-label="정책 변경 안내">
        <h2>회원 탈퇴·복구 정책 변경 안내</h2>
        <p>아래 개정 내용은 표시된 시행 시각부터 적용하며, 그 전에는 이전 정책을 적용합니다. 정책 공지만으로 회원 기능이 자동 개시되거나 복구용 보관에 동의한 것으로 처리하지 않습니다. 기능 이용 가능 여부는 계정 화면에서 안내합니다.</p>
        <ul><li>탈퇴 시 별도 선택 동의한 경우에만 복구용 정보를 3개월 보관합니다.</li><li>미동의·삭제 요청·기간 만료 시 회원 개인정보를 파기 대상으로 처리하며, 개인정보를 제거한 제보·감사 업무 이력은 유지합니다.</li><li>국내 암호화 재생 방지 기록의 보관 목적과 종료 절차를 안내합니다.</li></ul>
      </section>}
      {accountPolicyPublication.status === 'draft' && <p className="policy-draft-notice">아직 시행되지 않은 검토안입니다. 회원정보의 실제 보관 구조, 개인정보 사본·재생 방지 기록의 종료 절차와 공지 일정을 확인한 뒤 확정합니다. 현재 시행 중인 정책을 대체하지 않습니다.</p>}
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

export function PolicyPage({ kind, embedded = false }: { kind: PolicyPageKind; embedded?: boolean }) {
  if (kind === 'all') return <PolicyLayout title="이용약관 및 서비스 정책">
    <nav className="policy-section-links" aria-label="정책 목차"><a href="#terms">이용약관</a><a href="#privacy">개인정보 처리방침</a><a href="#location">위치정보 안내</a></nav>
    <div id="terms"><PolicyPage kind="terms" embedded /></div><div id="privacy"><PolicyPage kind="privacy" embedded /></div><div id="location"><PolicyPage kind="location" embedded /></div>
  </PolicyLayout>
  if (kind === 'terms') return <PolicyLayout title="서비스 이용약관" embedded={embedded}>
    <section><h2>1. 목적</h2><p>이 약관은 개인 운영 서비스인 급똥이 제공하는 공중화장실 조회, 소셜 로그인, 정보 제보와 관련한 이용 조건을 정합니다.</p></section>
    <section><h2>2. 이용 대상</h2><p>지도와 화장실 조회는 로그인 없이 이용할 수 있습니다. 회원가입, 로그인 및 정보 제보 기능은 만 14세 이상만 이용할 수 있습니다.</p></section>
    <section><h2>3. 계정과 소셜 로그인</h2><p>Google 또는 Kakao 계정으로 본인 인증 후 필수 약관에 동의하면 계정이 활성화됩니다. 이용자는 자신의 계정을 안전하게 관리해야 하며 타인의 계정을 이용해서는 안 됩니다.</p></section>
    <section><h2>4. 제보와 콘텐츠</h2><p>이용자는 화장실 위치와 개방시간 등 사실에 근거한 정보를 제보해야 합니다. 제보는 관리자 검토 후 승인·반려되며, 서비스 품질과 안전을 위해 수정되거나 반영되지 않을 수 있습니다.</p></section>
    <section><h2>5. 서비스 정보의 한계</h2><p>공공데이터와 사용자 제보를 바탕으로 정보를 제공하므로 실제 운영 여부, 위치, 시설 상태가 다를 수 있습니다. 긴급한 상황에서는 현장 안내와 관계기관 정보를 우선 확인해 주세요.</p></section>
    <section><h2>6. 이용 제한과 탈퇴</h2><p>서비스 방해, 허위 제보, 권리 침해가 확인되면 이용을 제한할 수 있습니다. 이용자는 계정 화면에서 탈퇴할 수 있으며, 서비스 이용과 로그인 세션은 즉시 중지됩니다. 계정 복구용 정보의 3개월 보관에 별도로 동의한 경우에만 해당 기간 내 동일 소셜 계정 인증과 명시적 복구 확인을 거쳐 계정·제보 연결을 복구할 수 있습니다. 관리자 권한은 자동 복구되지 않습니다. 동의하지 않거나 보관 기간이 지나면 복구를 허용하지 않고 회원정보와 제보의 회원 연결을 파기 대상으로 처리합니다. 요청이 대기 중인 경우와 서비스 DB 파기가 완료된 경우를 구분해 안내하며, 파기 후 재가입은 새 계정으로 처리합니다. 제보로 반영된 화장실 정보는 유지됩니다.</p></section>
    <section><h2>7. 약관 변경</h2><p>중요한 변경은 시행 전에 서비스 화면을 통해 알립니다. 변경된 필수 약관은 다시 동의를 요청할 수 있습니다.</p></section>
  </PolicyLayout>

  if (kind === 'privacy') return <PolicyLayout title="개인정보 처리방침" embedded={embedded}>
    <section id="collection"><h2>1. 수집하는 개인정보</h2><ul><li>소셜 로그인: 제공자, 제공자 회원 식별값의 해시, 표시 이름, 이메일, 이메일 인증 여부</li><li>서비스 이용: 역할, 동의한 정책과 버전·시각, 최근 로그인 시각</li><li>정보 제보: 대상 화장실, 제보 내용, 선택한 좌표와 도로명 주소, 처리 상태와 관리자 메모</li><li>운영·보안: 접속 기록, 감사 로그, 오류 기록</li></ul></section>
    <section><h2>2. 이용 목적</h2><p>회원 식별, 소셜 로그인, 제보 접수·처리 결과 제공, 부정 이용 방지, 장애 대응, 서비스 품질 개선에 사용합니다.</p></section>
    <section><h2>3. 보유 기간</h2><ul><li>이메일·인증 여부·일반 로그인 정보: 회원 탈퇴 시 삭제·초기화</li><li>계정 복구용 정보: 탈퇴 시 별도 선택 동의한 경우에 한하여 탈퇴 시각부터 달력상 3개월. 소셜 제공자·보호된 고유 식별자, 닉네임, 회원·제보 연결 정보와 동의·탈퇴·삭제 예정 시각을 복구 목적으로 보관합니다. 이메일·소셜 토큰은 복구용으로 보관하지 않습니다.</li><li>복구용 보관 미동의 또는 보관 중 삭제 요청: 회원·소셜 식별정보, 회원별 동의·알림 및 제보의 회원 연결·자유 입력 사유를 파기합니다. 같은 소셜 로그인으로 재가입해도 이전 계정과 연결되지 않습니다.</li><li>리프레시 토큰: 발급 후 최대 14일 또는 로그아웃·탈퇴 시까지</li><li>제보 및 처리 이력: 개인정보를 제거한 업무 이력은 기간 만료로 삭제하지 않고 계속 보존합니다. 회원정보 파기 시 작성자 연결과 개인정보가 포함될 수 있는 자유 입력 사유·검토 메모를 제거합니다. 승인되어 공공 화장실 정보에 반영된 내용은 유지합니다.</li><li>운영 감사 이력: 개인정보를 제거한 행위·처리 결과 이력은 기간 만료로 삭제하지 않고 계속 보존합니다. 개인정보를 포함한 원본의 영구 보관을 뜻하지 않습니다. 회원정보 파기 시 해당 회원 식별 연결과 상세 내용을 제거합니다.</li><li>일반 접속·시스템 로그: 이번 탈퇴 개정에서 서비스 전체 로그의 기간별 삭제 정책이나 저장 방식을 새로 도입하지 않습니다. 기존 운영 로그 회전·용량 제한은 유지되며, 원본 로그의 영구 저장을 보장하지 않습니다.</li></ul><p>복구용 보관 동의는 선택 사항이며 거부해도 탈퇴할 수 있습니다. 보관 중에는 동일 소셜 로그인 후 복구하지 않고 즉시 삭제를 요청하거나 개인정보 문의 이메일을 이용할 수 있습니다. 보유 목적이 끝난 정보는 복구하기 어려운 방법으로 파기하며, 관계 법령에서 별도 보존을 요구하는 경우에는 근거와 기간에 따라 분리 보관합니다. 장애로 파기가 지연되면 서비스 이용·복구를 차단한 상태로 재시도합니다.</p></section>
    <section><h2>4. 외부 서비스 이용</h2><p>로그인을 위해 Google·Kakao OAuth, 지도와 주소 확인을 위해 Kakao Maps, 웹 제공·보안·이메일 전달을 위해 Cloudflare를 이용합니다. 각 제공자가 인증과 전송 과정에서 처리하는 정보에는 해당 제공자의 정책이 적용됩니다.</p></section>
    <section id="erasure-records"><h2>4-1. 백업과 계정 재생 방지 기록</h2>
      <p>서비스 DB의 회원정보 파기, 선택한 복구 정보의 3개월 보관, 암호화 백업과 계정 재생 방지 기록은 서로 다른 처리입니다. 회원정보 파기 완료 안내가 기존 모든 사본의 동시 삭제를 뜻하지 않습니다.</p>
      <p>탈퇴 시점부터 달력상 3개월의 복구 가능 기한이 지나면 복구를 허용하지 않습니다. 기한이 지난 정보는 일별 공공데이터 수집 종료 후 정기 파기 작업의 대상이 됩니다. 장애가 있으면 완료로 표시하지 않고 처리 대기·실패 상태로 관리합니다.</p>
      <p>백업에 남은 과거 계정이 복원되지 않도록 최소 재생 방지 기록을 분리 보관하고 복원 점검에 적용합니다. 기록은 암호화하더라도 익명정보로 단정하지 않습니다.</p>
      <dl className="policy-storage-facts">
        <div><dt>보관 위치·관리 주체</dt><dd>급똥 운영자가 관리하는 국내 서버의 별도 파일 영역. 서비스 DB와 분리해 접근 권한을 제한합니다.</dd></div>
        <div><dt>저장 구조</dt><dd>회원별 재생 방지 기록은 암호화된 로컬 파일로 보관하도록 구성했습니다. 이 기록의 신규 저장에 Cloudflare R2를 사용하지 않습니다. 같은 서버의 별도 파일이므로 서버·디스크 전체 유실까지 막는 독립 백업은 아닙니다.</dd></div>
        <div><dt>기록 항목</dt><dd>내부 회원 ID, 가입 시각, 탈퇴 식별자, 파기 대상 시각, DB 복원 세대·형식 정보와 파기 확인 시각 등 최소 처리 증빙. 이메일·닉네임·소셜 토큰은 이 대장에 넣지 않습니다.</dd></div>
        <div><dt>기록 시기·방법</dt><dd>최종 회원정보 파기 전 암호화된 보호 기록을 로컬 파일에 저장하고, 결과 확인 증빙을 남깁니다. 독립 검증 기준은 아래 GitHub 기록과 대조합니다.</dd></div>
        <div><dt>보관 종료 조건</dt><dd>서비스 DB에서 해당 회원정보가 파기된 것을 확인하고, 해당 회원을 되살릴 수 있는 과거 사본이 남아 있는지 점검합니다. 관련 사본의 소멸, 진행 중인 복원 작업의 부재, 독립 검증 기준의 갱신을 확인한 뒤 해당 회원의 재생 방지 기록을 검토·승인 절차를 거쳐 파기합니다. 현재 도구의 최초 DB 부재 확인 후 32일은 검토를 시작하는 최소 대기 기준이며 법정 보관 기간이나 자동 삭제일이 아닙니다. 복구용 보관 3개월과도 별개입니다.</dd></div>
      </dl>
      <p>비공개 독립 GitHub 기록에는 회원별 목록 대신 집계 건수·검증 해시·복원 세대를 보관합니다. 회원별 대장 원문과 암호화 키는 올리지 않습니다. 로컬 저장으로 변경했다고 웹·인증·독립 검증에 사용하는 모든 외부 서비스의 정보 처리가 국내로 한정되는 것은 아닙니다.</p>
      <p>점검 범위에는 암호화 DB 백업, DB 변경 로그, 과거 Redis 저장 파일, 이전 DB 볼륨, 복원 임시 사본, 기존 외부 저장소의 잔여 사본이 포함됩니다. 자료가 없거나 확인에 실패하면 사본이 없다고 처리하지 않습니다. 보관이 계속 필요한 사유를 검토하고, 불필요해진 개인정보 기록은 파기 대상으로 처리합니다. 아래 문의처로 삭제·처리정지를 요청할 수 있습니다.</p>
    </section>
    <section><h2>5. 이용자의 권리</h2><p>이용자는 자신의 제보 처리 상태를 확인하고, 계정 화면에서 탈퇴할 수 있습니다. 개인정보 열람·정정·삭제·처리정지 요청은 문의 이메일로 접수할 수 있습니다.</p></section>
    <section><h2>6. 안전성 확보 조치</h2><p>HttpOnly 보안 쿠키, JWT 단기 만료, Redis 기반 리프레시 토큰 폐기, 비밀번호·토큰의 저장소 분리, 접근 권한 통제와 감사 로그를 적용합니다.</p></section>
    <section><h2>7. 만 14세 미만</h2><p>급똥의 회원 기능은 만 14세 미만 아동을 대상으로 하지 않습니다. 만 14세 미만임이 확인되면 회원 기능 이용을 중단하고 관련 계정 정보를 삭제합니다.</p></section>
  </PolicyLayout>

  return <PolicyLayout title="위치정보 이용 안내" embedded={embedded}>
    <section><h2>1. 언제 위치를 사용하나요?</h2><p>현재 위치 버튼을 누르거나 첫 방문 시 브라우저가 위치 권한을 요청할 때, 주변 화장실 조회와 직선거리 계산에 사용합니다.</p></section>
    <section><h2>2. 서버에 저장하나요?</h2><p>일반 지도 조회에 사용한 기기 GPS 좌표는 급똥 서버에 저장하지 않습니다. 브라우저 안에서 지도 중심과 거리 계산에만 사용합니다.</p></section>
    <section><h2>3. 예외: 위치 제보</h2><p>이용자가 위치 제보를 직접 제출하면 화면에서 확인한 좌표와 도로명 주소가 제보 처리 목적으로 저장됩니다. 제출 전 최종 확인 화면을 제공합니다.</p></section>
    <section><h2>4. 권한을 거부하거나 철회하는 방법</h2><p>위치 권한을 거부해도 주소·장소 검색과 지도 탐색은 이용할 수 있습니다. 권한은 브라우저 주소창의 사이트 설정에서 언제든 변경할 수 있습니다.</p></section>
  </PolicyLayout>
}

export function PolicyFooter() {
  return <div className="policy-footer"><nav aria-label="서비스 정책"><a href="/policies/terms">이용약관</a><a href="/policies/privacy">개인정보 처리방침</a><a href="/policies/location">위치정보 안내</a><a href="mailto:privacy@geupddong.com">문의</a></nav><small>© 2026 급똥</small></div>
}
