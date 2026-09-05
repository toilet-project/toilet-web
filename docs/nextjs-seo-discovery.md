# 검색 발견 경로: sitemap · robots · Place

2026-09-05 · Next.js feature 구현. 운영 API/Workers에는 아직 적용하지 않았다.

## 공개 URL

| 경로 | 내용 |
| --- | --- |
| `/sitemap.xml` | 홈/정책 sitemap과 존재하는 화장실 ID 구간의 index |
| `/pages-sitemap.xml` | 홈, 이용약관, 개인정보, 위치정보 정책의 실제 4개 URL |
| `/sitemap-toilets-{shard}.xml` | `(shard × 10000, (shard + 1) × 10000]`의 실제 ID, 최대 1만 개 |
| `/robots.txt` | 운영 허용 / 미리보기 전체 차단 |
| `/toilet/{id}` | 실제 상세 HTML과 Place JSON-LD |

공개 shard URL은 root에 두고 내부 `/sitemaps/{shard}.xml` handler로 rewrite한다. sitemap 파일 위치에 따른 URL 범위 제한에 맞추기 위해서다. 인덱스에 포함된 공개 root URL을 제출한다. `/region/...`이나 로그인·관리자·내 제보 URL은 포함하지 않는다.

## 데이터 흐름과 비용

- API `GET /api/v1/toilets/sitemap/shards`는 기존 toilet PK만 집계한다. 실제 존재하는 구간만 반환한다.
- `GET /api/v1/toilets/sitemap/ids?shard=0`는 PK 범위 쿼리와 LIMIT 10000으로 **ID 배열만** 반환한다. 주소/좌표/개인정보/상세 엔티티는 읽지 않는다.
- OFFSET이 아니므로 중간 삭제 후 뒤쪽 구간이 이동하지 않는다. 범위 사이의 ID 공백도 보존한다. 없는 구간은 XML 404다.
- 추가 테이블·인덱스·DDL 없음. `toilet_id` PK를 재사용한다. 메타 집계는 전체 PK를 훑는 비용이 있으며, 대규모 증가 시 실행계획을 다시 측정한다.
- 양의 JavaScript safe integer ID만 공개한다. index는 화장실 shard 최대 49,999개 + 정적 sitemap 1개. 초과는 잘라서 성공 처리하지 않는다.
- Next 원본 ID 응답 캐시는 1시간, XML 공유 캐시 헤더는 5분, API 헤더는 5분이다. 서버 fetch는 사용자 쿠키·Authorization을 전달하지 않는다.
- 요청 시 생성한다. `connection()`으로 index의 빌드 시 조회도 막았다. 수만 상세 페이지를 사전 생성하지 않는다.
- 신규/삭제 ID의 sitemap 반영은 이 주기의 요청 기반 갱신이며 상세 webhook의 즉시 갱신과는 별개다. 오류 시 기존 data cache가 유지될 수 있어 1시간은 절대 반영 SLA가 아니다.
- HTTP 실패/timeout/형식 불일치/범위 이탈/중복 ID는 XML 503 + no-store + Retry-After 60. 빈 정상 사이트맵으로 바꾸지 않는다.
- 공개 ID API에는 애플리케이션별 rate limiter를 새로 넣지 않았다. 기존 edge 보호를 유지하고 실제 호출량을 확인한다.

## robots와 JSON-LD

- `SITE_INDEXABLE=true`는 홈/화장실을 허용하고 내부 API·관리 경로를 제외한다. 그 외 값은 전체 차단 + 기존 noindex 헤더/metadata 유지. build/runtime 설정을 일치시켜야 한다.
- robots는 인증이 아니다. 기존 관리자 인증이나 서명 webhook을 대체하지 않는다.
- 기존 정적 `public/robots.txt`, `public/sitemap.xml`은 같은 경로 충돌을 막기 위해 생성 route로 대체했다. Git에서 복원 가능하다.
- 기존 서버 상세 fetch를 재사용해 Place/PostalAddress/GeoCoordinates를 출력한다. 도로명 우선, 없으면 지번 한 개만 쓴다.
- 현재 공개 상세의 검증된 region만 addressRegion/addressLocality로 사용한다. 천안시 서북구를 그대로 보존하고 세종의 없는 하위 지역을 만들지 않는다.
- 유효한 좌표가 없으면 geo를 생략한다. 영업시간 문자열을 임의 파싱하거나 장애인 접근성·평점·시설 사진을 만들어 넣지 않는다.
- 수정시각을 보장하는 필드가 없어 lastmod는 생략한다. 공공데이터 기준일이나 실행일을 수정일로 쓰지 않는다.
- 이름/주소의 `<`, 줄 구분자는 escape해 `</script>` 삽입을 차단한다. Place는 정보 표현이며 검색 노출/리치 결과를 보장하지 않는다.

## 검증 및 미실행 항목

- 로컬 단위 검사: 기존 포함 31개. ID 범위/최대 개수/XML escape, 주소 fallback, 지역 계층, 악성 JSON-LD, robots 분기.
- Node production 모의 API: 빌드 API 호출 0, 원본 ID 캐시 재사용, sparse 구간/경계, 실제 XML/HTML, 없는 구간 404, 비정상 응답/장애 503, 구조화 데이터 및 기존 cache invalidation 회귀.
- API MockMvc: 익명 공개 ID 응답 및 입력 오류. 별도 MySQL CI: 경계/삭제/빈 구간/1만 건과 PK range 실행계획.
- 운영 MySQL 실행계획, 실제 전체 건수와 sitemap URL 대조, 원격 Workers rewrite/cache, 외부 Schema validator/Search Console 제출은 배포 전후 별도 검증 대상이다.
- 모바일/지도/OAuth 코드는 이번 단계에서 변경하지 않았다. 전체 전환 완료 검증을 대체하지 않는다.

## 근거

- [Sitemap protocol](https://www.sitemaps.org/protocol.html)
- [Schema.org Place](https://schema.org/Place)
- [Next JSON-LD](https://nextjs.org/docs/app/guides/json-ld)
- 설치된 Next 16.3.4의 robots/sitemap/route-handlers/connection 문서 확인.
