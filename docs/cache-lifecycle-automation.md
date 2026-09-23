# 화장실 상세 캐시 자동 순환 운영

## 목적

화장실 상세 캐시는 두 계층으로 운영한다. 공개 화장실 기본 데이터는 배포와 독립된 공유 R2 키에 저장하고, HTML·RSC·메타데이터를 포함한 Next.js 페이지 결과는 배포별 incremental-cache namespace에 저장한다. 정기 작업은 공유 데이터만 갱신하며 전체 페이지를 다시 만들지 않는다.

## 공유 데이터 순환 갱신

- 공유 키: `public-toilets/v1/toilets/{id}.json`
- fresh 기간: 30일
- 순환 주기: 28일
- 파티션: `toiletId % 28`
- 기본 처리율: 5 req/s, 동시 작업 8개
- 대상 목록: 공개 지도 API의 전국 `MARKER` 목록. SEO 색인용 `visibility_status` 사이트맵과 분리한다.
- 예상 일일 대상: 약 50,000~54,000개 기준 평균 약 1,800~1,930개
- 이론상 요청 시간: 약 6분 23초. 공개 목록 조회, R2 조건부 저장, 재시도를 포함한 정상 범위는 약 8~15분이다.

GitHub Actions는 매일 05:30 KST에 그날의 파티션을 선택한다. 저장소 변수 `CACHE_DATA_REFRESH_ENABLED`가 `true`일 때만 실행된다. 내부 POST 경로는 `CACHE_MAINTENANCE_SECRET`으로 HMAC 서명하며 한 요청에 화장실 ID 하나만 허용한다. 이 secret은 기존 변경 이벤트용 `CACHE_REVALIDATION_SECRET`과 분리한다.

갱신은 fresh 객체도 원본 API에서 다시 읽어 같은 키에 조건부 저장한다. 공개 필드 정제, source revision, R2 ETag를 그대로 사용하므로 갱신 도중 수정·삭제 이벤트가 오면 최신 이벤트가 이긴다. 삭제·비공개 tombstone은 자동 갱신이 되살리지 않는다.

공유 객체는 현재 원본의 언어별 시설명·주소 번역과 정규화 개방시간의 공개 필드만 저장한다. 번역 또는 개방시간이 수정되면 API outbox가 해당 ID를 `invalidated`로 표시하고, 다음 상세 조회나 정기 갱신에서 원본 전체를 다시 읽는다. 기존 v1 객체에 정규화 개방시간 필드가 없어도 정상 데이터로 읽으며, 그 필드를 얻기 위해 53,000여 건을 일괄 무효화하지 않는다. 오래된 객체는 정기 작업이 정상 완료되면 28일 이내의 순환 갱신과 변경 알림을 통해 점진적으로 채워진다. API에 새로운 공개 필드가 추가되더라도 R2 화이트리스트에는 자동 포함되지 않으므로 별도 계약 검토가 필요하다.

정기 갱신은 공유 R2 객체만 교체하며 이미 생성된 HTML/RSC 페이지 캐시는 무효화하지 않는다. 따라서 변경 이벤트가 없던 기존 객체의 정규화 개방시간이 R2에 채워져도 그 전에 만들어진 상세 페이지는 자체 30일 재검증 또는 별도의 경로 무효화 때 새 필드를 표시한다. 이 보강만으로 모든 언어별 상세 페이지를 즉시 재생성했다고 간주하지 않는다.

워크플로는 배포 작업과 다른 concurrency group을 쓰고 `cancel-in-progress: false`로 설정한다. 갱신 대상 ID는 전국 공개 지도 목록에서 가져오며, 단계적으로 공개 중인 SEO 사이트맵을 대상 카탈로그로 사용하지 않는다. 목록 응답 수와 `meta.total_count`가 다르거나 ID가 중복되면 갱신을 시작하지 않는다. 배포 ID나 Worker version을 체크포인트에 넣지 않으므로 배포가 바뀌어도 이미 갱신한 ID는 유지된다. 배포 중 일시적인 404, 429, 5xx, timeout은 backoff한다. 실행이 끝내 실패하면 같은 cycle ID와 partition으로 수동 재실행해 체크포인트부터 이어간다.

## 페이지 캐시

전체 공개 상세 URL의 정기 사전 생성은 실행하지 않는다. 새 배포 후 대표 ID만 기존 수동 workflow의 sample 모드로 확인한다. 나머지 페이지 결과는 실제 요청 때 생성한다. 페이지가 원본 데이터를 필요로 하면 먼저 30일 공유 캐시를 읽으므로 미니 PC API 부하는 낮게 유지된다.

디자인 배포는 새 page-cache namespace를 사용하지만 공유 데이터 키는 바뀌지 않는다. 따라서 디자인 변경마다 53,590개 전체 상세 페이지를 다시 생성할 필요가 없다.

## 퇴역 페이지 캐시 정리

정기 정리는 매일 06:30 KST에 계획을 새로 만든다. 저장소 변수 `CACHE_CLEANUP_AUTOMATIC_ENABLED`가 `true`일 때만 실행된다.

다음 대상은 항상 보호한다.

- 현재 트래픽을 받는 모든 Worker version의 cache namespace
- 직전 Worker 릴리스의 cache namespace. 롤백 후 첫 요청의 대량 재생성을 피하기 위해 유지한다.
- 현재 활성 배포보다 나중에 만들어진 배포 후보 namespace
- 공유 데이터 `public-toilets/v1/`, 정적 자산, 업로드 이미지, 다른 버킷

활성 배포를 확인할 수 없으면 삭제하지 않는다. release registry에 없는 객체는 삭제 후보에서 제외하고 경고와 수량을 남긴다. 기본 자동 상한은 100,000개와 4 GiB다. 퇴역 namespace 하나가 상한보다 커도 키 순서에 따라 한도 내 일부를 선택하고, 재조회한 다음 실행에서 나머지를 처리한다. 객체 하나가 바이트 상한보다 크면 자동 삭제를 거부한다.

한 번의 예약 실행은 다음 두 단계까지만 처리한다.

1. 첫 계획을 새로 만들고, 상한 안에서 가장 오래된 퇴역 namespace 묶음을 선택한다. 객체 수·바이트·SHA-256 지문과 활성 배포가 일치할 때만 삭제한다.
2. 남은 후보가 있으면 R2와 활성 배포를 다시 조회해 두 번째 계획을 만든다. 같은 검증을 다시 통과한 다음 별도 묶음으로 삭제한다.

예약 작업은 `--rollback-days 0`으로 실행하므로 직전 릴리스보다 오래된 캐시는 퇴역 후 다음 실행부터 정리한다. 두 단계 뒤에도 후보가 남으면 다음 날 예약 실행으로 넘긴다. 각 단계는 독립된 계획·실행 보고서를 artifact로 남긴다. 삭제 중에도 10,000개마다 활성 배포를 다시 확인하며 상태가 바뀌면 남은 삭제를 중단한다. 공유 데이터, 활성·직전 릴리스 namespace, 정적 자산, 업로드 이미지는 선택 대상이 아니다.

특정 퇴역 namespace만 수동 정리할 때는 dry-run에 정확한 `cache_namespace`와 `rollback_days=0`을 넣는다. 도구는 현재 트래픽을 받는 버전과 그 직전 릴리스를 거부하고, 지정한 한 namespace의 키·바이트·SHA-256 지문만 보고한다. 실행 workflow는 검토한 수량·지문과 재조회한 R2 목록, 활성 Worker를 다시 대조하며 별도 실행 gate와 확인 문구가 필요하다. 공유 데이터나 다른 namespace는 정리하지 않는다.

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
6. 정리 dry-run에서 보호 namespace, 분류 불명 보존 수량, 단계별 후보 크기를 확인한 뒤 저장소 변수 `CACHE_CLEANUP_AUTOMATIC_ENABLED=true`로 바꾼다.

문제가 생기면 해당 gate를 `false`로 돌린다. 공유 데이터 갱신 중단은 사용자 요청 시 read-through 동작에 영향을 주지 않는다. 정리가 중단돼도 남은 페이지 캐시는 보관될 뿐 서비스 응답은 계속된다.
