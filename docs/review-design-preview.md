# 현장 리뷰 디자인 프리뷰

연결 WBS: [WEB #205](https://github.com/toilet-project/toilet-web/issues/205), [API #105](https://github.com/toilet-project/toilet-api/issues/105), [정책 후속 DOCS #96](https://github.com/toilet-project/docs/issues/96).

## 현재 범위

`/review-preview`는 기능·디자인을 수정하기 위한 **격리된 체험 화면**이다. 기존 지도·로그인·내 페이지를 교체하지 않는다. 실제 API, 회원정보, GPS를 사용하지 않고 리뷰는 React 메모리에만 남는다. 새로고침하면 모두 초기화된다. 검색 비노출이며 `SITE_INDEXABLE=true`인 운영 빌드에서는 404다.

- 카드 이름 우측: 사이렌 제보 / 평가 행 우측: 기존 말풍선·펜 계열 리뷰.
- 필수: 만족도/청결도 별점 1~5, 화장지 유무. 선택: 혼잡도, 200자 자유글.
- 대기/혼잡에서 0~60분, 10분 단위. 60분은 '1시간 이상'.
- 작성 → 내 리뷰 → 전문 → 수정 / 작성자 정보 지우기. 최초 작성부터 7일 제한.
- 작성자 정보 지우기 후 자유글·선택 값·평가 유지, 작성자 '탈퇴한 사용자', 내 목록에서 제외. 회원 탈퇴와 구분하고 복구 불가를 확인창에서 설명한다.
- 시나리오 설정: 150m 밖/위치 정확도 부족/권한 거부, 저장 실패. 내 리뷰: 7일 경과. 상단: 모의 로그인/로그아웃.

## 검증

`pnpm lint`, `pnpm typecheck`, `pnpm test`에 더해 `tests/review-preview-browser.cjs`로 격리 프리뷰만 조작한다. 브라우저 실행 시 `PLAYWRIGHT_PACKAGE`는 설치된 Playwright 패키지를 가리키며, `REVIEW_PREVIEW_ORIGIN`은 로컬 시험 주소 또는 `https://preview.geupddong.com`만 허용한다. 실제 계정 정보는 입력하지 않는다.

브라우저 검사: 생성/수정/작성자 연결 해제/본문 잔존/7일 경계/150m 실패/저장 실패 입력 보존/로그인 안내/새로고침 초기화, 폭 320·390·1280의 가로 넘침, 리뷰/회원 쓰기 요청 없음. 공개 프리뷰의 기존 Cloudflare `/cdn-cgi/rum` POST는 성능 측정으로 별도 집계하며 다른 쓰기 요청은 허용하지 않는다. Chromium 모바일 에뮬레이션이며 실제 iPhone Safari/Chrome 인수와는 다르다.

## 다음 구현

실제 로그인 및 카드 컴포넌트 연결, 서버 DB/API·소유권·위치 신선도 검증, 중복/도배 제한, 집계 유효시간, 실제 계정 탈퇴/최종 파기와의 연동은 아직 구현 완료가 아니다. 약관·위치 고지는 DOCS #96에서 후속 검토 후 공개한다. 프리뷰 배포는 운영 기능 활성화 승인이 아니다.
