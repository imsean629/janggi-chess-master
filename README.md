# 장기·체스 마스터

**바로 사용하기: https://imsean629.github.io/janggi-chess-master/**

상대가 실제로 둔 수를 입력하면, 내 차례에 최선의 수 Top 3를 추천해 주는 장기·체스 도우미입니다. PC와 휴대폰 브라우저에서 모두 동작하며, 계산은 전부 기기 안에서 이뤄집니다(서버로 아무것도 보내지 않음).

- 첫 화면에서 **장기** 또는 **체스** 선택 → 내 진영(초/한, 백/흑)과 배치 선택 → 상대 수는 말을 누르고 도착 칸을 눌러 입력
- 추천 수는 판 위 화살표와 점수·예상 수순으로 표시
- 휴대폰 브라우저 메뉴의 **홈 화면에 추가**로 앱처럼 설치 가능, 한 번 열면 오프라인에서도 동작
- 인터넷 없이 파일 하나로 쓰고 싶다면 `node tools/build-single.mjs`로 `장기체스마스터.html` 단일 파일을 만들 수 있음

웹앱 원본과 자세한 설명은 [`web/`](web/README.md)에 있습니다.

## 사이트 업데이트 (GitHub Pages)

사이트는 `gh-pages` 브랜치(= `web/` 폴더 내용)에서 배포됩니다. `web/`을 고쳐 `main`에 커밋한 뒤 아래 명령으로 반영합니다. 캐시된 옛 버전이 남지 않도록 `web/sw.js`의 `VERSION`도 올려 주세요.

```bash
git push origin main
git subtree push --prefix web origin gh-pages
```

## 테스트

```bash
node web/janggi-test.js
node web/chess-test.js
```

## 기존 PySide6 데스크탑 장기 앱

`janggi_helper/`는 처음 만든 Windows 데스크탑 버전입니다. PySide6와 Python으로 만든 로컬 실행형 앱으로, 사용자가 현재 장기판 상태를 직접 입력하면 현재 턴 기준 합법 수를 계산하고 추천 수 Top 3와 간단한 판세 평가를 보여줍니다.

### 주요 기능

- 9x10 한국 장기판 표시
- 말 선택 후 목적지 클릭 방식의 수동 입력
- 선택한 말 강조, 이동 가능 칸 하이라이트, 최근 이동 칸 강조
- 현재 턴 표시와 자동 턴 전환
- 한 수 되돌리기
- 합법 수 생성 및 추천 수 Top 3 계산
- 간단한 판세 평가
- JSON 기반 현재 상태 저장/불러오기
- 수순 기록 표시

### 설치 방법

1. Python 3.x를 설치합니다.
2. 프로젝트 루트에서 아래 명령을 실행합니다.

```bash
pip install -r requirements.txt
```

### 실행 방법

프로젝트 루트에서 아래 명령을 실행합니다.

```bash
python -m janggi_helper.main
```

### 폴더 구조

```text
janggi_helper/
├─ main.py
├─ ui/
│  ├─ main_window.py
│  ├─ board_widget.py
│  └─ dialogs.py
├─ engine/
│  ├─ board.py
│  ├─ pieces.py
│  ├─ rules.py
│  ├─ move.py
│  ├─ evaluator.py
│  └─ recommender.py
├─ services/
│  ├─ game_service.py
│  └─ storage_service.py
├─ data/
│  └─ presets.py
└─ __init__.py
```

### 사용 방법

1. `초기 배치`를 눌러 기본 배치를 불러옵니다.
2. 현재 턴의 말을 클릭하면 이동 가능한 칸이 표시됩니다.
3. 목적지를 클릭하면 수가 적용되고 턴이 자동 전환됩니다.
4. `추천 수 보기`를 누르면 추천 수 Top 3가 계산됩니다.
5. `현재 상태 저장`과 `저장 상태 불러오기`로 JSON 파일을 관리할 수 있습니다.
6. `한 수 되돌리기`로 직전 수를 되돌릴 수 있습니다.

### 엔진 구성 요약

- `Board`: 보드 상태, 기물 배치, 이동, 복제
- `Move`: 수 정보와 표시용 문자열
- `Rules`: 기물별 이동 규칙, 합법 수 생성, 체크 판정
- `Evaluator`: 기물 가치, 활동성, 위험도, 궁성 안전성 기반 간단 평가
- `Recommender`: 2-ply 탐색 기반 추천 수 계산
- `GameService`: UI 입력 처리, 턴 전환, 수순 기록, 되돌리기
- `StorageService`: JSON 저장/불러오기

### 현재 구현한 규칙

- 차 직선 이동
- 마의 발 막힘 처리
- 상의 길 막힘 처리
- 사와 장의 궁성 내 이동 제한
- 포의 포 넘기기 및 잡기 규칙
- 졸의 전진 및 가로 이동
- 자기 장이 위험해지는 수 제외
- 장끼리 마주 보는 상태를 체크로 판정

### 추후 개선 방향

- 화면 인식 기반 자동 판 입력
- 탐색 깊이 증가와 추천 성향 선택
- 기물 이미지 스킨 적용
- 더 정교한 평가 함수
- Windows exe 패키징
