# Workers 미리보기 준비 상태

2026-09-05 · WBS #186 · 운영 전환 전.

## 완료

- 사용자가 Cloudflare 배포 도구 OAuth 권한 연결을 승인했고 로그인이 확인됐다. token 값은 문서·GitHub에 저장하지 않았다.
- 사용자가 R2의 월 기본 $0, 무료 한도 초과 사용료·자동 갱신 조건을 확인하고 구독 활성화를 승인했다. 대시보드의 구독 활성화 성공을 확인했다.
- 미리보기 전용 R2 bucket `geupddong-next-preview-cache` 생성: Standard, APAC location hint.
- 미리보기 전용 D1 `geupddong-next-preview-tags` 생성: APAC. UUID를 wrangler 설정에 반영했다. UUID는 접속 비밀키가 아니다.
- R2는 향후 공개 상세 cache, D1은 cache tag 시각 용도다. 현재 업무 데이터 복사·schema populate·운영 DB 변경은 하지 않았다.
- 미리보기 `SITE_INDEXABLE=false`를 runtime vars에도 명시했다. build 환경에서도 false로 유지해야 한다.

## 아직 미실행 / 승인 경계

- 현재 계정 Workers 플랜은 **Free**. 대시보드에서 요청당 CPU 10ms, Paid 월 $5 + 사용량을 확인했다. 현재 설정의 cpu_ms=1000으로 검증하려면 Paid 전환이 필요하다.
- R2 구독 승인은 Workers의 별도 월 기본요금 구독 승인으로 간주하지 않는다. 유료 변경/결제는 아직 실행하지 않았다.
- `geupddong-web-preview` Worker 자체, DO queue, 서명 secret 생성/등록, R2 cache populate, D1 tag schema, 원격 배포는 아직 미실행.
- 운영 Pages·DNS·미니 PC·MySQL·API는 그대로다. 생성한 두 자원은 preview 전용이며 운영 자원과 공유하지 않는다.
- 운영 API는 아직 feature 지역 projection/sitemap ID endpoint가 미배포 상태다. 현 상태의 운영 API에 연결해 전체 SEO 통과라고 보고하면 안 된다.
- API CORS와 OAuth 복귀 주소는 운영 origin 기준이다. 미리보기 주소 전체 허용·wildcard credential CORS로 임의 완화하지 않는다. 실제 인증 회귀는 별도 승인된 테스트 구성 또는 운영 전환 계획이 필요하다.
- Windows의 OpenNext build symlink 제약을 피하려면 Linux CI 빌드 산출물을 전달하는 경로를 준비한다. 현재 CI는 검증/dry-run만 수행하며 Cloudflare 인증정보가 없다.

## 무료 플랜 우선 검증으로 정정

사용자는 유료 전환 전에 실제 필요성과 비용을 안내받기로 했다. Free를 유지한다.
앞의 1000ms는 측정된 CPU 사용량이 아니라 임의로 설정한 허용 상한이었다. 이것만으로 유료 필수라고 판단할 수 없다.
설정의 유료용 cpu_ms override를 제거하고 계정 Free 기본 제한을 따른다. 무료 요청 수/CPU 제한에 걸리면 오류를 보고하며 자동 업그레이드하지 않는다.
R2의 별도 무료 한도 초과 과금은 이미 승인된 구독 조건이며 Workers Free와 구분한다.
Linux 검증 CI에 3일 보관 build artifact를 추가했다. 배포는 로컬에서 별도 수행하며 Cloudflare OAuth를 GitHub에 보내지 않는다.

## 다음 순서

1. Workers Free에서 미리보기 runtime 검증. 유료 필요성은 실제 오류/측정 후 판단.
2. secret을 포함하지 않는 Linux 빌드 산출물 전달 준비.
3. 미리보기 cache schema/secret/Worker 연결 후 runtime 검증.
4. 실제 API projection·sitemap 및 지도 도메인·인증의 미완료 사항을 분리해 검증.
5. 운영 배포 전 코드 검토·승인과 rollback 계획 확인.

생성한 cache 자원은 삭제 가능하지만 사용을 시작한 후 삭제하면 cache 정보가 사라진다. 자동 삭제/운영 DB 정리는 하지 않는다.
