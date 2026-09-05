# Next.js 전환 회귀 체크리스트

2026-09-05 · 체크되지 않은 항목은 아직 실행하지 않았거나 통과 근거가 없는 항목이다.
기준 웹 main `2d5ba46`. 모바일 390px·데스크탑 1440px, 지원 브라우저 실제 SDK 확인과 모의 검증을 분리한다.

## 기존 동작

### Workers 실행 환경 1차 검증 (상세 URL·실제 지도 회귀와 별도)

- [x] Next 16.3.4 production build, TypeScript, oxlint 0건
- [x] 주소 10건 + 전환 구조 5건 단위/구성 테스트 통과
- [x] Linux OpenNext 1.20.6 Worker 변환 성공
- [x] Wrangler 업로드 없는 dry-run 성공 (gzip 876.71 KiB, d4ac8e7 기준)
- [x] 로컬 production HTTP: 홈/정책 3개/마커 이미지 200, 없는 URL 및 정책 404
- [x] preview noindex 및 X-Frame-Options 등 보안 헤더 확인
- [ ] 실제 Kakao SDK·브라우저 화면/사용자 상호작용·OAuth 회귀

근거: [Linux 실행 33952767703](https://github.com/toilet-project/toilet-web/actions/runs/33952767703).
빌드에는 컴파일 전용 가짜 Kakao 키를 사용했으므로 실제 지도 성공으로 간주하지 않는다.

### 사용자 동작

- [x] 주소 표시 기존 단위 테스트 10건: 도로명 우선·지번 fallback·원본 보존
- [ ] 홈 접속·지도 로딩·기존 로고/폰트/CSS·보안 헤더
- [ ] 지도 drag/zoom → idle → 180ms debounce bounds 목록 호출, 최신 응답만 반영
- [ ] 마커·동일좌표 그룹·화면 격자·서버 클러스터
- [ ] 클러스터 클릭 확대·좌표 목록, 많은 항목(71건)의 카드 높이·스크롤
- [ ] 동일 이름 그룹 + 층수 내림차순
- [ ] 단일 마커 클릭·선택 강조·지도 기준점 이동 억제
- [ ] 데스크탑 상시 목록 및 클릭 시 지도 이동 없음
- [ ] 모바일 목록 클릭 이동·카드/목록 배타 표시·닫기 핸들
- [ ] level 7 이상 확대 안내, 목록 fetch/렌더 제한, 수량·클러스터 유지
- [ ] 기준점은 초기/검색/지도 클릭/현재위치만 변경
- [ ] 현재 위치 허용/거부/timeout/Permissions API 없음/watch cleanup
- [ ] 검색 2자 제한·debounce·키보드/마우스 선택·늦은 응답 무시
- [ ] 상세 카드 잘림·마커 가림 방지·그룹 펼친 항목 이름 노출
- [ ] 도로명/지번 한 주소, 긴 이름·시설 위치·미제공 값
- [ ] API 장애 시 기존 목록·마지막 갱신 안내·복구
- [ ] 로그인·토큰 refresh·동의·로그아웃·내 제보·알림·계정 UI
- [ ] 로그인 후 제보 복귀와 URL 선택 복귀
- [ ] 위치 제보 지도/주황 핀·주소 확인·접수 전 지도 확인, 모바일 입력 확대 방지
- [ ] 정책 3개 URL 직접 접속/새로고침, 정책→지도 복귀

## 신규 URL·지도 수명

- [ ] / → A → B → 뒤로 A → 뒤로 / → 앞으로 A → 앞으로 B
- [ ] 일반 마커·단일 목록·그룹 내 상세 각각 /toilet/id
- [ ] URL 변경에서 document navigation 0, SDK load/map constructor 추가 0
- [ ] URL 변경으로 map center/level/bounds 유지, 불필요한 목록 fetch/전체 overlay 초기화 0
- [ ] 동일 id 재선택 중복 history 억제·빠른 A/B 응답 역전 방지
- [ ] 닫기·지도 상호작용으로 해제 시 URL과 실제 카드 상태 일치
- [ ] 직접 id 접속·새로고침: 시설 위치 중심, 최초 geolocation이 덮어쓰지 않음
- [ ] 직접 id 접속: 목록 밖/클러스터 묶인 시설도 선택 표시
- [ ] 없는 id·잘못된 id HTTP 404, upstream 장애는 404로 오인하지 않음
- [ ] 좌표 없는 시설: 허위 지도 핀 생성 없음
- [ ] hydration 경고·서버 window/document/navigator 참조 오류 없음

## 서버 HTML·SEO·캐시

- [ ] JS 실행 전 일반 HTTP 응답에 title/description/canonical·이름/주소/상세/지역
- [ ] 실제 검증된 region만 노출, source가 바뀐 오래된 판정은 생략
- [ ] SSR 콘텐츠가 실제 UI에도 의미 있게 노출, SEO 숨김 복제 없음
- [ ] Place JSON-LD 실제 필드만 사용, script injection escape
- [ ] sitemap index/shard 전체 ID 커버·중복/없는 URL/규격 초과 없음
- [ ] /region 경로 미생성·robots의 /toilet 허용
- [ ] next build 성공·TypeScript·oxlint 통과, 수만 건 상세 prebuild 없음
- [ ] production cold → HIT 때 원본 상세 요청 카운터 비교
- [ ] page/metadata/client의 요청 수 구분 및 남는 중복 명시
- [ ] 유효/무효 서명 revalidation, 갱신 후 HTML·metadata·지역 동시 반영
- [ ] 캐시 오류/404·원본 5xx·동시 요청·재시작/배포 캐시 정책
- [ ] 로그인 쿠키/사용자 응답의 공용 ISR 캐시 혼입 없음
- [ ] 선택한 배포 runtime의 preview에서 실제 SDK·SSR/ISR·OAuth 검증

## 운영 전환

- [ ] API 확장 호환·DB view 신선도 테스트
- [ ] 운영 build/캐시 설정 검증 후 사용자 코드·배포 승인
- [ ] 기존 정적 웹 rollback 가능 상태 유지
- [ ] WBS·최종 보고서에 실제/모의/미실행 결과 구분
