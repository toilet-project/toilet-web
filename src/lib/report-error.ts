export function reportReadErrorMessage(reason: unknown): string {
  if (reason instanceof TypeError) return '서버에 연결하지 못했어요. 인터넷 연결을 확인한 뒤 다시 불러와 주세요.'
  if (reason instanceof Error && reason.message === '로그인이 필요합니다.') return reason.message
  return '내 제보를 불러오지 못했어요. 잠시 후 다시 불러와 주세요.'
}
