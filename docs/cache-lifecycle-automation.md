# 화장실 상세 캐시 자동 순환 운영

## 목적

화장실 상세 캐시는 두 계층으로 운영한다. 공개 화장실 기본 데이터는 배포와 독립된 공유 R2 키에 저장하고, HTML·RSC·메타데이터를 포함한 Next.js 페이지 결과는 배포별 incremental-cache namespace에 저장한다. 정기 작업은 공유 데이터만 갱신하며 전체 페이지를 다시 만들지 않는다.

## 공유 데이터 순환 갱신

- 공유 키: `public-toilets/v1/toilets/{id}.json`
- fresh 기간: 30일
- 순환 주기: 28일
- 파티션: `toiletId % 28`
- 기본 처리율: 5 req/s, 동시 작업 8개
- 예상 일일 대상: 53,590개 기준 평균 약 1,914개
- 이론상 요청 시간: 약 6분 23초. sitemap 조회, R2 조건부 저장, 재시도를 포함한 정상 범위는 약 8~15분이다.

GitHub Actions는 매일 05:30 KST에 그날의 파티션을 선택한다. 저장소 변수 `CACHE_DATA_REFRESH_ENABLED`가 `true`일 때만 실행된다. 내부 POST 경로는 `CACHE_MAINTENANCE_SECRET`으로 HMAC 서명하며 한 요청에 화장실 ID 하나만 허용한다. 이 secret은 기존 변경 이벤트용 `CACHE_REVALIDATION_SECRET`과 분리한다.

갱신은 fresh 객체도 원본 API에서 다시 읽어 같은 키에 조건부 저장한다. 공개 필드 정제, source revision, R2 ETag를 그대로 사용하므로 갱신 도중 수정·삭제 이벤트가 오면 최신 이벤트가 이긴다. 삭제·비공개 tombstone은 자동 갱신이 되살리지 않는다.

워크플로는 배포 작업과 다른 concurrency group을 쓰고 `cancel-in-progress: false`로 설정한다. 배포 ID나 Worker version을 체크포인트에 넣지 않으므로 배포가 바뀌어도 이미 갱신한 ID는 유지된다. 배포 중 일시적인 404, 429, 5xx, timeout은 backoff한다. 실행이 끝내 실패하면 같은 cycle ID와 partition으로 수동 재실행해 체크포인트부터 이어간다.

## 페이지 캐시

전체 공개 상세 URL의 정기 사전 생성은 실행하지 않는다. 새 배포 후 대표 ID만 기존 수동 workflow의 sample 모드로 확인한다. 나머지 페이지 결과는 실제 요청 때 생성한다. 페이지가 원본 데이터를 필요로 하면 먼저 30일 공유 캐시를 읽으므로 미니 PC API 부하는 낮게 유지된다.

디자인 배포는 새 page-cache namespace를 사용하지만 공유 데이터 키는 바뀌지 않는다. 따라서 디자인 변경마다 53,590개 전체 상세 페이지를 다시 생성할 필요가 없다.

## 퇴역 페이지 캐시 정리

정기 정리는 매일 06:30 KST에 계획을 새로 만든다. 저장소 변수 `CACHE_CLEANUP_AUTOMATIC_ENABLED`가 `true`일 때만 실행된다.

다음 대상은 항상 보호한다.

- 현재 트래픽을 받는 모든 Worker version의 cache namespace
- 식별 가능한 모든 퇴역 namespace는 각각의 퇴역 시점부터 최소 3일
- 현재 활성 배포보다 나중에 만들어진 배포 후보 namespace
- 공유 데이터 `public-toilets/v1/`, 정적 자산, 업로드 이미지, 다른 버킷

release registry에 없는 namespace가 하나라도 있거나 활성 배포를 확인할 수 없으면 삭제하지 않는다. 계획의 객체 수·바이트·SHA-256 지문을 실행 직전에 다시 계산하며 기본 자동 상한은 100,000개와 4 GiB다. 삭제 중에도 10,000개마다 활성 배포를 다시 확인한다. 상태가 바뀌면 남은 삭제를 중단한다.

새 운영 배포는 `CACHE_RELEASE_REGISTRY_JSON`에 Worker version, cache namespace, build ID, 배포 시각을 기록해야 한다. 누락되면 자동 정리는 실패한 채 캐시를 보존한다. 자동 정리에는 production incremental-cache prefix만 읽고 삭제할 수 있는 별도 최소 권한 R2 키가 필요하다.

## 설정 위치

GitHub 저장소 변수(job 시작 전 gate 판정용):

- variable `CACHE_DATA_REFRESH_ENABLED`
- variable `CACHE_CLEANUP_DRY_RUN_ENABLED`
- variable `CACHE_CLEANUP_EXECUTE_ENABLED`
- variable `CACHE_CLEANUP_AUTOMATIC_ENABLED`

GitHub Environment `production-cache-maintenance`:

- secret `CACHE_MAINTENANCE_SECRET`
- secret `CACHE_STATUS_API_TOKEN`
- secret `CLOUDFLARE_ACCOUNT_ID`
- secret `R2_CACHE_READ_ACCESS_KEY_ID`, `R2_CACHE_READ_SECRET_ACCESS_KEY`
- secret `R2_CACHE_DELETE_ACCESS_KEY_ID`, `R2_CACHE_DELETE_SECRET_ACCESS_KEY`
- variable `CACHE_RELEASE_REGISTRY_JSON`
- 선택 variable `CACHE_CLEANUP_AUTO_MAX_FILES`, `CACHE_CLEANUP_AUTO_MAX_BYTES`

Environment는 job이 시작된 뒤 연결되므로 Environment 변수는 job 수준 `if`에서 gate로 사용할 수 없다. gate는 비밀값이 아니며 저장소 변수에 둔다. 서명 키와 R2 자격증명은 계속 보호 Environment secret에만 둔다.

Cloudflare Worker에는 같은 `CACHE_MAINTENANCE_SECRET`을 secret으로 저장한다. 실제 값은 저장소, 이슈, 로그, artifact에 기록하지 않는다.

## 활성화와 복구 순서

1. 코드 병합과 운영 Worker 배포 후 내부 경로가 서명 없이는 거부되는지 확인한다.
2. 유지보수 secret을 Worker와 GitHub Environment에 각각 저장한다.
3. gate가 꺼진 상태에서 지정 파티션 소수 ID를 격리 또는 수동 검증한다.
4. 저장소 변수 `CACHE_DATA_REFRESH_ENABLED=true`로 바꾸고 한 파티션을 실행해 성공·실패·실제 처리율을 확인한다.
5. 최신 release registry와 최소 권한 삭제 키를 준비한다.
6. 정리 dry-run의 unknown 0, 보호 namespace, 후보 크기를 확인한 뒤 저장소 변수 `CACHE_CLEANUP_AUTOMATIC_ENABLED=true`로 바꾼다.

문제가 생기면 해당 gate를 `false`로 돌린다. 공유 데이터 갱신 중단은 사용자 요청 시 read-through 동작에 영향을 주지 않는다. 정리가 중단돼도 남은 페이지 캐시는 보관될 뿐 서비스 응답은 계속된다.
