# 지역·시설·다국어 SEO 경로 점검

2026-09-22 · 운영 공개 응답, `toilet-web`/`toilet-api` 현행 코드, Google Search Console 및 Cloudflare 대시보드의 읽기 전용 점검 기준. 아래 관측은 변경 전 운영 상태이고, 이 PR은 지역·시설 링크와 언어별 정식 URL을 함께 갱신한다. 운영 배포 및 색인 결과는 아직 검증되지 않았다.

## 결론

한국어의 기본 골격은 있다. 서버가 시설 HTML·제목·주소·Place를 내보내고, 시설 ID와 행정구역 코드로 정식 URL을 만들며, 사이트맵과 `robots.txt`가 운영에서 열린다. **현재 색인 지연의 직접적인 관측 상태는 약 5.36만 URL이 발견됐지만 크롤링되지 않은 것**이다. 한국어 상세 표본의 Google 실시간 검사는 수집·색인을 모두 허용했다. 다국어 지역 페이지는 색인 허용, 다국어 시설 상세는 색인 차단 상태라 국제 검색용 경로도 일관되지 않다. 정식 URL을 다시 바꾸거나 캐시를 30일로 늘리기 전에 색인 대상 URL·번역 자격·변경 처리를 확정해야 한다.

## Google과 Cloudflare의 실제 관측

| 확인 항목 | 2026-09-22 관측 | 해석과 한계 |
| --- | --- | --- |
| Search Console 페이지 색인 보고서 | 최종 업데이트 9월 18일. 색인 2개(`/`, `/toilet/2088`), '발견됨 - 현재 색인이 생성되지 않음' 53,585개, '크롤링됨 - 현재 색인이 생성되지 않음' 1개(`/toilet/53591`) | 대다수는 품질 평가나 `noindex` 단계 이전에 아직 방문되지 않았다. 보고서가 최신 URL 배포를 따라잡지 못했을 수 있다. |
| Google 실시간 URL 검사 | 한국어 지역 시설 `/regions/30/30200/toilet/13144-gonghak1hogwan`: 모바일 Googlebot 수집 허용, 페이지 가져오기 성공, 색인 생성 허용, 선언된 canonical 자기 URL | 해당 시점의 이 표본에서는 robots·Cloudflare·`noindex`가 막지 않았다. 실제 색인 보장은 아니며 전체 URL의 상태를 대변하지 않는다. |
| Search Console 사이트맵 | `/sitemap.xml` 성공, 발견 52,717개. 인덱스 마지막 읽기 9월 16일, 지역 페이지 사이트맵 마지막 읽기 9월 18일(당시 4개), 시설 shard는 9월 16~22일에 각각 읽음 | 현재 공개 `/pages-sitemap.xml`의 1,642개 및 새 지역 시설 경로와 보고서 사이에 시간차가 있다. 제출 성공은 상세 페이지 크롤링·색인을 보장하지 않는다. |
| Search Console 크롤링 통계 | 지난 90일 전체 368회, 그중 본 도메인 232회. 본 도메인 최근 90일 호스트 문제 없음, 평균 응답 176ms, 200 응답 94%, HTML 14%, 발견용 크롤링 4% | 5만여 URL에 비해 실제 페이지 수집량이 적다. 401/407 4%는 전체 도메인 합산으로, 본 도메인 표에는 나타나지 않는다. |
| Cloudflare Security | 현재 사용자 정의 규칙 0개, rate limiting 규칙 0개, Bot Fight Mode 꺼짐. 최근 24시간 약 142,520 요청 중 43건 차단, 이벤트 표본은 네덜란드 IP 한 곳의 Managed rules 차단 | 확인한 기간·표본에서는 Googlebot 차단 증거가 없다. 과거 전체 요청이나 샘플 밖의 간헐적 이벤트까지 배제하는 것은 아니다. 현 단계의 보안 설정 완화 근거가 없다. |

색인 보고서에서 아직 색인된 `/toilet/2088`은 구형 ID 경로다. 현재 새 지역 canonical이 색인되지 않았다는 관측에는 **최근 경로 변경과 보고서/사이트맵 읽기 지연**이 섞여 있다. 53,585개를 새 경로의 거부 건수로 해석하면 안 된다. 지역 페이지에서 시설로 이어지는 서버 HTML 링크가 없고 시설 링크가 지도 상호작용 뒤에만 나타나는 점은 발견·우선순위의 구조적 약점이다. Google의 정확한 크롤링 우선순위 결정 원인은 외부에서 단정할 수 없다.

| 공개 표본 | 운영 응답 | 의미 |
| --- | --- | --- |
| `/`, `/regions/30/30200`, `/regions/30/30200/toilet/13144-gonghak1hogwan` | `index, follow`, 자기 URL canonical | 한국어 홈·지역·시설은 색인 대상 |
| `/en` 및 `/ja/toilet/13144` | `noindex, nofollow` | 다국어 지도 홈·기본 상세는 검색 노출 차단 |
| `/ja/regions/30/30200`, `/zh-tw/regions/30/30200` | `index, follow`, 자기 URL canonical, 6개 언어 hreflang | 번역 검수 전인데도 지역 페이지는 색인 대상 |
| `/ja/regions/30/30200/toilet/13144-gonghak1hogwan` | `noindex, nofollow`, 자기 URL canonical, 6개 언어 hreflang | 일본어 시설의 정식 URL까지 검색 노출 차단 |
| `/pages-sitemap.xml` | 1,642개 `<loc>`, 6개 언어의 지역 경로 포함 | 시설 상세가 차단된 언어의 지역 페이지만 사이트맵에 제출 |
| `/sitemap-toilets-1.xml` | 표본 shard에 9,977개 `<loc>`, 한국어 시설 URL만 포함 | 다국어 시설 URL은 사이트맵으로 제출하지 않음 |

영어 지도 레이아웃과 일본어·중국어 지도 레이아웃의 `noindex`는 UI 선공개 때 의도한 임시 게이트다. 반면 지역 페이지 라우트는 그 레이아웃 **밖**에 있어 운영의 전역 색인 허용을 상속한다. `regionMetadata`와 `regionToiletMetadata`는 현재 6개 언어를 모두 hreflang으로 연결한다. 그래서 언어별로 서로 다른 색인 신호가 한 URL 묶음에 섞인다. Google의 `noindex`는 검색 결과에서 제외하는 명시적 규칙이다. 한국어 상세의 지연과 다국어 상세의 명시적 차단은 구분해야 한다.

## 언어별 이름을 넣는 정식 URL 계약

변경 전 `regionPath()`는 지역 코드만 내고 `regionToiletPath()`는 **한국어 이름을 로마자로 바꾼 동일한 slug**를 모든 언어에 재사용했다. 이 PR은 각 언어의 지역명과 시설 번역명을 URL에 함께 사용한다. 예시는 형식 설명용이며 실제 시설 번역과 대조해서 생성한다.

| 언어 | 지역 경로 예시 | 시설 경로의 마지막 부분 |
| --- | --- | --- |
| 한국어 | `/regions/대전광역시-30/유성구-30200` | `/toilet/13144-공학1호관` |
| 영어 | `/en/regions/daejeon-30/yuseong-gu-30200` | `/toilet/13144-{영어-시설명}` |
| 일본어 | `/ja/regions/大田-30/儒城区-30200` | `/toilet/13144-{일본어-시설명}` |
| 중국어 간체 | `/zh-cn/regions/大田-30/儒城区-30200` | `/toilet/13144-{간체-시설명}` |
| 중국어 번체 | `/zh-tw/regions/大田-30/儒城區-30200` | `/toilet/13144-{대만-번역명}` |

위 일본어·중국어 구명도 현재 `names.json`의 실제 값을 배포 전에 사용해야 한다. 표의 임의 번역 문자열을 하드코딩하지 않는다. URL의 지역 코드와 시설 ID는 변경·동명이인에도 동일 대상을 찾기 위한 식별자로 남고, 앞뒤의 이름은 언어별 공개 번역에서 만든다. 한글·한자·가나를 로마자로 강제 변환하지 않고 NFC 정규화, 안전한 구분자, UTF-8 퍼센트 인코딩을 사용한다. 서버는 디코딩한 URL을 검증하고 인코딩·대소문자·이전 이름을 정식 형태로 308 이동한다. 이름 변경 또는 지역 이동 시 옛 경로는 새 경로로 이동하고, sitemap·canonical·hreflang·내부 링크·OG·구조화 데이터는 모두 새 경로를 가리킨다. 번역이 없는 언어는 없는 이름을 지어내지 않고 현재 fallback 정책과 색인 자격에 맞춰 처리한다.

전환 작업에는 코드만 담긴 기존 지역 URL, 로마자 한국어 시설 URL, `/toilet/{id}` 별칭, 언어 전환 버튼을 모두 포함해야 한다. 링크를 같은 문자열에 언어 접두사만 갈아끼우면 영어 페이지에도 한글 slug가 남는다. 번역 갱신이 잦은 시설명까지 URL에 반영하면 308과 캐시 무효화가 반복되므로, 시설 식별은 언제나 ID로 하고 이전 slug의 수용·리디렉션을 유지한다. 새 경로를 검증·배포하기 전까지 이미 제출한 5만여 경로를 일괄 변경하지 않는다.

## 먼저 고칠 구조

1. **색인 자격을 한 곳에서 결정한다.** 운영 한국어는 유지한다. 영어·일본어·중국 간체는 현재 공개 번역의 최신성·누락·보류 상태와 실제 상세 HTML 품질을 점검한 뒤 언어별/시설별로 연다. 대만·홍콩 번체는 다른 중국어 번역을 임의로 대신하지 않는 현 규칙을 유지하고, 한국어 대체가 많은 상태에서 일괄 색인하지 않는다. 미리보기는 계속 전면 `noindex`다. 지역 페이지도 해당 언어의 콘텐츠 준비 정도를 기준으로 함께 판단한다.
2. **정식 URL, robots, 사이트맵, hreflang을 동일 집합으로 맞춘다.** 색인 가능한 각 언어의 시설 페이지는 자기 언어 canonical을 갖고 `index`로 응답해야 한다. 공개 사이트맵에는 같은 canonical만 담고, hreflang은 실제 색인 가능한 대응 URL끼리 상호 연결한다. 번역 누락으로 한국어 원문이 나온 개별 시설은 해당 언어의 sitemap/hreflang에서 제외하고 `noindex`로 둔다. 지도 홈·계정·관리자·정책의 별도 색인 결정은 이 규칙에 섞지 않는다.
3. **언어별 정식 URL의 변경을 한 경로로 처리한다.** 위 계약을 공용 경로 생성기로 만들고, 사이트맵·서버 라우트·언어 전환·내부 링크에서 재사용한다. 현재 한국어 이름 slug와 좌표에 따른 지역 코드가 canonical을 바꿀 수 있다. 지역 시설 라우트는 이전 slug를 새 URL로 308 이동시키지만, 시설 사이트맵은 웹 빌드의 `data/regions/toilet-district.json`에서 경로를 만든다. 원본 DB가 바뀐 뒤 새 웹 빌드 전에는 사이트맵이 이전 URL을 적을 수 있다. API의 공개 시설 ID·현재 지역·언어별 현재 이름(또는 검증된 canonical 경로)을 분할 목록/스냅샷으로 제공하고, 변경 전·후 경로의 페이지 캐시와 사이트맵을 함께 무효화한다. 기존 `/toilet/{id}` 별칭은 canonical을 지역 URL로 가리키는 현재 계약을 유지할지 별도 308로 바꿀지 사용자 흐름을 검증한 뒤 결정한다.
4. **지역에서 시설로 이어지는 실제 링크를 제공한다.** 전국→시·도→구·군은 HTML `<a href>`로 이동할 수 있다. 운영의 구·군 지도 마커는 브라우저에서 버튼으로 만들어지고 시설 링크는 클릭 뒤에만 나타난다. 이 PR은 구·군 페이지에 현재 지도와 동일한 공개 목록으로 서버 렌더링한, 사용자에게 보이는 접이식 시설명 링크를 더한다. 지도 API가 실패하면 존재하지 않는 링크를 만들어내지 않는다. 지역 라우트의 로딩 경계는 서버 HTML을 빈 골격으로 캐시할 수 있어 제거했다. 이후 목록이 큰 지역의 페이징/성능과 API 실패 시 재시도·캐시 정책을 별도로 검증한다. 지도 아래에 검색엔진 전용으로 숨긴 중복 텍스트는 만들지 않는다.
5. **이후에 장기 캐시를 적용한다.** 위 URL·색인 자격·지역 목록의 데이터 형태를 확정한 뒤 지역 지도·페이지를 30일 캐시하고, 이름·좌표·공개 여부·번역·그룹 변경 시 영향 경로와 언어를 무효화한다. 사이트맵에는 실제 수정 시각이 없으므로 임의 `lastmod`를 넣지 않는다.

## 구현·검증 순서

이번 PR은 코드가 있는 지역 경로를 언어별 이름-코드로 바꾸고, 시설 경로는 ID-해당 언어 이름으로 만든다. 사이트맵·canonical·hreflang·링크·구조화 데이터가 같은 생성기를 사용한다. 이전 숫자 지역 경로와 그 아래의 옛 시설 경로는 렌더링 전 프록시에서 단일 308 응답으로 보내며, 새 이름 경로의 지역 페이지는 실제 시설 링크가 포함된 HTML을 낸다. 서버를 통한 검증에는 실제 공공 API 대신 한 시설의 테스트 응답을 사용했다. 검색용 설명에는 외국어로 '무료 화장실을 찾으시나요?'라는 질문을 넣었으며, 개별 시설이 무료라는 주장은 하지 않는다. Google이 무시하는 `meta keywords` 태그는 추가하지 않았다.

영어·일본어·중국어 지도 홈과 상세 페이지의 기존 `noindex` 게이트는 유지했다. 이 때문에 외국어 설명 문구가 곧바로 그 홈/상세 페이지의 검색 노출로 이어지지는 않는다. 지역 페이지는 색인 가능하지만 번역 품질·시설 상세의 언어별 색인 자격과 hreflang 범위를 다시 정해야 한다. 상세의 현재 이름이 바뀌었으나 지역 경로가 동일한 드문 옛 URL은 페이지 자체의 이동 처리에 남는다. 다음 단계에서 공개 번역의 최신성, URL별 robots·사이트맵·hreflang, 30일 캐시 무효화 경로를 함께 맞춘다.

- 읽기 전용 집계로 `VISIBLE` 시설 중 locale별 **최신 공개 번역**이 있는 ID 수, 이름/주소 누락과 원문 대체 수, 지역명 번역 품질을 구한다. 과거 배치 완료 건수만으로 현재 색인 자격을 판단하지 않는다.
- 색인 정책을 중앙화하고 한국어·영어·일본어·중국어 각 지역/시설의 실제 HTML `robots`·canonical·hreflang·`<html lang>`과 XML `<loc>`를 같은 테스트에서 비교한다. 누락 번역, 비공개·삭제, 이름·좌표 이동, 잘못된 slug, preview도 검사한다.
- 사이트맵 분할이 언어 증가 후에도 파일당 5만 URL·50MB 제한에 들고, 503/타임아웃에서 빈 정상 XML을 내지 않는지 확인한다. 배포 후 표본을 Search Console URL 검사로 확인하고 유효 URL/중복 URL/색인 제외 추이를 본다. 사이트맵을 반복 제출하거나 검증을 재시작하는 것만으로 색인이 강제되지는 않는다.
- SEO 경로 계약을 먼저 병합하고, [캐시 재설계안 PR #286](https://github.com/toilet-project/toilet-web/pull/286)의 지역 태그·이전/새 경로 만료를 그 계약에 맞춰 구현한다.

## 근거

- 현행 코드: `src/app/(map)/en/layout.tsx`, `src/app/(map)/[language]/layout.tsx`, `src/app/[language]/regions/[[...parts]]/page.tsx`, `src/components/regions/RegionPage.tsx`, `src/components/regions/RegionToiletPage.tsx`, `src/app/pages-sitemap.xml/route.ts`, `src/app/sitemaps/[file]/route.ts`, `src/lib/regionToiletPath.ts`, `src/components/regions/DistrictNaverMap.tsx`.
- [Search Console 페이지 색인 보고서](https://search.google.com/search-console/index?resource_id=sc-domain%3Ageupddong.com), [사이트맵 보고서](https://search.google.com/search-console/sitemaps?resource_id=sc-domain%3Ageupddong.com), [크롤링 통계](https://search.google.com/search-console/settings/crawl-stats?resource_id=sc-domain%3Ageupddong.com), [Cloudflare Security Analytics](https://dash.cloudflare.com/1611d88218de929b3ed6e2cd7c863be5/geupddong.com/security/analytics).
- [Google: 페이지 색인 보고서 설명](https://support.google.com/webmasters/answer/7440203), [크롤링 예산](https://developers.google.com/crawling/docs/crawl-budget), [noindex 규칙](https://developers.google.com/search/docs/crawling-indexing/block-indexing), [다국어 사이트](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites), [canonical 신호](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [탐색 가능한 링크](https://developers.google.com/search/docs/crawling-indexing/links-crawlable).

## 다음 단계 구현: 시설별 언어 색인 자격

공개 API는 `VISIBLE` 시설 중 한국어 원본의 `source_hash`와 일치하고, 해당 언어의 이름 및 도로명·지번 주소 중 하나가 있는 시설만 외국어 사이트맵에 넣는다. 상세 API도 같은 최신 번역만 응답한다. 웹은 이 응답을 기준으로 외국어 상세의 `robots`·canonical·hreflang을 결정한다. 자격이 없는 언어는 `noindex`, 한국어 canonical을 사용하며 사이트맵과 hreflang에서도 제외한다. 영어·일본어·중국어 각 변형은 개별 번역을 요구한다. 지도 홈의 색인 정책은 그대로 둔다.

한국어와 외국어 시설 사이트맵은 API의 현재 이름·좌표로 경로를 만들기 때문에 웹 빌드에 포함된 옛 이름 스냅샷에 의존하지 않는다. 공개 URL은 `/sitemap-toilets-{shard}.xml` 및 `/sitemap-toilets-{shard}-{locale}.xml`이다. 기존 상세·별칭 경로와 같은 URL 생성기를 사용하고, 번역 변경은 기존 `catalogChanged` 무효화 이벤트와 1시간 원본 캐시 만료로 반영한다. API를 먼저 배포해야 웹이 새 사이트맵 원본을 읽을 수 있다.

실제 운영 DB의 언어별 자격 건수와 Google 색인 여부는 배포 후 확인 대상이다. 이 기준은 번역의 최신성과 이름·주소 존재를 확인하며, 문장 전체의 번역 품질을 자동으로 판정하지는 않는다. 캐시 재설계 PR #286의 30일 지역 지도 정책과 변경 전·후 경로 무효화는 별도로 통합한다.
