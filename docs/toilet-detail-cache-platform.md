# 전체 화장실 상세 캐시 구현

2026-09-15 · WBS [#242](https://github.com/toilet-project/toilet-web/issues/242), [#243](https://github.com/toilet-project/toilet-web/issues/243) · **운영 미적용**

## 구현 범위

- 사이트맵에 있는 모든 공개 `/toilet/{id}`를 제한된 속도로 요청해 해당 배포의 OpenNext 페이지 캐시를 생성한다.
- 공개 시설 데이터는 `public-toilets/v1/toilets/{id}.json` R2 객체로 분리해 배포가 바뀌어도 재사용한다.
- 페이지 HTML/RSC와 Next.js 데이터 결과는 기존 OpenNext의 `incremental-cache/{buildId}/...` 아래에 배포별로 둔다.
- 리뷰 목록·평점·프로필 사진은 현재 브라우저 공개 API/사진 캐시 흐름을 유지한다. 지도 목록도 브라우저가 API를 직접 조회한다.
- 사전 생성과 정리 워크플로는 수동 실행 전용이며 저장소 변수와 보호 환경 승인 없이는 job이 시작되지 않는다.

## 공유 데이터

`src/server/sharedToiletCache.ts`는 원본 응답에서 공개 상세 계약 필드만 복사한다. Cookie·Authorization을 전달하지 않고 알 수 없는 필드를 보관하지 않는다. 기본 fresh 1시간, stale 장애 fallback 6시간, 404 negative 5분이다. R2 장애는 공개 원본 API로 우회하고, 원본 장애 때만 유효한 stale 정상 데이터를 사용한다.

수정 이벤트의 revision과 R2 ETag 조건부 쓰기를 함께 사용한다. 원본 조회가 진행되는 동안 새 이벤트가 오면 이전 ETag로 시작한 저장이 실패하고 최신 revision에서 다시 조회한다. 삭제·비공개는 tombstone으로 남겨 오래된 데이터가 다시 노출되지 않게 한다. 손상된 객체도 ETag를 유지한 채 정상 원본 결과로 조건부 교체한다.

`SHARED_TOILET_CACHE_ENABLED`의 값이 정확히 `true`일 때만 켜진다. binding이 없거나 R2를 읽지 못하면 기능 활성 상태에서도 원본 공개 API로 fail-open한다. 기능이 꺼져 있으면 기존 `revalidate: 3600`, `toilet:{id}` Next fetch를 그대로 사용한다.

필요한 Worker 설정은 다음과 같다. 실제 버킷 생성·binding·변수 활성화는 운영 전환 작업이다.

| 이름 | 초기값/용도 |
| --- | --- |
| `PUBLIC_TOILET_DATA_CACHE_R2` | 환경별 OpenNext R2 버킷의 공유 데이터 전용 binding. `public-toilets/v1/` prefix만 사용 |
| `SHARED_TOILET_CACHE_ENABLED` | `false`에서 시작 |
| `SHARED_TOILET_CACHE_FRESH_SECONDS` | 기본 3600 |
| `SHARED_TOILET_CACHE_STALE_SECONDS` | 기본 21600 |
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

프로그램은 같은 origin의 사이트맵 shard만 읽고, ID 목록·shard·전체 모드를 지원한다. 배포 ID를 실행 전·중·후 확인하고 변경되면 중단한다. 체크포인트와 성공·실패·속도·cache header 표본 검증 보고서를 남긴다. GitHub Actions는 같은 배포 체크포인트를 다음 수동 실행에서 복원하며 새 실행이 기존 실행을 취소한다.

이론상 53,600건은 1 req/s 약 14시간 53분, 2 req/s 약 7시간 27분, 4 req/s 약 3시간 43분이다. 실제 속도는 표본에서 확인한다. 기본 전체 설정은 2 req/s이므로 5시간 실행 제한에 걸리면 체크포인트로 이어서 완료한다.

## 정리

`pnpm cache:cleanup`은 기본 dry-run이다. Worker 활성 배포를 Wrangler read-only 명령으로 확인하고, 릴리스 registry의 Worker UUID ↔ OpenNext build ID 매핑을 사용한다. 현재 트래픽의 모든 버전과 직전 정상 배포의 최소 3일을 보호한다. registry가 없거나 알 수 없는 객체는 삭제하지 않는다.

삭제는 `--execute`와 `CACHE_CLEANUP_ENABLED=true`가 함께 있어야 하며, 삭제 직전에 활성 배포를 다시 확인한다. 제공한 Actions workflow는 dry-run 계획만 만들며 삭제 키를 사용하지 않는다. 대상은 `incremental-cache/`뿐이므로 `public-toilets/v1/`, 정적 자산, 업로드 이미지와 다른 버킷은 제외된다.

## 적용·복구

적용 순서는 환경별 R2 binding 확인 → API outbox V2 SQL → API v1 호환 배포 → Web v1/v2 수신 배포 → 공유 캐시 표본 활성화 → API 계약 v2 → 표본/한 shard/전체 사전 생성 → 정리 dry-run 검토다. 공유 데이터는 기존 환경별 OpenNext R2 버킷 안의 별도 prefix를 쓰므로 새 버킷을 만들 필요는 없다.

문제가 생기면 공유 캐시 플래그를 끄면 기존 1시간 Next fetch로 돌아간다. API 계약도 v1으로 되돌릴 수 있다. 페이지 캐시나 공유 데이터를 즉시 삭제할 필요는 없으며, Worker는 검증된 직전 버전으로 되돌린다.
