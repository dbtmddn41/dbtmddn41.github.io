# Seungwoo Lyu — personal site

빌드 도구 없는 정적 사이트예요. `index.html`, `assets/css/style.css`, `assets/js/main.js`와 이미지 몇 개가 전부고, JS가 꺼져 있어도 내용은 그대로 보여요.

## 로컬에서 보기

```bash
python3 -m http.server 4173
```

브라우저에서 http://localhost:4173 을 열면 돼요.

## 자주 고칠 곳

| 하고 싶은 것 | 위치 |
| --- | --- |
| 프로필 사진 | `assets/img/profile.jpg` (지금은 LinkedIn 프로필 사진, 800×800). 정사각형으로 잘려 들어가요 |
| 소개 문단 | `#about`의 `<div class="bio">` |
| CV / Google Scholar 링크 | `#about`의 `<ul class="links">`에 있는 주석을 풀어요. CV는 전화번호를 뺀 버전을 `assets/cv.pdf`로 넣는 걸 권장해요 |
| 논문 추가 | `#publications`에서 `<li class="pub">` 블록을 복사해요. 최신순이고, 채택 전 논문은 아래 Preprints 목록에 넣어요 |
| 논문 그림 | `assets/img/pubs/`에 넣어요. 썸네일 `<a class="pub-thumb">`의 `href`와 첫 번째 `<img>`가 대표 그림이고, `data-alt`와 `class="thumb-alt"` 이미지는 마우스를 올리면 타일 단위로 디코딩되는 두 번째 그림이에요. 썸네일은 16:10으로 잘리니 `style="object-position: …"`로 위치를 고르거나 `class="is-contain"`으로 전체를 보이게 해요. 타일도 이 값을 그대로 따라가요 |
| TL;DR | 각 논문의 `<p class="tldr">` |
| 디코딩되는 글자 | `data-decode`가 붙은 요소(이름, 소속 줄)는 단어 조각 단위로, `data-decode="words"`인 소개 문단은 단어 단위로 처음 열 때 디코딩돼요. `data-decode="view"`가 붙은 섹션 제목은 화면에 들어올 때 디코딩돼요. 빼고 싶으면 속성만 지우면 돼요 |
| 링크 미리보기 이미지 | `assets/img/og.jpg` (1200×630). 카카오톡·슬랙·링크드인에 링크를 붙이면 나오는 카드예요. 사진 자리는 마스크 타일로 가려 두었어요. 고치려면 `tools/og-card.html`을 수정한 뒤 아래 명령으로 다시 렌더링해요 |
| 색·폰트 | `style.css` 맨 위 `:root` 토큰. 다크 모드 값은 바로 아래 두 블록에 같이 있어요. 마스크 색은 `--mask`(글자·사진)와 `--figure-mask`(논문 그림 타일)예요 |

논문 그림 출처: CRIT은 arXiv Figure 1·2, OpenSafeIntent는 arXiv Figure 1·3, DDSPO는 프로젝트 페이지의 정성 비교 그림, Revisiting Task Vectors는 논문 PDF의 Figure 1·3, Elastic-MDM은 PDF의 Figure 1·2예요.

링크 미리보기 카드 다시 만들기 (2배로 렌더링한 뒤 1200×630으로 줄여서 `assets/img/og.jpg`로 저장해요):

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars --window-size=1200,630 --force-device-scale-factor=2 --virtual-time-budget=8000 --screenshot=og@2x.png "file://$PWD/tools/og-card.html"
```

## 들어 있는 디테일

모든 디테일이 한 가지 규칙을 따라요. masked diffusion 모델이 글을 쓰듯, 단위(단어 조각, 사진 타일, 그림 타일, 메뉴 칸)가 노이즈 마스크로 시작해 무작위 순서로 풀리고, 풀리는 비율은 MaskGIT의 cosine schedule을 따라요.

- **처음 열 때**: 이름·소속·소개·사진이 14단계에 걸쳐 함께 디코딩돼요. 사진 뒤의 점 필드, 브라우저 탭 제목, 파비콘도 같은 박자로 디코딩돼요. 마스크에는 은은하게 지글거리는 노이즈 결이 있어요.
- **사진 뒤 필드**: 사진 뒤에서 masked diffusion 샘플러가 계속 돌아가요. 여덟 줄의 점이 느린 파도를 타며 흐르고(데이터), 마스크된 점은 회색으로 자기 자리 주변을 노이즈처럼 떠돌아요. 점마다 자기 시계로 마스크와 언마스크를 오가고, 전체에서 언마스크된 비율은 26초 주기로 숨 쉬듯 바뀌어요. 그래서 늘 움직이지만 한꺼번에 움직이지는 않아요. 처음 열 때는 글자와 같은 14단계로 디코딩되며 같은 파란 반짝임을 내요. 커서가 닿는 점은 바로 디코딩되고 줄이 커서를 살짝 피해 휘어요. 지나간 자리는 잠시 뒤 다시 노이즈로 가라앉아요. 사진 아래 작은 버튼(또는 ⌘K)으로 멈출 수 있고, 선택은 기억돼요. 화면 밖이거나 탭이 가려지면 멈추고, 가만히 있을 때는 30fps, 커서가 있을 때만 60fps로 그려요.
- **섹션 제목**: 화면에 들어올 때 한 번 디코딩돼요.
- **메뉴**: 항목마다 다섯 칸짜리 토큰이 있어요. 현재 섹션의 칸이 무작위 순서로 켜지고, 마우스를 올리면 회색 마스크 칸이 보여요. 항목을 누르면 토큰이 도착할 제목의 단어 조각 수만큼 쪼개져요. 조각들은 스크롤과 같은 곡선으로 날아가, 스크롤이 끝나는 순간 제목의 마스크 자리에 정확히 내려앉고, 그때 제목이 디코딩돼요. 로고를 누르면 로고의 파란 막대가 이름으로 날아가요. 스크롤이나 키 입력으로 중간에 끊어도 깔끔하게 정리돼요.
- **논문 썸네일**: 다섯 편 모두 썸네일에 마우스를 올리면 두 번째 그림이 8×5 정사각 타일 단위로 노이즈를 거쳐 디코딩되고, 떼면 조용히 빠르게 돌아가요. 썸네일 자체에 올렸을 때만 반응해요. 타일은 그림을 썸네일 크기로 한 번 그려 둔 것을 잘라 쓰기 때문에 가는 그래프 선도 원본처럼 선명해요. 누르면 그림 뷰어가 열리고 ← →로 모든 그림을 넘겨 볼 수 있어요.
- **테마 전환**: 새 테마가 화면 셀 단위로 cosine schedule에 맞춰 드러나요. 세로 화면에서는 셀이 정사각에 가깝도록 다른 격자를 써요. View Transitions를 지원하는 브라우저에서 동작해요.
- **작은 것들**: 섹션 제목에 마우스를 올리면 나오는 `#`을 누르면 그 섹션 링크가 복사돼요. 텍스트를 선택하면 마스크 색으로 칠해지고, 푸터에는 서울 현재 시각이 있어요. TL;DR·BibTeX 펼치기, BibTeX 복사 확인("Copied"), ⌘K(또는 Ctrl K, `/`) 검색(이메일 복사도 여기서 돼요), 맨 위로 버튼도 있어요.
- **움직임 줄이기**: OS에서 이 설정을 켜면 마스크와 애니메이션이 모두 꺼지고 바로 이동해요.

`assets/img/noise.png`(마스크 노이즈)와 `assets/img/dissolve*.png`(테마 전환 격자)는 이 효과들에 쓰는 작은 텍스처예요. `python3 tools/make_textures.py assets/img`로 다시 만들 수 있어요 (Pillow 필요).

## GitHub Pages 배포

https://github.com/dbtmddn41/dbtmddn41.github.io 저장소의 `main` 브랜치 루트가 그대로 https://dbtmddn41.github.io 로 배포돼요. 파일을 고쳐 push하면 1~2분 뒤 반영돼요. `.claude/` 폴더는 로컬 미리보기용이라 저장소에는 올리지 않아요.
