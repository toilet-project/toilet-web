import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('review policy distinguishes retained content, author unlink and transient location', async () => {
  const source = await readFile(new URL('../src/components/PolicyPage.tsx', import.meta.url), 'utf8')
  for (const required of [
    '작성 후 7일 이내', '작성자 이름은 ‘익명’', '작성한 글은 삭제되지 않습니다',
    '리뷰 내용은 남습니다', '리뷰 행에 저장하지 않습니다', '화장실 150m 이내',
    '정확도 50m 이하', '최근 5분 이내', '리뷰를 식별할 수 있는 정보와 요청 부분',
  ]) assert.match(source, new RegExp(required))
  assert.doesNotMatch(source, /현재 위치.{0,30}영구 보존/)
  assert.doesNotMatch(source, /작성자 정보 지우기.{0,80}리뷰.{0,20}삭제됩니다/)
})
