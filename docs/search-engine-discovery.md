# 다국어 검색엔진 노출 확장

## 적용 순서

1. Google Search Console과 네이버 Search Advisor는 기존 운영을 유지한다.
2. Bing Webmaster Tools에 `https://geupddong.com`을 등록하고 `/sitemap.xml`을 제출한다. Google Search Console 가져오기를 우선 사용한다.
3. Cloudflare Crawler Hints를 보조 경로로 사용한다.
4. 내부 캐시 무효화 이벤트가 공개 시설 변경을 확정한 뒤 IndexNow로 변경 URL을 알린다.
5. Yandex는 IndexNow 수신 결과와 실제 유입을 관찰한 뒤 별도 웹마스터 등록을 결정한다. Baidu는 중국 본토 접근성과 계정 검증을 먼저 확인한다.

Yahoo Japan, DuckDuckGo, Ecosia는 별도 사이트 등록보다 Google/Bing 색인과 사이트맵을 통해 발견되는 경로를 우선한다.

## IndexNow 안전 조건

- `SITE_INDEXABLE=true`와 `INDEXNOW_ENABLED=true`가 모두 충족된 운영 Worker에서만 동작한다.
- `geupddong.com`의 공개 상세 URL만 허용한다. API, 관리자, 로그인, 내부 캐시 경로, 쿼리 문자열은 거부한다.
- 수정 이벤트는 현재 공개 API를 새로 읽어 번역 이름과 주소가 모두 있는 언어의 대표 URL만 제출한다.
- 삭제·비공개 이벤트는 언어별 안정 상세 별칭을 제출한다. 과거 지역·이름 슬러그는 현행 이벤트 계약에 없으므로 사이트맵 제거와 검색엔진 재방문으로 정리한다.
- 한 수신 배치에서 URL을 중복 제거하며 IndexNow 제한인 10,000개를 넘기지 않는다.
- 429와 5xx는 제한 횟수만 재시도한다. 알림 실패는 DB 변경, 캐시 무효화, outbox ACK를 실패시키지 않는다.
- 키는 인증 비밀이 아니라 도메인 소유 확인용 공개 값이며 루트 정적 파일로 제공한다.

## 운영 전환과 되돌리기

현재 미리보기와 운영 설정의 `INDEXNOW_ENABLED` 기본값은 `false`다. 키 파일의 운영 접근성, Bing 사이트 등록, 소수 변경 이벤트 로그를 확인한 다음 운영 설정만 `true`로 바꿔 배포한다. 문제가 있으면 값을 `false`로 되돌리면 캐시 무효화와 페이지 제공은 그대로 유지된다.

대량 전체 URL 제출은 하지 않는다. 전체 목록은 사이트맵이 담당하고 IndexNow는 새로 추가되거나 수정·삭제·비공개 전환된 URL만 알린다.
