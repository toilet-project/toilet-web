# 운영 웹 라우팅과 복구

2026-09-06 · WBS #186 · 사용자 운영 전환 승인 후 적용

## 실제 연결

검증된 운영 Worker `geupddong-web-production`에 `geupddong.com/*`, `www.geupddong.com/*` 두 Route를 연결했다. 기존 Pages 프로젝트·정상 배포·DNS는 보존한다. API/admin/preview에는 이 경로가 적용되지 않는다. Workers Free를 유지한다.

운영 빌드 설정 `wrangler.production.jsonc`는 공개 경로 없는 **빌드/비공개 준비** 설정이다. 실제 공개 경로는 별도 `wrangler.production.routes.jsonc`로 관리한다. 이 파일은 런타임 업로드용이 아니라 `wrangler triggers deploy --config wrangler.production.routes.jsonc` 전용이다. 첫 연결은 동일한 두 route를 CLI 인자로 명시했다.

## 재배포 시 주의

- 운영 중 `wrangler.production.jsonc`로 일반 deploy를 하면 빈 routes 설정이 공개 연결을 해제할 수 있다. 그대로 재실행하지 않는다.
- 승인된 후속 배포에서는 빌드 검증 후 공개 경로를 유지하는 배포 절차를 검토하고, 실제 root/www Route와 runtime 버전을 함께 확인한다. 단순 후보 빌드 성공은 운영 반영이 아니다.
- `wrangler.production.routes.jsonc`에 main, bindings, secret 값, CPU 설정을 넣지 않는다. 이 파일로 런타임을 업로드하지 않는다.
- Pages 자동 production/preview 배포 중지는 유지한다. main 병합이 Pages 배포나 Worker 업로드를 자동 실행한다고 가정하지 않는다.

## 연결만 복구할 경우

1. 현재 Worker route/version과 장애 근거를 기록한다.
2. 이전 Pages 정상 배포가 유지되는지 확인한다.
3. 이 Worker에 추가한 root/www 두 Route만 해제한다. 기존 DNS·Pages·다른 서비스 경로는 삭제하지 않는다. 기존 후보 설정으로 `wrangler triggers deploy --config wrangler.production.jsonc`는 이 Worker의 routes를 비우므로, 그 사이 다른 경로가 추가되지 않았는지 먼저 확인한다.
4. root/www가 기존 Pages로 복구되는지 직접 확인한다. 새 상세 SEO 기능까지 이전 React 앱에 있다고 가정하지 않는다.
5. API 캐시 전송 origin을 preview로 복원하고 API 배포 시 기존 preview 키가 선택되는지 확인한다. 큐/원본 데이터는 보존한다.
6. Discord 감시 대상도 실제 서비스 위치에 맞춘다.

이 기록은 연결 방식과 복구 절차다. 실제 장애를 발생시키거나 복구 리허설까지 완료했다는 뜻은 아니다.
