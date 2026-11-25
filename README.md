# 🌳 링크나무

내 모든 링크를 한 페이지에 모아 두고, 하나의 URL로 공유하는 서비스입니다.

이 저장소에는 두 가지 구현이 있습니다.

| 위치 | 설명 |
| --- | --- |
| [`web/`](web/) | **새 버전.** Next.js 기반으로 개발 중 |
| 루트 (`server.js`, `public/`) | 이전 버전. 외부 패키지 없는 Node.js 서버 |

## 새 버전 (`web/`)

Next.js 16(App Router), TypeScript, Tailwind CSS, MongoDB Atlas를 사용하며 Vercel 배포를 목표로 합니다.

### 현재 상태

- 메인 페이지: 원형 프로필 사진, 이름, 한 줄 소개, 링크 카드(Github, LinkedIn, Blog)
- 내용과 사진은 보여 주기용 더미 값
- 클릭 수 집계 코드는 작성했지만 실제 MongoDB 저장은 아직 확인하지 않음
- 클릭 수를 화면에 표시하는 기능은 없음
- 아직 배포하지 않음

### 실행 방법

Node.js 20.9 이상이 필요합니다.

```bash
cd web
npm install
npm run dev
```

브라우저에서 http://localhost:3000 을 엽니다. 빌드는 `npm run build`, 타입 검사는 `npm run typecheck`입니다.

### 내용 바꾸기

- 이름, 한 줄 소개, 링크: `web/src/lib/profile.ts`
- 프로필 사진: 사진을 `web/public/`에 넣고 `profile.ts`의 `avatar`를 `"/파일명.jpg"`로 변경
- 링크의 `id`는 클릭 수를 저장하는 키이므로 한 번 정하면 바꾸지 않습니다.

### 클릭 수 저장

`web/.env.example`을 `web/.env.local`로 복사하고 값을 채웁니다. `.env.local`은 커밋하지 않습니다.

```
MONGODB_URI=MongoDB Atlas 연결 문자열
MONGODB_DB=linknamu
```

링크 카드를 누르면 `/go/링크ID`를 거쳐 실제 주소로 이동하고, `clicks` 컬렉션의 해당 링크 클릭 수가 1 오릅니다. `MONGODB_URI`가 없으면 이동만 하고 기록하지 않습니다.

### Vercel 배포

프로젝트의 Root Directory를 `web`으로 지정하고 위 환경 변수를 등록합니다.

### 구조

```
web/
  src/
    app/
      page.tsx           메인 페이지
      layout.tsx         공통 레이아웃, 메타데이터
      go/[id]/route.ts   클릭 기록 후 이동
    components/          ProfileHeader, LinkList, LinkCard
    lib/
      profile.ts         프로필·링크 데이터
      clicks.ts          MongoDB 클릭 수 저장
  public/                프로필 사진 등 정적 파일
```

## 이전 버전 (루트)

회원가입, 관리 페이지, 클릭 수 확인을 갖춘 버전입니다.

### 실행 방법

Node.js 18 이상이 필요합니다. 외부 패키지가 없어서 `npm install`은 필요 없습니다.

```bash
npm start          # 또는 node server.js
```

브라우저에서 http://localhost:3000 을 엽니다. 포트를 바꾸려면 `PORT=8080 npm start`처럼 실행하세요.

### 사용 흐름

1. `/signup`에서 아이디·비밀번호로 가입 → 관리 페이지(`/admin`)로 이동
2. 프로필(이름, 한 줄 소개, 사진)과 링크를 등록
3. 공개 페이지 `/@아이디` 주소를 SNS 프로필에 공유
4. 방문자가 링크 카드를 누르면 `/go/아이디/링크ID`를 거쳐 클릭 수가 1 오르고 실제 주소로 이동
5. 관리 페이지에서 링크별 클릭 수와 전체 클릭 수를 확인

### 기능

| 기능 | 내용 |
| --- | --- |
| 프로필 | 이름(40자), 한 줄 소개(100자), 프로필 사진(브라우저에서 320px 정사각형으로 잘라 업로드) |
| 링크 카드 | 이름 + 주소, 순서 변경(↑↓), 수정, 삭제. 인스타그램·유튜브·깃허브·네이버 블로그 등은 서비스명과 색상으로 표시 |
| 클릭 수 집계 | 링크별 누적 클릭 수, 마지막 클릭 시각, 전체 합계 및 비율 막대 |
| 반응형 | 모바일 우선 레이아웃, 다크 모드 자동 대응 |

### 구조

```
server.js          HTTP 서버, 라우팅, API, 공개 프로필 서버 렌더링
public/
  index.html       랜딩 페이지
  auth.html        로그인 / 회원가입 (/login, /signup)
  admin.html       관리 페이지
  admin.js         관리 페이지 스크립트
  style.css        공통 스타일
data/              실행 시 자동 생성 (db.json, uploads/) — 백업 대상
```

### API

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| POST | `/api/signup` | `{username, password}` 가입 + 로그인 |
| POST | `/api/login` | `{username, password}` 로그인 |
| POST | `/api/logout` | 로그아웃 |
| GET | `/api/me` | 내 프로필·링크·클릭 수 |
| PUT | `/api/me/profile` | `{name, bio}` |
| POST / DELETE | `/api/me/avatar` | `{dataUrl}` 업로드 / 삭제 |
| POST | `/api/me/links` | `{title, url}` 추가 |
| PUT / DELETE | `/api/me/links/:id` | 수정 / 삭제 |
| PUT | `/api/me/links/order` | `{ids: [...]}` 순서 변경 |

### 보안 메모

- 비밀번호는 scrypt + 솔트로 해시 저장, 세션은 HttpOnly·SameSite=Lax 쿠키
- 링크 주소는 http/https만 허용(`javascript:` 차단), 출력 시 HTML 이스케이프
- 이미지 업로드는 PNG/JPG/WEBP, 1.5MB 이하만 허용

### 실서비스 전 고려 사항

- 저장소를 JSON 파일에서 SQLite/PostgreSQL로 교체 (동시 접속·백업)
- HTTPS 환경에서 쿠키에 `Secure` 추가
- 로그인 시도 횟수 제한, 비밀번호 재설정
- 클릭 집계에서 봇·중복 클릭 필터링, 날짜별 통계
