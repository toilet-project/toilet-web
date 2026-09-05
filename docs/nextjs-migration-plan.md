# Next.js 전환 사전 분석·실행 계획

2026-09-05 · Workers 선택 승인. 단계 2: 상세 URL·서버 렌더링 구현 및 검증. 운영 배포 전.

상세 결과: [상세 URL 단계 검증](nextjs-detail-stage-verification.md). WBS: [toilet-web #186](https://github.com/toilet-project/toilet-web/issues/186).

## 범위와 기준

- 기준 웹 main: `2d5ba46`. 별도 `feature/nextjs-toilet-seo` worktree에서 작업한다.
- 기존 웹 작업 폴더에 미커밋 변경이 있으므로 덮어쓰거나 초기화하지 않는다.
- Next.js App Router, 기존 TypeScript·React·CSS·Kakao SDK·React 상태 관리를 유지한다.
- `/toilet/[id]`는 기존 지도 선택 상태의 URL이다. 독립된 새 디자인의 상세 화면을 만들지 않는다.
- `/region/...`, 지역 목록 UI, DB 정규화 재설계, 지도/상태 라이브러리 교체는 제외한다.
- 운영 전환·DNS 변경·유료 자원 생성은 이번 분석으로 승인된 것으로 간주하지 않는다.

## 현재 구현 분석

| 영역 | 확인 내용·주요 파일 |
| --- | --- |
| 버전 | lockfile: React/React DOM 19.2.8, Vite 8.2.2, TypeScript 6.0.3, oxlint 1.79.0 |
| 라우팅 | React Router 없음. `App.tsx`가 window.location.pathname으로 `/policies/terms`, `/policies/privacy`, `/policies/location` 분기. 그 외 MapApp |
| 엔트리 | main.tsx의 createRoot·StrictMode·ErrorBoundary, index.html의 정적 SEO |
| 지도 SDK | lib/kakaoMap.ts, Kakao JS SDK autoload=false, services만 로딩. module Promise로 SDK 중복 로드 방지 |
| 지도 인스턴스 | MapApp 초기화 effect, mapRef 저장, ResizeObserver relayout. cleanup에서 overlay·위치 watch·타이머 정리 |
| 상태 | useState/useRef/useCallback. selectedToilet/selectedCoordinateGroup/expandedCoordinateToilet와 상세 응답 별도 관리 |
| 기본 위치 | 대전시청, createKakaoMap 기본 level 6. 초기 위치 권한 요청 성공 시 현재 위치로 이동 |
| 기준점 | 데스크탑 mapCenter는 거리 기준점. 단순 지도 드래그 때 따라 움직이지 않으며 검색·지도 클릭·현재위치로 변경 |
| 지도 이동 | idle에서 180ms debounce로 bounds 목록 조회. drag/zoom 표식으로 데스크탑 카드 닫음. 카드 위치는 projection으로 보정 |
| 목록 API | GET /api/v1/toilets, southLat/northLat/westLng/eastLng/zoom/includeList. sequence로 늦은 응답 무시 |
| 목록 정책 | 데스크탑 상시 왼쪽 목록, 모바일 버튼 목록. level 7 이상 목록 대신 확대 안내, 전체 수·클러스터 유지 |
| API 클러스터 | 백엔드 zoom 10 이상, includeList=false이면 좌표 격자 집계 |
| 화면 클러스터 | 동일 좌표를 먼저 그룹화, 84px 화면 격자 결합. CustomOverlay 사용; 별도 Kakao Clusterer SDK 없음 |
| 마커 | 목록 결과마다 기존 overlays setMap(null) 후 새 overlay 생성. 선택 시 class로 강조. URL 변경만으로 renderResult를 호출하면 안 됨 |
| 클릭 | 일반 마커 selectToilet → 상세 fetch. 군집 클릭은 확대/이동 또는 동일좌표 목록. 마커의 지도 click 전파 억제 |
| 목록 선택 | 단일 시설 상세, 동일좌표는 그룹 카드. 모바일만 panTo, 데스크탑은 현재 지도 유지 |
| 동일좌표 상세 | 같은 이름 그룹 후 층수 내림차순. 펼친 항목 scrollIntoView 대신 목록 내부 scrollTo 유지 |
| 상세 API | GET /api/v1/toilets/{id}. 일반 선택·그룹 펼치기 각각 브라우저 fetch. sequence로 상세 응답 역전 방지 |
| 상세 좌표 | 백엔드 DTO에는 nullable BigDecimal latitude/longitude 존재. 웹 상세 타입에서만 누락. 새 좌표 API 불필요 |
| 지역 데이터 | toilet_region과 판정 이력 존재. 공개 상세 DTO에는 지역 없음. current_toilet_region의 신선한 VERIFIED만 공개해야 함 |
| 검색 | Kakao Places, 2자 이상 300ms debounce, sequence 보호, 키보드 선택. 검색 시 기준점·지도·검색 마커 이동 |
| 필터 | 공개 지도에서 별도 시설 필터 UI는 확인되지 않음. 줌/영역 제한·검색·내 제보 등의 기존 필터만 유지하고 새 시설 필터는 만들지 않음 |
| 현재 위치 | Permissions 조회, getCurrentPosition, 성공 후 watchPosition. watch는 현재 위치 마커만 갱신하며 지도 강제 이동 안 함 |
| 인증 | Spring API 쿠키 기반 credentials=include, me 실패 시 refresh, OAuth는 외부 full navigation |
| 저장소 | sessionStorage의 pending-report-target/pending-my-reports로 로그인 후 작업 복원. 확인한 src에는 localStorage 사용 없음 |
| 브라우저 전용 | App의 pathname 렌더 접근·matchMedia 초기값, 이벤트/효과 내 DOM·navigator·storage, 지도 모듈의 함수 내 window 접근 |
| 보존할 부가기능 | Google/Kakao 로그인, 동의, 내 제보, 알림, 계정 탈퇴, 주소 복사, 위치 제보/확인 지도, 오류·마지막 갱신 안내 |
| 환경변수 | VITE_API_BASE_URL, VITE_KAKAO_JAVASCRIPT_KEY. 신규 NEXT_PUBLIC 변수로 명시 전환, 서버 secret과 분리 |
| 개발 proxy | Vite /api proxy → 공개 API. Next에서는 명시 rewrites 또는 공개 origin 사용; 인증 cookie/CORS 별도 테스트 |
| SEO | index.html 공통 title/description/canonical/OG/Twitter/WebSite·WebApplication JSON-LD. sitemap은 홈 1개 |
| 배포 | Cloudflare Pages 정적 웹, GitHub CodeQL. public/_headers 보안 헤더와 인증용 정적 파일 유지 필요 |

### 정규화 데이터 사용 규칙

지역 master를 새로 만들지 않는다. 기존 sido_name/code, sigungu_name/code, city_name/district_name을 사용한다.
시→구 구조와 세종의 빈 하위 단계는 보존하고 부모 코드/없는 지역명을 추측하지 않는다.
`current_toilet_region`의 원본 주소·좌표·평가좌표 일치 조건을 사용한다. 오래된 VERIFIED 원본 테이블 행을 그대로 JOIN하지 않는다.
지역 판정이 없는 상세는 지역 문구를 생략하고 실제 주소·시설 정보를 표시한다. 주소를 공백 분할해 지역을 만들지 않는다.

## 핵심 설계안

1. App Router 공통 map layout에 **한 번만 마운트되는 기존 MapApp**을 배치한다. route id를 map component key 또는 SDK 초기화 effect 의존성으로 넣지 않는다.
2. URL 선택 bridge와 실제 지도/카드 상태를 분리한다. 마커/단일 목록/그룹 내 특정 상세 선택은 router.push(..., {scroll:false})로 표현한다.
3. 그룹 열기 자체는 특정 시설 선택이 아니므로 임의 대표 시설 URL로 변경하지 않는다. 그룹 내 상세를 펼쳤을 때만 해당 id를 선택한다.
4. 경로 변경·뒤로가기·앞으로가기 수신 시 최신 id의 카드/마커를 복원한다. 그 과정에서 다시 push하는 루프가 없어야 한다. 닫기는 `/`로 해제한다.
5. 사용자 클릭은 즉시 기존 카드를 유지하되 route 응답이 늦게 도착해 현재 선택을 덮어쓰지 않도록 id/sequence 검증을 유지한다.
6. 직접 접근은 서버 상세를 초기 데이터로 전달한다. 최초 지도 생성은 해당 좌표/적정 level 기준으로 한 번 실행하며 자동 현재위치 이동이 덮어쓰지 않게 한다.
7. SPA 내 시설 전환과 history 이동은 지도 중심·zoom을 유지한다. 직접 접근/새로고침만 시설 중심으로 초기화한다.
8. 현재 bounds 밖의 URL 선택은 기존 마커 목록과 별도의 선택 overlay로 표현할 수 있다. URL 때문에 전체 목록을 재조회하지 않는다.
9. 상세 UI의 기존 표시 컴포넌트를 재사용하여 서버 HTML에 이름·한 개의 주소·시설·지역이 표시되게 한다. 봇 전용/숨김 SEO 복제 문단을 만들지 않는다.
10. 서버 상세 route와 지도 interaction 경계를 분리하되 공유 layout의 map element는 유지한다. 정책 페이지는 별도 Server route로 이동한다.

지도 route를 매번 새 page 컴포넌트로 생성하거나 앱 전체에 use client를 붙이는 방식은 금지한다.
SSR 단계에서 브라우저 전용 module을 실행하지 않도록 함수/효과 경계와 lazy loading을 검토한다.
지도만 client-only로 분리해도 카드·metadata는 서버 응답에 존재해야 한다.

## 최소 백엔드 확장

- 기존 상세 DTO에 nullable `region`을 추가한다. 기존 모든 응답 필드는 유지한다.
- region은 최신 view 기반 시도/시군구/시/구 이름·코드만 노출한다. 판정 원문 JSON·제보·사용자 데이터는 공개하지 않는다.
- sitemap용 공개 ID 조회는 한정된 projection·페이지/커서와 크기 상한을 둔다. 목록 bounds를 전국으로 넓혀 모든 상세를 받는 방식 금지.
- sitemap lastmod는 검증 가능한 수정 시각이 있을 때만 출력한다. 날짜를 매번 현재 시각으로 꾸미지 않는다.
- 이번 범위에서 DB에 새 region 테이블이나 불필요한 index를 만들지 않는다.

## SSR·캐시·SEO

- 공식 registry의 next@latest는 확인 시 16.3.4. canary/preview를 사용하지 않는다. 설치 시 정확한 stable 버전과 peer 요구사항을 다시 확인한다.
- 서버 전용 public detail loader를 page/metadata에서 공유한다. 인증 cookie나 authorization을 공용 캐시에 전달하지 않는다.
- `toilet:{id}` 캐시 단위와 향후 지역 목록 단위를 분리한다. 최초 요청 생성 후 재사용, 전체 53,582건 build-time 생성 금지.
- 24시간은 검토 기준이지만 위치 승인 빈도를 고려해 1시간 fallback을 우선 검증한다. 캐시 무효화가 연결되지 않은 상태를 즉시 최신화 완료라고 보고하지 않는다.
- 인증된 on-demand invalidation endpoint를 준비하고 commit 이후에만 호출하도록 한다. 관리자 좌표 승인 직후와 정규화 완료 이후는 별개 이벤트다.
- webhook은 실패해도 DB 승인 자체를 롤백하지 않으며 재시도/관측·TTL fallback을 설계한다. 단순 endpoint 구현과 백엔드 실제 연동 완료를 구분한다.
- 서버 상세가 Client 카드에 전달될 때 기존 상세 fetch를 건너뛰는 경로를 우선 구현한다. 그룹 상세도 동일 loader를 활용한다. 남는 중복 호출은 측정·보고한다.
- 404만 notFound로 처리한다. upstream 장애/timeout을 없는 시설로 바꾸지 않는다. 음수·NaN·안전 정수 범위 초과 id 검증 필요.
- name·검증된 지역 기반 metadata, canonical은 쿼리 없이 정규 URL. JSON-LD는 실제 Schema.org Place/GeoCoordinates에 해당하는 데이터만 사용한다.
- 임의 시설 접근성 확정·영업시간 구조화 파싱을 하지 않는다. `<` 등 JSON-LD script escape를 검증한다.
- sitemap 1파일당 50,000 URL·비압축 50MB 제한 고려. 현재 규모는 분할이 필요하며 shard당 10,000건과 index를 우선 검토한다.
- 좌표 없는 시설은 지도 임의 좌표/핀을 생성하지 않는다. 상세정보·안내는 제공 가능하며 index 정책은 데이터 충실도로 검토한다.
- robots에서 /toilet/* 허용, 내부 route noindex/차단 구분. robots는 인증 수단이 아님. 존재하지 않는 /region URL을 넣지 않는다.

## 배포 환경 결정 — 구현 전 확인

2026-09-05 사용자 결정: **Cloudflare Workers**. 정식 Next.js 16.3.4 + OpenNext 1.20.6 + Wrangler 4.129.0으로 고정한다.
유료 기본요금 $5 및 사용량 초과 과금 구조를 안내했다. 월 1,000만 요청 $8.40은 평균 CPU 20ms 가정의 실행요금 예시이며 총요금 보장이 아니다.
R2 캐시와 Durable Objects 갱신 큐를 준비하며 on-demand 태그 저장소 연결은 상세 캐시 단계에서 추가한다.
기존 API·MySQL·배치는 미니 PC에 유지한다. 운영 Pages·DNS는 회귀 검증 전 변경하지 않는다.
preview 전용 이름과 noindex를 기본값으로 두고, CPU 1,000ms/요청 보호 한도(월 지출 상한 아님)를 설정했다.
계정 요금제 변경·원격 자원 생성은 아직 실행하지 않았다.

현재 Pages의 Vite 정적 dist 업로드 방식으로는 Next.js SSR/ISR을 그대로 운영할 수 없다.

| 선택 | 변경·검증 필요 사항 |
| --- | --- |
| 기존 미니 PC Node/Docker | 정식 Next Node runtime, 캐시 볼륨·CPU/RAM 제한·health·rollback·Nginx/CDN 설정. 부하와 단일 장비 장애 범위 확인 |
| Cloudflare Workers | Pages에서 runtime 변경, adapter·Next stable 호환성 및 ISR 캐시 저장소/무효화 검증. 계정 한도·과금 승인 선행 |

공식 Cloudflare 문서는 Workers runtime을 안내한다. vinext로 Next 런타임을 대체하는 선택은 사용자 요청의 범위를 벗어날 수 있어 자동 채택하지 않는다.
Workers를 선택하면 정식 Next build를 사용하는 지원 adapter 호환성을 별도 검증한다.
Node 배포를 선택하면 `.next/cache` 영속화와 단일/다중 인스턴스 캐시 정책을 구분한다.
운영 origin/DNS를 바꾸기 전에 preview에서 OAuth callback·쿠키·지도 도메인 허용과 캐시를 검증한다.

## 단계별 실행 및 종료 조건

1. 분석·기존 동작 회귀 목록 확정, 배포 runtime 선택.
2. 별도 API feature: 지역 projection·sitemap ID 조회 및 호환/신선도 테스트.
3. 웹 Next 기본환경: root layout, policy route, public assets/보안 헤더, 환경변수, 기존 MapApp 이식.
4. 지도만 먼저 production smoke: 기존 화면/SDK/목록·권한·인증 동작 비교.
5. persistent layout·URL bridge·상세 SSR, direct load와 history 회귀.
6. metadata·캐시·무효화·분할 sitemap·robots·구조화 데이터.
7. production build/typecheck/oxlint, mock backend 카운터로 cold/HIT/revalidation 증명.
8. 승인된 preview에 실제 Kakao·API로 읽기 전용 회귀, 서버 raw HTML·404·cache 검증.
9. 코드 검토·배포 승인 후 API → 웹 순차 배포 및 기존 Pages rollback 경로 유지.
10. 요청된 31개 항목의 최종 보고서와 실제/모의/미실행 검증 구분.

## 이미 실행한 검증

- 기존 주소 단위 테스트 10/10 통과(Node production runtime과는 별개).
- git 원본 상태 확인, 기존 dirty worktree 보존, 최신 main 별도 worktree 생성.
- Next 공식 registry latest 16.3.4 및 배포·ISR·sitemap 공식 문서 확인.
- Next 설치 및 production build 통과(홈 + 정책 3페이지 + 404). TypeScript 통과.
- oxlint는 Next의 공식 route exports를 인식하도록 파일 범위를 한정해 설정했으며 경고·오류 0건.
- Windows OpenNext 변환은 pnpm 의존성 심볼릭 링크 생성 EPERM에서 실패. 보안 정책/개발자 모드를 변경하지 않고 Linux CI 빌드·dry-run으로 검증한다.
- Linux CI [33952767703](https://github.com/toilet-project/toilet-web/actions/runs/33952767703) 성공. 15개 테스트·lint 0건·typecheck·Workers build·Wrangler dry-run 전부 통과. d4ac8e7 bundle gzip 876.71 KiB. 원격 자원 생성/업로드 없음.
- 로컬 production HTTP 검증: 홈·정책 3페이지·마커 이미지 200, 없는 정책/URL 404, preview noindex·보안 헤더 확인.
- 현재 빌드는 임시 Kakao 키를 사용한 컴파일 검증이다. 실제 Kakao 지도·OAuth 회귀, 상세 URL/지역 SSR/캐시 검증은 아직 미실행이다.

## 근거

- [Next self-hosting](https://nextjs.org/docs/app/guides/self-hosting)
- [Next ISR](https://nextjs.org/docs/app/guides/incremental-static-regeneration)
- [revalidateTag](https://nextjs.org/docs/app/api-reference/functions/revalidateTag)
- [generateSitemaps](https://nextjs.org/docs/app/api-reference/functions/generate-sitemaps)
- [Cloudflare Pages Next 안내](https://developers.cloudflare.com/pages/framework-guides/nextjs/)
- [Cloudflare OpenNext](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/)
- [Cloudflare Workers 가격·한도](https://developers.cloudflare.com/workers/platform/pricing/)
- [Sitemap protocol](https://www.sitemaps.org/protocol.html)
- [Schema.org Place](https://schema.org/Place)
