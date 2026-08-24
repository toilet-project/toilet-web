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

React 19 · TypeScript · Vite · Kakao Maps SDK

## 로컬 실행

```bash
pnpm install
pnpm dev
```

`.env`에 아래 값을 설정합니다. 실제 키는 커밋하지 않습니다.

```dotenv
VITE_KAKAO_JAVASCRIPT_KEY=...
VITE_API_BASE_URL=https://api.geupddong.com
```

## 검증

```bash
pnpm run build
pnpm run lint
```
