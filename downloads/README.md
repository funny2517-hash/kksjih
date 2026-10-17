# 설치 없이 앱 열기

1. GitHub에 로그인한 상태로 [앱 ZIP 다운로드](https://github.com/funny2517-hash/kksjih/raw/refs/heads/main/downloads/our-korea.zip)를 누르세요.
2. 받은 `our-korea.zip`의 압축을 풉니다.
3. 안에 있는 `index.html`을 Chrome 또는 Edge로 여세요.

시·도 → 시·군·구의 두 단계 지도, 최종 지역 사진 기록, 네모 휴게소의 상·하행 탭별 사진 기록, 백업·복원이 포함된 완성본입니다. 지도 데이터도 파일에 들어 있습니다. 기본 기록은 각 브라우저에 따로 저장되며, 게시한 HTTPS 사이트에서 GitHub를 연결하면 사진과 메모를 저장소에 직접 업로드할 수 있습니다. 예전 앱에 저장한 기록이 있다면 먼저 백업한 뒤 새 파일에서 복원하세요.

다운로드 링크에서 404가 나오면 이 저장소를 볼 수 있는 GitHub 계정으로 로그인했는지 확인하세요. 파일 페이지의 **Download raw file** 버튼으로도 받을 수 있습니다.

## GitHub Pages에서 게시

이미 설정한 `Settings → Pages`를 그대로 사용하세요. `main / (root)`는 완성본 `downloads/`로 이동하고, `main /docs`는 `docs/index.html`로 실행됩니다. GitHub Actions 방식도 지원합니다. 정확한 주소는 Pages의 **Visit site**에서 확인하세요. Google Drive나 Netlify 설정은 필요하지 않습니다.

사진 업로드는 사이트 상단 **GitHub 연결**에서 저장소·브랜치·Contents 읽기/쓰기 전용 토큰을 입력해 사용합니다. 공개 저장소의 사진은 공개됩니다. 비공개 사진은 Pages를 켜지 않은 별도 비공개 저장소를 연결하세요. 자세한 토큰 발급과 두 사람 공유 방법은 루트 README에 있습니다. 토큰은 사이트 탭 메모리에만 보관하며 다시 접속하면 재입력이 필요합니다.

## 완성본 갱신

프로젝트 루트에서 `npm ci`, `npm run build:standalone`을 실행하면 최신 `dist/our-korea.html`이 만들어집니다. `downloads/index.html`은 그 파일을 복사한 배포용 스냅샷이며, `downloads/our-korea.zip`은 해당 HTML 하나만 담은 파일입니다. 소스를 수정한 뒤에는 `node scripts/package-downloads.mjs`로 다운로드용 파일과 `/docs` 배포본을 함께 갱신하고 ZIP도 다시 만드세요.
