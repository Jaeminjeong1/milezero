# MileZero 프런트엔드·백엔드 분리 설계

## 목적

현재 하나의 `src`와 `package.json`에 섞여 있는 React 웹앱과 Fastify API를 `frontend/`, `backend/` 패키지로 분리한다. 개발자는 각 패키지를 독립적으로 이해하고 실행할 수 있어야 하며, 심사 배포에서는 기존처럼 하나의 URL로 웹앱과 API를 제공해야 한다.

## 결정 사항

- 저장소는 Corepack 기반 pnpm workspace를 유지한다.
- 루트에는 패키지 오케스트레이션과 배포 설정만 둔다.
- 프런트엔드는 `frontend/`, 백엔드는 `backend/`에서 각각 소스, 설정, 테스트, 의존성을 소유한다.
- 개발 환경에서는 Vite가 `/v1`, `/health`, `/ready`를 백엔드로 프록시한다.
- 프로덕션에서는 프런트엔드 빌드 결과를 백엔드가 정적 파일로 제공해 배포 URL을 하나로 유지한다.
- 기존 커밋 전체를 Conventional Commits 형식의 한국어 메시지로 재작성한다.

## 목표 디렉터리 구조

```text
milezero/
├── backend/
│   ├── src/
│   │   ├── demo/
│   │   ├── domain/
│   │   ├── friction/
│   │   ├── gemini/
│   │   ├── knowledge/
│   │   ├── media/
│   │   ├── pipeline/
│   │   ├── privacy/
│   │   ├── questions/
│   │   ├── server/
│   │   ├── storage/
│   │   └── validation/
│   ├── supabase/
│   ├── package.json
│   ├── tsconfig.json
│   └── vitest.config.ts
├── frontend/
│   ├── src/
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── vitest.config.ts
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── Dockerfile
└── railway.json
```

## 패키지 경계

### 프런트엔드

`frontend`는 React 화면, UI 상태, 브라우저 API 클라이언트, CSS 토큰과 프런트 테스트만 소유한다. 백엔드 소스 코드를 직접 import하지 않으며 `/v1` HTTP 계약을 통해서만 통신한다. 현재 중복 정의된 화면용 응답 타입은 프런트 패키지 내부 계약으로 유지해 해커톤 범위에서 별도 공유 패키지를 만들지 않는다.

### 백엔드

`backend`는 GPS 집계 특징 기반 룰, Gemini 연동, 개인정보 제거, 지식 구조화·검증·저장, 포인트, Fastify API와 데모 시나리오를 소유한다. Supabase migration도 백엔드 데이터 계층의 일부이므로 `backend/supabase`로 이동한다.

### 루트

루트 `package.json`에는 workspace 전체 설치 이후 사용하는 `dev`, `dev:demo`, `build`, `test`, `typecheck`, `qa:demo` 명령만 둔다. 앱별 런타임 의존성은 각 패키지로 이동하고, 루트 개발 의존성은 두 프로세스를 함께 실행하는 도구로 제한한다.

## 실행 방식

전역 `pnpm` 설치를 전제로 하지 않는다. 문서의 표준 명령은 Node.js 22에 포함된 Corepack을 사용한다.

```bash
corepack enable
corepack prepare pnpm@11.19.0 --activate
corepack pnpm install
corepack pnpm dev:demo
```

`corepack enable` 권한이 없는 환경에서도 `corepack pnpm ...`은 직접 실행할 수 있다. 루트 명령은 workspace filter를 통해 두 패키지 명령을 호출한다. 앱 하나만 작업할 때는 다음처럼 실행한다.

```bash
corepack pnpm --filter @milezero/backend dev:demo
corepack pnpm --filter @milezero/frontend dev
```

## 빌드와 배포

1. Docker dependencies 단계에서 workspace manifests와 단일 lockfile을 복사해 고정 설치한다.
2. builder 단계에서 백엔드와 프런트엔드를 각각 빌드한다.
3. 프런트 빌드 결과는 `frontend/dist`에 생성한다.
4. 백엔드 런타임은 기본 정적 파일 경로를 `frontend/dist`로 해석한다.
5. runner 이미지에는 production workspace 의존성, `backend/dist`, `frontend/dist`만 포함한다.
6. Railway의 `/ready` health check와 포트 `3000`은 유지한다.

정적 파일 경로는 현재 작업 디렉터리에 의존하지 않고 환경변수 또는 `import.meta.url` 기준의 절대 경로로 계산한다. `/v1/*`, `/health`, `/ready`는 SPA fallback 대상에서 제외한다.

## 테스트 전략

- 먼저 구조 검증 테스트를 추가해 루트 manifest가 두 workspace를 호출하고 각 패키지가 허용된 소스만 포함하는지 확인한다.
- 프런트 테스트는 jsdom 환경의 `frontend/vitest.config.ts`에서 실행한다.
- 백엔드 테스트는 Node 환경의 `backend/vitest.config.ts`에서 실행한다.
- `corepack pnpm test`, `corepack pnpm typecheck`, `corepack pnpm build`, `corepack pnpm qa:demo`를 루트 품질 게이트로 둔다.
- 프로덕션 빌드 후 실제 서버에서 `/`, `/ready`, 존재하지 않는 `/v1` 경로를 smoke test한다.
- 기존 75개 테스트의 의미와 데모 QA 개인정보 검증을 보존한다.

## 커밋 이력 재작성

현재 `main` 전체 커밋의 트리, 부모 관계, 작성자, 작성 시각은 유지하고 메시지만 다음 type 체계로 바꾼다.

- `feat`: 사용자 또는 시스템에 새 동작을 추가한 커밋
- `fix`: 안정성, 보안, 중복 처리 등 잘못된 동작을 바로잡은 커밋
- `docs`: README, 설계, 구현 계획만 바꾼 커밋
- `test`: 제품 동작을 바꾸지 않고 QA와 테스트를 추가한 커밋
- `chore`: 작업 환경, 의존성, 배포 설정, 구조 이동
- `refactor`: 동작을 유지하면서 코드 경계를 재구성한 커밋

메시지는 `type: 한국어 요약` 형식으로 통일한다. 초기 커밋도 `chore: 프로젝트 초기화`로 바꾼다. 새 구조 변경은 `refactor: 프런트엔드와 백엔드 패키지 분리`로 커밋한다.

이력 재작성 전 `origin/main`의 현재 해시를 기록하고 로컬 백업 ref를 만든다. 검증 완료 후 `git push --force-with-lease=main:<기록한 해시> origin main`을 사용해 다른 사람이 그 사이 올린 변경을 덮어쓰지 않는다.

## 완료 기준

- 루트에서 `corepack pnpm dev:demo`로 프런트와 백엔드가 함께 실행된다.
- `frontend/`와 `backend/`가 각각 독립된 manifest, TypeScript 설정, 테스트 설정을 가진다.
- 프런트는 백엔드 구현을 직접 import하지 않는다.
- 프로덕션 서버가 하나의 URL에서 SPA와 API를 모두 제공한다.
- 전체 자동 테스트, 타입 검사, 빌드, 데모 QA, 서버 smoke test가 통과한다.
- 원격 `main`의 모든 커밋 메시지가 Conventional Commits 형식을 만족한다.
- 원격 푸시 뒤 로컬 `main`과 `origin/main`이 같은 커밋을 가리킨다.
