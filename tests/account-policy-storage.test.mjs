import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('policy describes local ledger without claiming all external copies are gone or implicit consent', async () => {
  const source = await readFile(new URL('../src/components/PolicyPage.tsx', import.meta.url), 'utf8')
  assert.match(source, /검토용 개정안 · 시행일 미정/)
  assert.match(source, /국내 서버의 별도 파일 영역/)
  assert.match(source, /신규 저장에 Cloudflare R2를 사용하지 않습니다/)
  assert.doesNotMatch(source, /미국 제한 버킷|암호화하여 HTTPS로 전송합니다/)
  assert.match(source, /기존 외부 저장소의 잔여 사본/)
  assert.match(source, /독립 백업은 아닙니다/)
  assert.match(source, /모든 사본의 동시 삭제를 뜻하지 않습니다/)
  assert.match(source, /제보 및 처리 이력: 개인정보를 제거한 업무 이력은 기간 만료로 삭제하지 않고 계속 보존/)
  assert.match(source, /운영 감사 이력: 개인정보를 제거한 행위·처리 결과 이력은 기간 만료로 삭제하지 않고 계속 보존/)
  assert.doesNotMatch(source, /처리 완료 후 3년|일반 접속 로그: 최대 3개월|90일|88일/)
  assert.match(source, /기존 운영 로그 회전·용량 제한은 유지/)
  assert.match(source, /원본 로그의 영구 저장을 보장하지 않습니다/)
  assert.doesNotMatch(source, /운영 감사 로그: 처리 완료 후 3년/)
  assert.match(source, /회원정보 파기 시 해당 회원 식별 연결과 상세 내용을 제거/)
  assert.match(source, /보관 종료 조건/)
  assert.match(source, /32일은 검토를 시작하는 최소 대기 기준/)
  assert.match(source, /법정 보관 기간이나 자동 삭제일이 아닙니다/)
  assert.match(source, /자료가 없거나 확인에 실패하면 사본이 없다고 처리하지 않습니다/)
  assert.match(source, /policy-history\/2026-09-01.html/)
  assert.match(source, /그 전에는 이전 정책을 적용/)
  assert.match(source, /정책 공지만으로 회원 기능이 자동 개시되거나 복구용 보관에 동의한 것으로 처리하지 않습니다/)
})
