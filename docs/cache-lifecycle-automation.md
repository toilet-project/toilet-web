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

정기 정리는 매일 06:30 KST에 계획을 새로 만든다. 승인된 운영 배포를 확정한 뒤에는 `cache-production-deployed` repository dispatch 이벤트로 같은 정리를 요청한다. 수동 `workflow_dispatch`도 유지한다. 세 진입점 모두 저장소 변수 `CACHE_CLEANUP_AUTOMATIC_ENABLED`가 `true`일 때만 실행되며 같은 concurrency group으로 직렬 처리한다.

배포 이벤트의 payload는 삭제 권한이나 대상 선택에 사용하지 않는다. 실제 활성 Worker, 보호 release registry, R2 목록은 실행할 때마다 다시 조회한다. 이벤트를 받았다는 사실만으로 새 배포나 기존 캐시를 신뢰하지 않는다.

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

각 실행은 `GITHUB_STEP_SUMMARY`에 확인된 실제 삭제, 마지막 계획의 보호 대상·미분류 보존·미처리 삭제 후보를 구분한다. 첫 준비나 registry 검증에서 실패했으면 조사하지 못한 수량을 `미측정`으로 남기며 0건 삭제 성공으로 표시하지 않는다. 삭제 응답 일부가 확인되지 않았으면 확인된 수량은 하한값, 남은 후보는 최대치로 표시한다. 두 묶음의 실제 삭제만 합산하며 보호·미분류 수량은 마지막 계획을 사용해 중복 합산하지 않는다. 요약과 단계별 보고서를 함께 보관하고, 전체 버킷 사용량과 incremental-cache 정리 범위의 수량을 혼동하지 않는다.

새 운영 배포는 `CACHE_RELEASE_REGISTRY_JSON`에 Worker version, cache namespace, build ID, 배포 시각을 기록해야 한다. 누락되거나 활성 릴리스의 등록이 확정되지 않으면 자동 정리는 실패한 채 캐시를 보존한다. 자동 정리에는 production incremental-cache prefix만 읽고 삭제할 수 있는 별도 최소 권한 R2 키가 필요하다.

## 운영 배포와 정리 연결

운영 배포에는 `scripts/production-release.mjs`의 `stage`와 `activate`를 순서대로 사용한다. 두 명령은 기본적으로 계획만 출력하며 원격 변경에는 `--execute`가 필요하다. 기존 CI production-candidate artifact를 사용하고 배포 과정에서 다시 빌드하지 않는다.

1. `stage`는 artifact 검증 뒤 OpenNext upload를 수행하고, manifest SHA-256 태그와 원격 Worker UUID·ETag를 읽어 receipt에 기록한다. 기존 공개 라우트와 cron을 변경하는 일반 deploy는 사용하지 않는다.
2. `activate`는 artifact·receipt·원격 버전의 일치를 재검증하고 현재 활성 배포의 registry 정합성을 확인한다. 후보를 먼저 보호 목록에 등록하고 읽어 확인한 뒤 해당 버전으로 트래픽을 전환한다.
3. 실제 활성 버전과 공개 version 응답을 확인하고 Cloudflare의 배포 시각으로 registry 등록을 확정한다. 확정 뒤 payload 없는 `cache-production-deployed` 이벤트를 보내 정리를 요청한다.

등록·전환·사후 확인 중 실패하면 완료로 취급하지 않는다. 등록이 확정되지 않은 활성 버전은 정리에서 보호하면서 오류를 보고한다. 기존 태그가 없는 후보는 추정해 연결하지 않고 `stage`부터 다시 준비한다. 정리 이벤트가 지연되거나 실행 gate가 꺼져 있으면 다음 정기 실행까지 캐시가 남을 수 있다.

계획 확인 예시:

```sh
pnpm release:stage-production --release-dir ./approved-release --receipt ./stage-receipt.json --report ./stage-plan.json
pnpm release:activate-production --release-dir ./approved-release --receipt ./stage-receipt.json --report ./activation-plan.json
```

실제 stage에서 작성된 receipt를 activate에 전달한다. 원격 반영은 승인된 배포 범위에서 각 명령에 `--execute`를 명시한다. registry와 이벤트 전송은 고정 저장소와 `production-cache-maintenance` 환경을 사용하며 키·secret 값은 receipt나 보고서에 저장하지 않는다.

보고서와 receipt는 artifact 폴더 밖의 서로 다른 경로에 저장한다. `stage`와 신규 `activate`는 현재 운영보다 새로운 CI 실행의 artifact만 허용하며, 이미 등록된 namespace에 초기 캐시를 다시 쓰지 않는다. 확정되지 않은 후보는 항상 보호하고 직전 롤백 선정에서는 제외한다. 등록이 미확정인 버전이 실제 활성 상태가 되면 정리는 중단한다.

전환 응답을 받지 못한 경우 보고서의 `activationOutcome=unknown`은 미반영을 의미하지 않는다. 같은 receipt로 다시 실행하면 실제로 해당 버전이 100% 활성 상태인지 조회하고, 이미 전환됐다면 재배포 없이 등록 확정·공개 버전 확인·정리 요청을 이어간다. 정리 요청 성공은 정리 작업 완료와 구분하며 실제 삭제 결과는 Actions 보고서에서 확인한다.

registry 갱신은 현재 값 재확인과 저장 후 읽기 검증을 수행하지만 GitHub 변수에는 원자적 조건부 갱신이 없다. 운영 배포는 동시에 하나만 진행한다. 현재 누락된 활성·직전 롤백 기록은 검증한 CI manifest와 Cloudflare의 실제 활성화 시각을 대조한 후 별도로 복구해야 한다. 이 운영 도구 추가만으로 기존 누락 기록이 자동 복구되지는 않는다.

GitHub 설정 변수는 [개별 48KB 한도](https://docs.github.com/en/actions/reference/workflows-and-actions/variables#limits-for-configuration-variables)가 있다. 도구는 등록 목록이 한도를 넘으면 기록을 임의로 잘라내지 않고 활성화 전에 중단한다. 장기 보관 방식 확장과, R2에 객체가 남지 않았음을 확인한 퇴역 기록의 아카이브는 별도 운영 과제다.

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
