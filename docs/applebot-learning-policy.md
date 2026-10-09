# Applebot 학습 이용 거부

Applebot은 검색용 수집 데이터를 Apple의 기반 모델 학습에도 사용할 수 있다. Applebot-Extended는 별도 수집 봇이 아니라 학습 이용을 제어하는 robots 토큰이다. 공개 웹과 API의 robots.txt에 `User-agent: Applebot-Extended` / `Disallow: /`를 제공한다. Applebot 검색 수집과 일반 서비스 API 접근은 유지한다.

## 적용 구조

- `robots-policy-worker.mjs`는 웹·API·프리뷰의 `/robots.txt`만 제공한다. 서비스 본체와 분리되어 앱 재배포·재시작 없이 정책을 바꿀 수 있다. 비밀값, 데이터 저장소, 서비스 바인딩은 없다.
- 웹 정책은 Next의 `robotsPolicy(true)`를 함께 사용해 기존 학습 봇 거부·공개 경로 허용·사이트맵을 유지한다. Next가 직접 제공하는 정책에도 Applebot-Extended를 포함한다.
- API는 Applebot-Extended만 거부하고 일반 크롤링은 허용한다. 다른 호스트의 `/api/` 규칙을 API 전체에 복사하지 않는다.
- 프리뷰는 기존 전체 수집 거부와 noindex를 유지한다.
- `www.geupddong.com/robots.txt`는 기존 정규 도메인 이동을 통해 같은 정책을 받는다.
- 경로 라우트의 끝 `*`는 쿼리 문자열을 포함하기 위한 것이다. 실제 처리기는 정확히 `/robots.txt` 경로만 제공한다.

## 반영과 복구

1. `node --experimental-strip-types --test tests/seo.test.mjs tests/robots-policy-worker.test.mjs`와 Wrangler dry-run을 통과한다.
2. `wrangler.robots-policy.preview.jsonc`로 같은 Worker를 프리뷰에 먼저 배포하고 `https://preview.geupddong.com/robots.txt`를 확인한다. 운영 반영 후 이 설정을 다시 배포하면 운영 라우트가 제거되므로 주의한다.
3. 승인 후 `wrangler.robots-policy.jsonc`로 운영 웹·API 라우트를 추가한다. 공개 응답에서 Extended 거부, Applebot·Googlebot 공개 경로 허용, 사이트맵, 프리뷰 거부를 확인한다. 일반 페이지와 API 건강 상태도 확인한다.
4. 봇 정책 변경 시 공유 함수만 수정하고 끝내지 않고 이 Worker도 배포한다. 서비스 본체의 전체 배포와 이 정책 배포는 별개다.
5. 복구는 기존 정책 Worker 버전으로 되돌린다. 첫 설치를 철회하려면 이 Worker에 연결된 웹·API·프리뷰의 robots 라우트만 제거한다. 기존 웹 전체 라우트·API Tunnel·저장소는 수정하지 않는다. 정책을 철회하면 학습 이용 거부도 사라질 수 있다.

이 규칙은 Apple의 학습 이용 거부 의사 표시이며 HTTP 수집량을 줄이는 차단은 아니다. 이미 사용된 데이터의 소급 삭제를 보장하지 않는다. Apple의 robots 재확인까지 반영 지연이 있을 수 있다. 후기·지도 API 요청 최적화는 별도 검토 대상이다.

[Apple 공식 설명](https://support.apple.com/ko-kr/119829) · [Cloudflare 경로 우선순위](https://developers.cloudflare.com/workers/configuration/routing/routes/)
