# Workers 미리보기 준비 상태

2026-09-05 · WBS #186 · 운영 전환 전.

## 완료

- 사용자가 Cloudflare 배포 도구 OAuth 권한 연결을 승인했고 로그인이 확인됐다. token 값은 문서·GitHub에 저장하지 않았다.
- 사용자가 R2의 월 기본 $0, 무료 한도 초과 사용료·자동 갱신 조건을 확인하고 구독 활성화를 승인했다. 대시보드의 구독 활성화 성공을 확인했다.
- 미리보기 전용 R2 bucket `geupddong-next-preview-cache` 생성: Standard, APAC location hint.
- 미리보기 전용 D1 `geupddong-next-preview-tags` 생성: APAC. UUID를 wrangler 설정에 반영했다. UUID는 접속 비밀키가 아니다.
- R2는 공개 상세 cache, D1은 cache tag 시각 용도다. 아래 미리보기 배포에서 cache populate와 tag schema 초기화를 완료했다. 업무 DB 복사·운영 DB 변경은 하지 않았다.
- 미리보기 `SITE_INDEXABLE=false`를 runtime vars에도 명시했다. build 환경에서도 false로 유지해야 한다.

## 아직 미실행 / 승인 경계

- 현재 계정 Workers 플랜은 **Free**. `cpu_ms=1000`은 사용량 측정값이 아닌 과거 설정 상한이었으며 제거했다. 무료 기본 설정으로 배포했다. 이 설정값만으로 유료 필수라고 안내했던 내용은 아래처럼 정정한다.
- R2 구독 승인은 Workers의 별도 월 기본요금 구독 승인으로 간주하지 않는다. 유료 변경/결제는 아직 실행하지 않았다.
- Worker·DO binding·R2 populate·D1 tag schema 및 원격 배포는 완료했다. 서명 secret 등록과 실제 무효화 성공 검증은 아직 미실행이다.
- 운영 Pages·DNS·미니 PC·MySQL·API는 그대로다. 생성한 두 자원은 preview 전용이며 운영 자원과 공유하지 않는다.
- 운영 API는 아직 feature 지역 projection/sitemap ID endpoint가 미배포 상태다. 현 상태의 운영 API에 연결해 전체 SEO 통과라고 보고하면 안 된다.
- API CORS와 OAuth 복귀 주소는 운영 origin 기준이다. 미리보기 주소 전체 허용·wildcard credential CORS로 임의 완화하지 않는다. 실제 인증 회귀는 별도 승인된 테스트 구성 또는 운영 전환 계획이 필요하다.
- Windows의 OpenNext build symlink 제약을 피하도록 Linux CI 빌드 산출물을 전달했다. CI는 검증/dry-run/3일 보관 artifact 생성만 수행하며 Cloudflare 인증정보가 없다. 로컬에서 승인된 OAuth 세션으로 OpenNext deploy를 실행했다.

## 무료 플랜 우선 검증으로 정정

사용자는 유료 전환 전에 실제 필요성과 비용을 안내받기로 했다. Free를 유지한다.
앞의 1000ms는 측정된 CPU 사용량이 아니라 임의로 설정한 허용 상한이었다. 이것만으로 유료 필수라고 판단할 수 없다.
설정의 유료용 cpu_ms override를 제거하고 계정 Free 기본 제한을 따른다. 무료 요청 수/CPU 제한에 걸리면 오류를 보고하며 자동 업그레이드하지 않는다.
R2의 별도 무료 한도 초과 과금은 이미 승인된 구독 조건이며 Workers Free와 구분한다.
Linux 검증 CI에 3일 보관 build artifact를 추가했다. 배포는 로컬에서 별도 수행하며 Cloudflare OAuth를 GitHub에 보내지 않는다.

## 2026-09-05 무료 Workers 실제 배포 결과

- 주소: https://geupddong-web-preview.dlgksqls7218.workers.dev
- 배포 소스: `8910276ba02585238ab7432c09cc88dd4f89b3b9` (`feature/nextjs-toilet-seo`).
- CI: https://github.com/toilet-project/toilet-web/actions/runs/33961836969 — 성공. 31개 테스트, lint/typecheck, Node production smoke 2모드, Workers build/dry-run 및 artifact 생성.
- Worker version: `efc29982-bf56-45d7-bc26-50a3c6b5bd41`.
- 공식 OpenNext deploy로 R2 cache 7개 초기화, D1 `revalidations` 테이블 생성, DO queue binding 연결, 정적 asset 26개 업로드.
- 최초 준비 CI는 제거한 CPU 상한값을 계속 요구하던 테스트 1건 때문에 실패했다. 현재 테스트는 무료 계정 기본값을 사용하고 운영 route를 갖지 않는지 확인한다.

공개 읽기 전용 검사: `node scripts/verify-workers-preview.mjs <preview origin>`.

| 요청 | 결과 | 관찰한 캐시 | 응답 소요 시간 |
| --- | --- | --- | --- |
| `/` | 200 | HIT | 1,158ms |
| `/robots.txt` | 200, 전체 검색 차단 | HIT | 256ms |
| `/toilet/13448` 첫 요청 | 200, 서버 Place JSON-LD·운영 canonical | MISS | 934ms |
| 동일 상세 재요청 | 200 | HIT | 257ms |
| `/toilet/0` | 404 | MISS | 316ms |
| `/toilet/not-a-number` | 404 | MISS | 328ms |

위 시간은 네트워크 대기를 포함한 단일 표본의 응답 시간이며 **CPU 사용량이 아니다**. 짧은 표본이 통과했다고 모든 부하에서 무료 제한 내 동작한다고 보장하지 않는다. HTML의 `X-Robots-Tag: noindex, nofollow`도 확인했다.

추가 확인:

- 미설정 서명 endpoint에 무서명 요청: `503`, `no-store`. secret이 없을 때 공개 캐시 갱신 요청을 받아들이지 않는다.
- `/sitemap.xml`: `503`, `no-store`. 운영 API에 sitemap projection endpoint가 아직 배포되지 않아 실제 통합은 미완료다. 빈 정상 sitemap으로 숨기지 않았다.
- D1 schema 읽기 확인: `revalidations` 존재, 검사 쿼리 rows_written=0.
- 지도 JavaScript key는 **build-validation-placeholder**인 검증 빌드다. 미리보기 지도 표시·브라우저 목록·OAuth 로그인은 아직 완료로 보지 않는다.
- Workers Paid 미가입 유지. 기존 Pages·DNS·API·MySQL 변경 없음. R2는 앞서 승인한 별도 구독 조건 유지.

## 남은 순서

1. 미리보기 전용 서명 secret과 실제 cache invalidation 통합 검증.
2. API projection/sitemap 배포 검토와 검증, Kakao 허용 도메인·공개 JavaScript key·API CORS·OAuth 복귀 경로 확인.
3. 모바일·데스크탑 지도/로그인/제보 전체 회귀, 반복·부하 및 CPU 사용량 확인.
4. 운영 배포 전 코드 검토·승인과 rollback 계획 확인. 유료 전환이 필요하면 이유와 비용을 먼저 설명하고 확인받는다.

생성한 cache 자원은 삭제 가능하지만 사용을 시작한 후 삭제하면 cache 정보가 사라진다. 자동 삭제/운영 DB 정리는 하지 않는다.
