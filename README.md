# 급똥 웹

공공데이터 기반으로 내 주변 공중화장실을 지도에서 빠르게 찾는 웹 클라이언트입니다.

## 서비스

- 운영 주소: [https://geupddong.com](https://geupddong.com)
- Public API: [https://api.geupddong.com](https://api.geupddong.com)
- 아키텍처: [docs/architecture-v2.md](https://github.com/toilet-project/docs/blob/main/architecture-v2.md)

## 기능

- 카카오맵 지도와 주소·장소 검색
- 현재 위치 권한 및 실시간 위치 갱신
- 지도 범위·줌 레벨 기반 공중화장실 마커/클러스터
- 마커 상세 카드, 주소 복사, 편의·안전시설, 거리 표시
- 모바일·데스크톱 반응형 UI

## 기술

Next.js 16 App Router · React 19 · TypeScript · Kakao Maps SDK · Cloudflare Workers/OpenNext

> 전환 작업 중인 피처입니다. 운영은 아직 기존 Cloudflare Pages입니다.
> [전환 계획](docs/nextjs-migration-plan.md) · [회귀 검증 목록](docs/nextjs-regression-checklist.md)

## 로컬 실행

```bash
pnpm install
pnpm dev
```

`.env.local`에 아래 값을 설정합니다. 실제 키는 커밋하지 않습니다.

```dotenv
NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY=...
NEXT_PUBLIC_API_BASE_URL=https://api.geupddong.com
SITE_INDEXABLE=false
```

## 검증

```bash
pnpm run build
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build:workers
```

Workers 변환은 Linux CI에서 검증합니다. Windows에서는 Next build가 성공해도
OpenNext의 심볼릭 링크 생성 권한 문제로 변환이 실패할 수 있습니다.
`pnpm preview`는 로컬 Workers 미리보기이며 실제 배포 명령과 다릅니다.

### 배포 안전성

- `wrangler.jsonc`는 **미리보기 전용** Worker·캐시 이름이며 운영 route/DNS를 포함하지 않습니다.
- `NEXT_PUBLIC_*`는 빌드 때 공개 번들에 포함됩니다. REST API 비밀키를 넣지 않습니다.
- `SITE_INDEXABLE`도 빌드 시 적용됩니다. preview는 noindex, 운영 빌드에서만 true입니다.
- 현재 R2·갱신 큐 설정은 준비 단계입니다. 자원 생성·배포 전 계정의 유료 플랜/사용량을 확인합니다.
- 요청당 CPU 1,000ms 제한은 실측 전 보호 설정이지 월 지출 상한이 아닙니다.
- CI의 Kakao 키는 컴파일 검증용 가짜 값입니다. CI 결과를 실제 지도 검증 또는 배포 파일로 사용하지 않습니다.
- `deploy:workers`는 원격 변경 명령입니다. 현재 단계에서는 실행하지 않습니다.
