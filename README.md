# 🌳 링크나무

내 모든 링크를 한 페이지에 모아 두고, 하나의 URL로 공유하는 서비스입니다.

## 실행 방법

Node.js 18 이상이 필요합니다. 외부 패키지가 없어서 `npm install`은 필요 없습니다.

```bash
npm start          # 또는 node server.js
```

브라우저에서 http://localhost:3000 을 엽니다. 포트를 바꾸려면 `PORT=8080 npm start`처럼 실행하세요.

## 사용 흐름

1. `/signup`에서 아이디·비밀번호로 가입 → 관리 페이지(`/admin`)로 이동
2. 프로필(이름, 한 줄 소개, 사진)과 링크를 등록
3. 공개 페이지 `/@아이디` 주소를 SNS 프로필에 공유
4. 방문자가 링크 카드를 누르면 `/go/아이디/링크ID`를 거쳐 클릭 수가 1 오르고 실제 주소로 이동
5. 관리 페이지에서 링크별 클릭 수와 전체 클릭 수를 확인

## 기능

| 기능 | 내용 |
| --- | --- |
| 프로필 | 이름(40자), 한 줄 소개(100자), 프로필 사진(브라우저에서 320px 정사각형으로 잘라 업로드) |
| 링크 카드 | 이름 + 주소, 순서 변경(↑↓), 수정, 삭제. 인스타그램·유튜브·깃허브·네이버 블로그 등은 서비스명과 색상으로 표시 |
| 클릭 수 집계 | 링크별 누적 클릭 수, 마지막 클릭 시각, 전체 합계 및 비율 막대 |
| 반응형 | 모바일 우선 레이아웃, 다크 모드 자동 대응 |

## 구조

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

## API

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

## 보안 메모

- 비밀번호는 scrypt + 솔트로 해시 저장, 세션은 HttpOnly·SameSite=Lax 쿠키
- 링크 주소는 http/https만 허용(`javascript:` 차단), 출력 시 HTML 이스케이프
- 이미지 업로드는 PNG/JPG/WEBP, 1.5MB 이하만 허용

## 실서비스 전 고려 사항

- 저장소를 JSON 파일에서 SQLite/PostgreSQL로 교체 (동시 접속·백업)
- HTTPS 환경에서 쿠키에 `Secure` 추가
- 로그인 시도 횟수 제한, 비밀번호 재설정
- 클릭 집계에서 봇·중복 클릭 필터링, 날짜별 통계
