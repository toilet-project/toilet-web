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
- Worker·DO binding·R2 populate·D1 tag schema 및 원격 배포는 완료했다. 아래 임시 키 검증에서 실제 서명 무효화도 통과했다. 상시 운영용 secret 및 Spring outbox 연결은 아직 미완료다.
- 운영 Pages·루트 도메인·MySQL 데이터/스키마는 유지했다. 후속 승인에 따라 preview 전용 DNS/custom domain을 연결하고 API의 정확한 CORS·OAuth 복귀 지원만 별도 배포했다. R2/D1 자원은 preview 전용이다.
- 운영 API는 아직 feature 지역 projection/sitemap ID endpoint가 미배포 상태다. 현 상태의 운영 API에 연결해 전체 SEO 통과라고 보고하면 안 된다.
- API CORS와 OAuth 복귀에 승인된 `https://preview.geupddong.com`만 추가했다. workers.dev 전체나 wildcard credential CORS는 허용하지 않는다. 기존 쿠키 보안 설정은 유지했다.
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

1. 아래 임시 키 검증은 완료. 상시 운영용 secret의 안전한 보관/등록과 Spring outbox 연결 검증은 별도로 남아 있다.
2. API projection/sitemap 배포 검토와 검증. Kakao 허용 도메인·공개 JavaScript key·API CORS·OAuth 복귀는 아래 후속 단계에서 완료했다.
3. 모바일·데스크탑 지도/로그인/제보 전체 회귀, 반복·부하 및 CPU 사용량 확인.
4. 운영 배포 전 코드 검토·승인과 rollback 계획 확인. 유료 전환이 필요하면 이유와 비용을 먼저 설명하고 확인받는다.

생성한 cache 자원은 삭제 가능하지만 사용을 시작한 후 삭제하면 cache 정보가 사라진다. 자동 삭제/운영 DB 정리는 하지 않는다.

## 2026-09-05 후속 — 서명 갱신 검증 완료 / 로그인 연결 분석

실행: `node scripts/verify-workers-invalidation.mjs --approved-preview-test`.
미리보기 Worker/DB를 고정 검증하고, 기존 secret이 있으면 덮어쓰지 않고 중단한다.
메모리에서 생성한 임시 32바이트 난수 키를 미리보기 secret에만 등록하고 `finally`에서 제거했다. 키 값은 로그/파일/GitHub에 남기지 않았다.

| 검사 | 실제 결과 |
| --- | --- |
| 무서명 / 위조 서명 / 10분 만료 서명 | 각각 401 |
| 서명은 유효하나 ID가 경로 문자열인 요청 | 400 |
| 거절 요청 전후 D1 tag 대조 | 변경 없음 |
| 정상 서명 | 200, acceptedIds=[13448] |
| 성공 응답 후 D1 기록 | build ID/toilet:13448 만료 시각 저장 확인 |
| 갱신 전 → 갱신 직후 → 재요청 | HIT → MISS → HIT, 모두 200 |
| 한 요청 안에 동일 ID 두 번 | 200, acceptedIds에 한 번만 반환 |
| 임시 키 정리 | secret 목록에서 제거 확인 |

첫 검사에서는 기존 시간 만료 캐시의 백그라운드 갱신을 기다리지 않아 STALE에서 중단됐다. 최대 16초의 제한된 준비 대기를 추가했다. 두 번째는 D1 키의 build ID prefix를 빠뜨린 검사 쿼리 때문에 중단됐으며, 실제 배포 BUILD_ID를 읽어 정확한 tag를 조회하도록 수정한 뒤 전체 통과했다. 제품 로직 결함을 숨기기 위해 assertion을 없애지는 않았다.

이번 검사는 Workers 캐시 계층의 실제 HTTP/D1 검증이다. Spring outbox부터의 전체 전달, 원본 수정 후 변경 콘텐츠 대조, 다중 지역/동시성/부하·CPU 한도 검증은 아니다. 운영 화장실 데이터는 변경하지 않았다. secret 추가/제거가 Worker 설정 버전을 갱신했지만 앱 코드는 같은 배포 산출물이다.

### 브라우저 연결 전에 필요한 결정

- `workers.dev` origin으로 운영 상세 API에 OPTIONS 요청: **403**, 허용 origin 헤더 없음.
- API `CorsConfig`는 운영/www/admin/localhost:5173만 허용한다.
- API 로그인 쿠키는 HttpOnly·Secure·SameSite=Lax이고, 로그인 복귀는 운영 홈 또는 admin으로 한정되어 있다.
- 따라서 CORS 한 줄만 열어서는 workers.dev 로그인 회귀를 정상화할 수 없다. [SameSite 동작](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)상 cross-site fetch는 Lax 쿠키를 보내지 않는다.
- 권장안(아직 적용하지 않음): `preview.geupddong.com`을 [Worker Custom Domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)으로 연결하고, API는 이 정확한 origin과 검증된 preview 복귀 대상만 허용한다. 기존 쿠키 정책과 운영 홈은 유지한다. Kakao JavaScript 허용 도메인 및 실제 공개 키 빌드도 필요하다.
- 개발 화면이 운영 API를 사용하면 로그인/제보 등의 동작은 운영 데이터에 영향을 줄 수 있다. 관리자 권한을 완화하거나 자동으로 테스트 제보를 만들지 않는다.
- 신규 도메인 연결 및 운영 API 설정·배포는 사용자 확인 후 진행한다. Workers Paid 전환은 하지 않는다.

## 최신 상태 — preview 도메인·지도·로그인 연결 완료

사용자 승인 후 2026-09-05 실행.

- 실제 개발 주소: https://preview.geupddong.com (기존 운영 https://geupddong.com 유지).
- Cloudflare UI에서 기존 root가 아닌 `preview` subdomain만 Worker에 연결. 배포 설정에도 동일 custom domain을 기록했다.
- Kakao JavaScript 허용 도메인에 preview만 추가, 기존 5개 도메인 보존. provider OAuth callback은 기존 API 주소 유지.
- 기존 활성 JavaScript 공개 키를 웹 GitHub Secret `NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY`에 등록, Linux preview build에 사용. REST API/Client Secret/관리자 키를 프론트에 넣지 않았다.
- Web 배포 커밋 `0224910afc9d979ba1091d4895b57870a8d07341`, Worker version `54d987c2-371b-4d24-923f-23121c657f49`.
- Web [CI 33963451287](https://github.com/toilet-project/toilet-web/actions/runs/33963451287) 성공. 단위 32개, lint 경고 없음, typecheck, 서버 smoke 및 Workers build/dry-run.
- API는 기존 main에서 별도 `feature/preview-oauth-origin`으로 분리, [PR #80](https://github.com/toilet-project/toilet-api/pull/80) 검토·병합. 소스 `f4df6e7`, main 배포 `4d755bea09bd57630b49f16132ac295779044542`.
- API [CI/CD 33963664338](https://github.com/toilet-project/toilet-api/actions/runs/33963664338) 성공. 관련 24개 테스트와 CodeQL 통과. develop도 동일 main으로 fast-forward 동기화.
- 미배포 SEO projection/sitemap/cache-outbox 기능과 DDL은 이번 API 배포에서 제외했다. 프론트 main/Pages를 Next.js로 전환하지 않았다.

실제 배포 후 확인:

| 검증 | 결과 |
| --- | --- |
| preview/root/robots/상세 HTTP, canonical·JSON-LD·noindex | 통과 |
| 상세 첫 요청과 재요청 | MISS → HIT |
| 잘못된 상세 ID 두 종류 | 404 |
| API health | 200 |
| preview / 기존 운영 origin CORS | 200, 정확한 origin과 credentials=true |
| 위조 preview 유사 도메인 | 403, 허용 헤더 없음 |
| Google/Kakao 로그인 시작과 callback URI | 각각 302, 기존 API callback 유지 |
| Google/Kakao 취소 모의 callback | preview `/?login=failed` 복귀 |
| 사용자 지정 외부 returnTo URL | 400 |
| 실제 브라우저 | Kakao 지도 타일·마커·주변 목록 14곳, 내 계정/로그아웃 버튼 확인 |
| 실제 로그인 복귀 | 사용자가 직접 확인 완료 응답. 로그인 상태 표시도 확인 |

재현: `scripts/verify-preview-oauth-routing.mjs`는 별도 무인증 세션에서 시작/취소만 시험한다. 사용자 계정 로그인·제보·탈퇴를 대신 수행하지 않는다. 실제 성공 확인에서 선택한 provider 종류와 신규 가입 동의까지 모두 확인했다고 주장하지 않는다.

**남은 작업**: 새 API projection/sitemap 통합, 상시 캐시 갱신 key/outbox 연결, 모바일 전체 회귀·신규 동의/제보 복귀·부하 검증, 최종 운영 전환. 브라우저 표본에서 상세의 구분 표기와 목록의 구분 표기가 다르게 나온 건은 회귀 검토 대상으로 남긴다. 이번 연결 작업에서 원본 데이터를 바꾸지 않았다.

무료 Workers 유지. preview는 운영 API를 공유하므로 이후 제보 등의 쓰기는 실제 운영 데이터에 영향을 준다. 사용자 인증 정보는 읽거나 기록하지 않았다.
