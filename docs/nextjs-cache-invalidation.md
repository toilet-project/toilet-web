# 상세 캐시 갱신 단계

2026-09-05 · WBS [#186](https://github.com/toilet-project/toilet-web/issues/186) · **운영 미배포**

## 구현

- 서버 전용 `POST /_internal/cache/revalidate`. 32바이트 이상 전용 secret의 HMAC-SHA256, 5분 시차, 고정 메서드/경로/원문 JSON 서명을 검증한다.
- 본문 최대 4KiB, ID 최대 100개. 임의 URL·tag·전체 캐시 삭제 요청은 받지 않는다. secret 미설정은 503이며 인증이 우회되지 않는다.
- 정확한 ID의 `toilet:{id}`를 `revalidateTag(...,{expire:0})`, 경로를 `revalidatePath('/toilet/{id}')`로 만료시킨다. 목록/전체 홈페이지 캐시는 지우지 않는다. 404→복구 역시 경로 만료로 처리한다.
- tag 갱신 상태는 Workers에서 D1에 저장하도록 구성했다. 현 단계에서는 트래픽 규모에 맞는 단순한 D1 방식을 선택했다. R2 상세 캐시와 기존 DO 갱신 큐는 그대로 유지한다. D1은 업무 DB가 아니며 캐시 태그/시각만 저장한다.
- Workers receiver는 D1 태그 쓰기를 await한 뒤 ACK한다. binding 부재·저장 실패는 503이다. 표준 Next tag/path 만료도 함께 호출한다. 이 추가 저장 확인은 태그 저장 전에 전송 대기열을 삭제하는 일을 피하기 위한 것이다.
- API는 MySQL에 커밋된 변경 ID 대기열을 Spring에서 주기적으로 보내고 실패하면 재시도한다. [API 상세 설계·DDL](https://github.com/toilet-project/toilet-api/blob/feature/toilet-seo-projection/docs/web-cache-invalidation.md)에 설치·해제·롤백·동시 변경 규칙을 기록했다.

## 구성·비밀키

| 위치 | 설정 |
| --- | --- |
| Workers secret | `CACHE_REVALIDATION_SECRET` |
| API secret | `WEB_CACHE_REVALIDATION_SECRET` — 위와 동일한 전용 값 |
| API env | `WEB_CACHE_ORIGIN`, `WEB_CACHE_REVALIDATION_ENABLED`(기본 false) |
| Workers vars | `CACHE_RUNTIME=workers` |
| Workers D1 | `NEXT_TAG_CACHE_D1` / preview 전용 이름, 현재 ID는 placeholder |

secret은 NEXT_PUBLIC 변수·URL·문서·로그에 넣지 않는다. Google/Kakao/JWT 키를 재사용하지 않는다.
실제 D1 생성/ID 설정/secret 주입은 아직 하지 않았다. placeholder일 때 `pnpm deploy:workers`는 사전 검사에서 중단한다. CI의 build/dry-run은 원격 리소스를 만들거나 배포하지 않는다.
승인된 배포에서 OpenNext populate-cache 단계가 D1 `revalidations` 스키마를 준비하도록 한다. preview와 운영 D1·서명 키·수신 origin은 분리한다.

## 검증

- 웹 단위 검사: 정상/중복, 위조 서명/본문 변경, 과거·미래 시각, secret 미설정, 잘못된 ID·배치 크기·태그 주입, 4KiB 제한.
- Java/Node 양쪽에서 동일 HMAC 고정 검증값을 사용한다.
- `pnpm test:detail-production`: 별도 모의 원본과 Node production 서버. 초기 HTML·HIT, 위조 요청 시 기존 캐시 유지, 정상 서명 후 이름/운영시간/지역 동시 반영, 지역 null 반영, 삭제 404·복구 200 검증.
- 실제 Cloudflare Workers/D1 연결과 장애·재배포·다중 리전 검증은 미실행이다. Node smoke 성공을 Workers 운영 검증으로 간주하지 않는다.

## 주의와 다음 단계

- webhook은 새 서버 조회를 갱신한다. 이미 열린 브라우저의 카드와 Next router 메모리 캐시를 실시간 밀어 갱신하는 기능은 아니다.
- fallback TTL 1시간은 절대적 최신성 보장이 아니다. 원본/캐시 저장소 장애 때 stale 응답이 유지될 수 있으므로 운영 대기열/실패 메트릭을 함께 본다.
- 수신자가 파일럿 DB와 연결됐는지 검증 후에만 운영 활성화를 검토한다. 이번 단계에서 운영 DB/secret/DNS/사이트는 변경하지 않는다.
- 남은 기능: 분할 sitemap·robots·구조화 데이터, Workers preview 전체 검증, API 실제 DB projection 확인, OAuth/모바일/제보 회귀, 배포 승인.

## 공식 근거

- [Next revalidateTag](https://nextjs.org/docs/app/api-reference/functions/revalidateTag): 외부 webhook에서는 `{expire:0}`을 사용할 수 있다.
- [OpenNext 캐시 설정](https://opennext.js.org/cloudflare/caching): R2/갱신 큐와 별도로 on-demand 태그 저장소를 구성한다.

설치된 Next 16.3.4/OpenNext 1.20.6 문서와 실제 소스를 함께 확인했다. 버전 업그레이드 시 태그 쓰기 실패/응답 ACK 동작을 다시 검증한다.
