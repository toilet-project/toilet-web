# 상세 URL·서버 렌더링 단계 검증

2026-09-05 · WBS toilet-web #186 · **개발 단계, 운영 미배포**

## 변경 범위

- Web: `feature/nextjs-toilet-seo`. shared map layout 안에서 `/toilet/[id]` 선택 상태를 전달한다. 지도 컴포넌트에 URL별 key를 주지 않는다.
- API: main `52fb277` 기반 `feature/toilet-seo-projection`. 기존 상세 응답 끝에 nullable `region`을 추가한다. 기존 필드/지도 목록/좌표 변경 로직은 유지한다.
- 기존 작업 폴더의 미커밋 변경은 건드리지 않았다. DB migration, 데이터 업데이트, main 병합, DNS/운영 배포는 하지 않았다.

## 데이터·지도 동작

- 상세 server fetch를 React cache로 page/metadata 간 공유하고 `revalidate: 3600`, `toilet:{id}` 태그를 지정했다. 개인 쿠키와 Authorization은 전달하지 않는다.
- 서버 HTML은 화장실명·주소·운영정보·시설·검증된 지역정보를 기존 카드 컴포넌트로 출력한다. 브라우저 지도 준비 후 같은 데이터를 카드에 인계한다. 지도 선택에서 별도 browser 상세 API 호출은 제거했다.
- 직접 접속만 유효 좌표를 초기 지도 중심으로 사용하며 자동 현재위치 이동을 하지 않는다. 앱 내부 URL 변경은 지도 중심/확대/영역 조회를 변경하지 않는다. 기존 모바일 목록 선택의 명시적 이동은 유지한다.
- 좌표가 없으면 임의 핀을 만들지 않는다. 주소는 도로명 우선, 없으면 지번 하나를 표시한다.
- 잘못된 ID/미존재는 404, 원본 API 장애는 500이다. 장애를 정상적인 미존재로 캐싱하지 않는다.

## 지역 projection

기존 `current_toilet_region` view만 조회한다. 이 view는 VERIFIED 상태와 현재 원본/평가 좌표, 두 주소가 모두 일치하는 행만 통과시킨다. 불일치·오래된 지역정보는 `region: null`이며 원본 주소로 지역명을 만들어 채우지 않는다.

`sidoName/sidoCode/sigunguName/sigunguCode/cityName/districtName`을 제공한다. 천안시 서북구처럼 sigunguName에 포함된 이름을 city/district로 중복 출력하지 않으며 세종의 빈 하위 계층도 허용한다. 기존 PK/view를 사용하고 새 컬럼/인덱스는 추가하지 않았다.

## 실행한 검사

| 검사 | 환경 / 결과 |
| --- | --- |
| API 서비스·컨트롤러 | Gradle 선택 테스트 14건 통과. 지역 optional 조회 및 JSON 필드 계약 포함 |
| 웹 단위·구조 검사 | `pnpm test`: 19건 통과 |
| 타입·린트 | `pnpm typecheck`, `pnpm lint`: 통과, 린트 경고 없음 |
| Next production | 별도 `.next-smoke` 빌드 성공. build 중 상세 API 호출 0건 |
| HTML·metadata | `pnpm test:detail-production`: 모의 지역/주소/시설/h1/canonical/noindex 확인 |
| 캐시 중복 호출 | 첫 요청 + HIT 3회에 모의 원본 API 호출 총 1회 |
| 예외 | 잘못된 ID/0/선행0/미존재 총 4건 HTTP 404, 원본 503 → 페이지 500 |
| 좌표 없음 | 지번 fallback HTML 200, 좌표 판별 단위 검사에서 가짜 좌표 생성 없음 |
| 실제 개발 브라우저 | `/toilet/1` → 목록의 사직동 주민센터 `/toilet/170` → 뒤로 1 → 앞으로 170 → 닫기 `/`. 제목/카드/마커 일치. 선택 전후 타일 URL·배치·레벨 동일 |
| 동일 위치 그룹 | 충남대학교 검색 → 자연과학대학 외 63개 그룹 → 공동실험실습관 `/toilet/13090`. 그룹 유지, 인라인 상세 및 선택 핀 확인 |
| Linux CI | Web `6b53513` [Workers validation](https://github.com/toilet-project/toilet-web/actions/runs/33955131750): 단위/production smoke/OpenNext 빌드/업로드 없는 Worker 패키지 검증 모두 성공 |

추가 보완: 그룹 상세 히스토리 복원 시 해당 행으로 스크롤한다. 개발 HMR/Strict Mode 해제 시 SDK 소유 DOM·대기 생성·이전 응답을 정리해 지도 로고/타일 중첩을 방지한다.

## 아직 확인하지 않은 항목 / 배포 제한

- 지역 projection은 서비스 mock과 응답 계약 검증이며 운영 MySQL 실제 쿼리/실행 계획 검증은 별도 필요하다. 기존 운영 API에는 region이 아직 배포되지 않아 개발 서버의 실제 운영 응답에서 지역명이 비어 있는 것이 정상이다.
- production smoke는 Node runtime + 모의 API 검증이다. Workers/OpenNext 원격 캐시, 리소스 장애, 재배포 캐시 보존은 검증 전이다.
- 시간 기반 1시간 갱신만 있으며 수정 즉시 무효화하는 인증된 webhook/서버 연동은 다음 단계다. 이 상태로 전체 전환 완료 또는 배포 준비 완료라고 판단하지 않는다.
- 분할 sitemap, robots route, 상세 structured data, 전체 모바일/OAuth/정보 제보/정책 회귀, 빠른 연속 탐색 및 오류 후 재시도 회귀가 남았다.
- 운영 사이트와 로그인 설정, 기존 Pages 배포는 변경하지 않았다.

## 재현

1. `pnpm test`, `pnpm typecheck`, `pnpm lint`
2. `pnpm test:detail-production` — 로컬 임의 포트의 모의 API와 Node 서버를 띄우고 종료 시 모두 닫는다. 운영 API/DB를 사용하지 않는다.
3. 개발 미리보기의 `/toilet/1` 및 `/toilet/170`에서 선택/히스토리를 확인한다. 개발 OAuth 완료를 의미하지 않는다.
