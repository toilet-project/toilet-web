/** Recovery data and local anti-resurrection records have separate lifecycles. */
export function AccountErasureNotice() {
  return <details className="account-erasure-notice">
    <summary>삭제 범위·백업 안내</summary>
    <p>회원정보 파기 완료 안내는 서비스 DB의 계정 정보와 개인 식별 연결에 대한 결과입니다. 이미 반영된 화장실 정보는 남으며, 기존 백업까지 같은 순간에 모두 지워졌다는 뜻은 아닙니다.</p>
    <p>백업에서 삭제된 계정이 되살아나는 것을 막기 위한 최소 기록은 운영 서버에 암호화하여 복구용 3개월 보관과 별도로 관리합니다. 관련 사본과 복원 방지 필요성을 확인한 뒤 정리하며, 복구용 보관 기간과 같은 날 삭제되는 것은 아닙니다.</p>
    <a href="/policies/privacy#erasure-records" target="_blank" rel="noreferrer">보관·파기 안내 보기</a>
    {' · '}<a href="mailto:privacy@geupddong.com">개인정보 문의</a>
  </details>
}
