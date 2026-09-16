# 전체 화장실 상세 캐시 구현

2026-09-15 구현, 2026-09-16 30일 정책 보강, 2026-09-17 fresh 검증 보강 · WBS [#242](https://github.com/toilet-project/toilet-web/issues/242), [#243](https://github.com/toilet-project/toilet-web/issues/243)

## 구현 범위

- 사이트맵에 있는 모든 공개 `/toilet/{id}`를 제한된 속도로 요청해 해당 배포의 OpenNext 페이지 캐시를 생성한다.
- 공개 시설 데이터는 `public-toilets/v1/toilets/{id}.json` R2 객체로 분리해 배포가 바뀌어도 재사용한다.
- 페이지 HTML/RSC와 Next.js 데이터 결과는 기존 OpenNext의 `incremental-cache/{NEXT_DEPLOYMENT_ID}/...` 아래에 배포별로 둔다. 이 값은 릴리스 manifest의 `appVersion`이며 `.next/BUILD_ID`와 다르다.
- 리뷰 목록·평점·프로필 사진은 현재 브라우저 공개 API/사진 캐시 흐름을 유지한다. 지도 목록도 브라우저가 API를 직접 조회한다.
- 사전 생성과 정리 워크플로는 수동 실행 전용이며 저장소 변수와 보호 환경 승인 없이는 job이 시작되지 않는다.

## 공유 데이터

`src/server/sharedToiletCache.ts`는 원본 응답에서 공개 상세 계약 필드만 복사한다. Cookie·Authorization을 전달하지 않고 알 수 없는 필드를 보관하지 않는다. 기본 fresh 30일, 이후 7일 동안 원본 장애 시에만 사용하는 stale fallback, 404 negative 5분이다. R2 장애는 공개 원본 API로 우회한다.

유효기간은 객체에 과거 정책의 만료 시각이 남아 있어도 검증된 `storedAt`과 현재 배포 정책으로 다시 계산한다. 따라서 1시간 정책에서 생성한 정상 v1 객체는 저장 후 30일 이내라면 원본 API 재조회 없이 재사용한다. 수정·삭제·비공개 이벤트가 기록한 invalidated/deleted 상태에는 이 연장 규칙을 적용하지 않는다.

수정 이벤트의 revision과 R2 ETag 조건부 쓰기를 함께 사용한다. 원본 조회가 진행되는 동안 새 이벤트가 오면 이전 ETag로 시작한 저장이 실패하고 최신 revision에서 다시 조회한다. 삭제·비공개는 tombstone으로 남겨 오래된 데이터가 다시 노출되지 않게 한다. 손상된 객체도 ETag를 유지한 채 정상 원본 결과로 조건부 교체한다.

`SHARED_TOILET_CACHE_ENABLED`의 값이 정확히 `true`일 때만 켜진다. binding이 없거나 R2를 읽지 못하면 기능 활성 상태에서도 원본 공개 API로 fail-open한다. production만 `true`를 유지하고 preview는 `false`를 유지한다. 기능을 끄면 30일 `toilet:{id}` Next fetch로 즉시 복귀한다.

필요한 Worker 설정은 다음과 같다. 실제 버킷 생성·binding·변수 활성화는 운영 전환 작업이다.

| 이름 | 초기값/용도 |
| --- | --- |
| `PUBLIC_TOILET_DATA_CACHE_R2` | 환경별 OpenNext R2 버킷의 공유 데이터 전용 binding. `public-toilets/v1/` prefix만 사용 |
| `SHARED_TOILET_CACHE_ENABLED` | production `true`, preview `false` |
| `SHARED_TOILET_CACHE_FRESH_SECONDS` | 기본 2592000(30일) |
| `SHARED_TOILET_CACHE_STALE_SECONDS` | 기본 3196800(저장 후 37일, 7일 추가 장애 fallback) |
| `SHARED_TOILET_CACHE_NEGATIVE_SECONDS` | 기본 300 |

## 갱신

`POST /_internal/cache/revalidate`는 기존 HMAC v1 서명을 유지하면서 ID 배열 v1과 revision 이벤트 v2를 모두 받는다. v2는 공유 R2 상태, D1 `toilet:{id}` 태그, 상세 경로를 ACK 전에 갱신한다. `catalogChanged=true`가 하나라도 있으면 D1 `toilet-catalog` 태그와 사이트맵 경로도 갱신한다. 어느 저장소든 실패하면 503으로 답해 API outbox가 재시도한다.

## 사전 생성

```sh
# 이 명령은 실제 URL 요청을 보내므로 승인된 환경에서만 두 잠금을 모두 사용한다.
CACHE_PREWARM_ENABLED=true pnpm cache:prewarm -- --execute \
  --base-url https://geupddong.com \
  --deployment-id EXACT_VERSION_JSON_VALUE \
  --concurrency 2 --rps 1 --ids 53585
```

프로그램은 같은 origin의 사이트맵 shard만 읽고, ID 목록·shard·전체 모드를 지원한다. 배포 ID를 실행 전·중·후 확인하고 변경되면 중단한다. 체크포인트와 성공·실패·속도·cache header 검증 보고서를 남긴다. GitHub Actions는 같은 배포 체크포인트를 다음 수동 실행에서 복원하며 새 실행이 기존 실행을 취소한다.

운영용 workflow는 `--require-fresh`를 사용한다. `MISS`와 `STALE`은 캐시 객체의 존재나 재검증 시작만 뜻하므로 완료로 기록하지 않는다. 같은 전역 속도 제한 아래 최대 6회, 1초 간격으로 다시 요청해 `HIT` 또는 `REVALIDATED`가 확인된 ID만 `fresh-v1` 체크포인트에 완료로 기록한다. 끝까지 fresh 증거가 나오지 않은 ID는 실패 목록에 남아 다음 실행에서 다시 처리된다. 보고서는 ID 완료 속도와 별도로 실제 HTTP 요청 수·요청 속도·cache evidence별 개수를 기록한다.

한 ID당 한 번만 요청하면 53,590건은 5 req/s에서 약 2시간 59분이다. fresh 확인을 위한 재요청이 있으면 실제 요청 수만큼 늘어난다. 운영 전체 설정은 동시 요청 8개·5 req/s이며, 429/5xx는 지수 지연 후 재시도한다. 배포 변경이나 실행 중단은 배포별 `fresh-v1` 체크포인트로 이어서 처리한다.

## 운영 검증 기록

- 2026-09-16 기존 사전 생성 실행 [Actions #35091327638](https://github.com/toilet-project/toilet-web/actions/runs/35091327638): 공개 ID 53,590개 완료, 실패 0, 평균 3.47 ID/s. 당시 검증기는 `STALE`도 캐시 존재 증거로 인정했으므로 30일 fresh 상태 전체 증명으로는 사용하지 않는다.
- 2026-09-17 fresh 검증 표본 [Actions #35118300307](https://github.com/toilet-project/toilet-web/actions/runs/35118300307): 고르게 고른 11개 ID 모두 완료, 실패 0. 총 25회 요청에서 `HIT 13`, `STALE 12`, `MISS 0`, `REVALIDATED 0`이었고, 각 ID는 마지막에 `HIT`을 확인한 뒤에만 완료됐다.
- 2026-09-17 전체 fresh 검증 [Actions #35118665768](https://github.com/toilet-project/toilet-web/actions/runs/35118665768): 53,590개 대상으로 실행 중이다. 완료 artifact의 `targetCount`, `succeeded`, `failed`, `cacheEvidenceCounts`, `requestCount`를 확인하기 전에는 전체 fresh 검증 완료로 기록하지 않는다.

## 정리

`pnpm cache:cleanup`은 기본 dry-run이다. Worker 활성 배포를 Wrangler read-only 명령으로 확인하고, 릴리스 registry의 Worker UUID ↔ R2 캐시 namespace(`cacheNamespace`, manifest의 `appVersion`) 매핑을 사용한다. `.next/BUILD_ID`는 배포 검증 정보로만 보관하며 정리 경로 판정에 사용하지 않는다. 현재 트래픽의 모든 버전과 직전 정상 배포의 최소 3일을 보호한다. registry가 없거나 알 수 없는 객체는 삭제하지 않는다.

삭제는 `--execute`와 `CACHE_CLEANUP_ENABLED=true`가 함께 있어야 하며, 삭제 직전에 활성 배포를 다시 확인한다. 제공한 Actions workflow는 dry-run 계획만 만들며 삭제 키를 사용하지 않는다. 대상은 `incremental-cache/`뿐이므로 `public-toilets/v1/`, 정적 자산, 업로드 이미지와 다른 버킷은 제외된다.

2026-09-17 읽기 전용 Worker 상태 토큰과 운영 캐시 객체 읽기 전용 R2 키를 `production-cache-maintenance` GitHub Environment에 구성했다. 첫 실측 dry-run [Actions #35139962673](https://github.com/toilet-project/toilet-web/actions/runs/35139962673)은 삭제를 시도하지 않았고 264,530개(8,478,874,679 bytes)를 모두 unknown으로 보호했다. 이 결과로 기존 정리기가 `.next/BUILD_ID`를 R2 경로와 비교하던 불일치를 발견했고 [PR #258](https://github.com/toilet-project/toilet-web/pull/258)에서 실제 R2 namespace인 manifest `appVersion` 기준으로 보강했다.

보강 후 dry-run [Actions #35141194627](https://github.com/toilet-project/toilet-web/actions/runs/35141194627)은 활성 namespace 70,365개(2,992,016,167 bytes)와 직전 rollback namespace 73,672개(2,118,807,518 bytes)를 보호했다. release registry에 없는 120,493개(3,368,050,981 bytes)는 unknown으로 계속 보호했다. 삭제 후보·삭제 시도·실제 삭제는 모두 0이다. 실행 게이트 `CACHE_CLEANUP_DRY_RUN_ENABLED`는 저장소와 Environment에서 `false`이며, workflow에는 삭제 자격증명과 `--execute`가 없다.

## 적용·복구

적용 순서는 환경별 R2 binding 확인 → API outbox V2 SQL → API v1 호환 배포 → Web v1/v2 수신 배포 → 공유 캐시 표본 활성화 → API 계약 v2 → 표본/한 shard/전체 사전 생성 → 정리 dry-run 검토다. 공유 데이터는 기존 환경별 OpenNext R2 버킷 안의 별도 prefix를 쓰므로 새 버킷을 만들 필요는 없다.

문제가 생기면 공유 캐시 플래그를 끄면 30일 Next fetch로 돌아간다. API 계약도 v1으로 되돌릴 수 있다. 페이지 캐시나 공유 데이터를 즉시 삭제할 필요는 없으며, Worker는 검증된 직전 버전으로 되돌린다.
