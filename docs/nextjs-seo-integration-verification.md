# 지역정보·사이트맵 실제 연동 검증

2026-09-05 · WBS [#186](https://github.com/toilet-project/toilet-web/issues/186)

## 배포 범위

- API [PR #81](https://github.com/toilet-project/toilet-api/pull/81): 사용자 명시 승인 후 main 병합, `3d0704201ef86c80c32a1854c6c32803daae4eb4`. develop도 fast-forward 동기화.
- [API CI/CD 33965035722](https://github.com/toilet-project/toilet-api/actions/runs/33965035722) 및 main CodeQL 성공.
- Web `feature/nextjs-toilet-seo`의 `f4ed27b551b2e9b549d5f591db86627e3a22a2d9`, [Linux CI 33964503052](https://github.com/toilet-project/toilet-web/actions/runs/33964503052) 산출물 배포.
- Worker `geupddong-web-preview`, version `61b2157f-e231-44c8-b663-088f2beb705e`, [미리보기](https://preview.geupddong.com).
- 기존 geupddong.com Pages 유지. Web main 전환, Paid 가입, 원본 DB 업데이트, 재지오코딩, 신규 DDL/인덱스 없음. 캐시 outbox 테이블·트리거·dispatcher는 API PR에서 제외.

## 자동 검사

| 범위 | 결과 |
| --- | --- |
| Web unit | 35건 통과 |
| Web lint / typecheck | 통과, lint 경고 없음 |
| Web production smoke | indexable/noindex 모드 모두 CI 통과 |
| OpenNext build / Wrangler dry-run | Linux CI 통과 |
| API service/controller | 16건 통과 |
| API disposable MySQL | region 4건 + sitemap 3건 통과 |
| PR 보안 검사 | CodeQL 통과 |

MySQL region 검사는 실제 V8 view와 Spring Data native projection을 사용한다. 시→구/세종, nullable 주소, 미검증 4상태, 좌표·주소 stale 8경로를 포함한다. sitemap은 sparse ID·경계·삭제·빈 데이터·1만 ID 상한·PRIMARY range 실행계획을 검사한다.

## 운영 DB 읽기 전용 사전 점검

기존 API 컨테이너의 DB identity로 SELECT/EXPLAIN을 read-only transaction에서 수행했다. 비밀번호를 출력/문서에 기록하지 않았다.

- 전체 화장실 및 sitemap 대상: **53,582건**.
- 현재 좌표·두 주소와 일치하는 VERIFIED view: **51,985건**.
- 지역 단건: toilet/region 양쪽 PRIMARY const 접근(각 1행).
- sitemap ID 구간: PRIMARY range, covering index.
- 구간 집계: PRIMARY range + temporary/filesort. 결과 구간 수에 LIMIT을 걸지만 원본 스캔 행 수 상한은 아니다. 현재 집계 client 왕복 113ms(순수 DB 시간/Worker CPU 시간 아님). 데이터가 커지면 재점검한다.

## 실제 API → preview 서버 HTML / XML 대조

재현: `node --experimental-strip-types scripts/verify-preview-seo.mjs 53582`.
숫자는 실행 직전 읽기 전용으로 확인한 DB 건수다. 운영 데이터가 늘면 최신 건수로 변경한다. 현재 검증은 최대 10개 구간과 상세 5건으로 제한하며 상세 전국 전수 호출을 하지 않는다.

| 구간 | API ID와 XML URL 일치 |
| --- | ---: |
| 0 | 10,000 |
| 1 | 10,000 |
| 2 | 10,000 |
| 3 | 10,000 |
| 4 | 10,000 |
| 5 | 3,582 |
| 합계 | **53,582 — 중복/누락 없음** |

인덱스의 정적 sitemap + 6개 분할 링크, 정렬·ID 범위, XML 크기, 허위 lastmod 없음, 운영 canonical을 검사했다. preview 자체는 `noindex, nofollow` 및 robots `Disallow: /` 유지하고 robots에 sitemap을 광고하지 않는다.

| 표본 ID | API / HTML title / Place JSON-LD |
| --- | --- |
| 13448 | 대전광역시 유성구 |
| 28654 | 충청남도 천안시 서북구, city/district 보존 |
| 14766 | 경기도 수원시 영통구, city/district 보존 |
| 45938 | 세종특별자치시, 하위 지역명 null 유지(코드 36110 보존) |
| 78 | region null, 주소 문자열로 지역을 만들지 않음 |

다섯 상세 응답 200, 최초 표본 MISS. 별도 HTTP 재검사에서 STALE 응답 이후 HIT 확인. HTML/robots/잘못된 상세 ID 404 통과. 이 결과는 모든 지역에서 즉시 HIT 또는 무료 CPU 한도를 보장하는 부하검사가 아니다.

API `/api/health` 200으로 DB 연결 확인. 공개 `/actuator/health`는 Nginx 404인 경로여서 건강 상태 판단에 사용하지 않았다. Google/Kakao 별도 익명 세션의 로그인 시작 302, 취소 시 preview 복귀, 임의 returnTo 400 재검사 통과. 이전 단계의 사용자 직접 로그인 성공 확인과 별개이며 이번에 신규 회원가입/제보/탈퇴를 실행하지 않았다.

## 목록 구분 표시 수정

API의 북유성IC주유소(13448)는 목록과 상세 모두 개방화장실이었다. 단일 좌표 그룹을 목록 대표 항목으로 변환할 때 toiletType이 빠져 화면 fallback인 공중화장실이 표시됐던 것이 원인이다.

`src/lib/toiletGrouping.ts`의 공용 변환으로 desktop/mobile 모두 원래 category를 보존한다. 3개 회귀 테스트(단일/같은 좌표 복수/값 없음)를 추가했다. 배포 후 Chrome 데스크탑 목록과 상세 양쪽 모두 **개방화장실**, 주변 14곳과 지도 타일·마커, 로그인 상태, 상세 지역정보 표시를 확인했다. 모바일는 같은 변환 경로의 코드/자동 테스트 검증이며 실제 iPhone 전체 회귀와 구분한다.

## 남은 항목과 롤백

- 상시 캐시 갱신 secret·Spring outbox 연결 및 원본 변경→콘텐츠 갱신 end-to-end.
- 모바일 전체 회귀, 신규 가입 동의·제보 복귀, 반복/동시 부하와 실제 Worker CPU 사용량 검증.
- 최종 코드 검토와 기존 Pages→Workers 본 도메인 전환 승인. WBS 전체는 진행 중이다.
- 기존 CI action major/Node 20 deprecated 안내가 남아 있다. 이번 배포 실패는 아니며 별도 CI 유지보수로 업데이트한다.

문제 시 API는 PR #81 변경을 되돌리는 검토된 revert 배포, preview는 이전 정상 Worker 버전으로 되돌릴 수 있다. 이번 API에는 스키마 변경이 없어 DB down migration은 없다. 자동 롤백이나 운영 데이터 삭제를 실행하지 않았다.

## 후속: 메타데이터의 화장실 식별 문구

사용자 확인에 따라 이름에 ‘화장실’이 없는 경우에만 metadata 표시 이름에 ‘화장실’을 붙였다. 기존 명칭·지도 표시·Place.name·DB는 보존한다. title/description 및 OG/Twitter 제목·설명은 같은 함수의 결과를 사용한다.

- 소스 `e57ba90215443d9f63ad59f7d1e639f4a3a3ce1d`, [CI 33965729220](https://github.com/toilet-project/toilet-web/actions/runs/33965729220) 성공.
- 자동 테스트 38건, lint/typecheck, 두 production smoke 모드의 5개 메타 태그와 title 및 원래 h1 보존 검사 통과.
- preview Worker `b62d8ece-9637-4854-93c7-eb694bcf0fa1` 배포. 운영 웹/API/DB 변경 없음.
- 실제 `/toilet/13144` 서버 HTML 확인: `공학1호관 화장실 위치 및 이용정보 | 대전광역시 유성구 | 급똥`. 표준·OG·Twitter 설명 일치, canonical/noindex 유지, API 및 Place.name은 `공학1호관` 그대로.
