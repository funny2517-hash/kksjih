# 설치 없이 앱 열기

1. GitHub에 로그인한 상태로 [앱 ZIP 다운로드](https://github.com/funny2517-hash/kksjih/raw/refs/heads/main/downloads/our-korea.zip)를 누르세요.
2. 받은 `our-korea.zip`의 압축을 풉니다.
3. 안에 있는 `index.html`을 Chrome 또는 Edge로 여세요.

시·도 → 시·군·구의 두 단계 지도, 최종 지역 사진 기록, 네모 휴게소의 상·하행 탭별 사진 기록, 백업·복원이 포함된 완성본입니다. 지도 데이터도 파일에 들어 있습니다. 기록은 각 브라우저에 따로 저장됩니다. 예전 앱에 저장한 기록이 있다면 먼저 백업한 뒤 새 파일에서 복원하세요.

다운로드 링크에서 404가 나오면 이 저장소를 볼 수 있는 GitHub 계정으로 로그인했는지 확인하세요. 파일 페이지의 **Download raw file** 버튼으로도 받을 수 있습니다.

## 웹사이트 주소 만들기

압축을 푼 폴더 전체(`index.html`이 들어 있는 폴더)를 [Netlify Drop](https://app.netlify.com/drop)에 올리면 웹 주소가 만들어집니다. GitHub 저장소에 파일을 올리는 것만으로 웹사이트가 자동 공개되지는 않습니다.

## 완성본 갱신

프로젝트 루트에서 `npm ci`, `npm run build:standalone`을 실행하면 최신 `dist/our-korea.html`이 만들어집니다. `downloads/index.html`은 그 파일을 복사한 배포용 스냅샷이며, `downloads/our-korea.zip`은 해당 HTML 하나만 담은 파일입니다. 소스를 수정한 뒤에는 다운로드용 파일도 함께 갱신하세요.
