# Railway PostgreSQL 전환 설계

## 목표

MileZero 운영 환경의 데이터 저장소를 Supabase RPC에서 Railway 관리형 PostgreSQL로 전환한다. Web 서비스는 Railway가 제공하는 `DATABASE_URL` 하나로 같은 프로젝트의 PostgreSQL 서비스에 연결하고, 배포 시작 시 필요한 schema migration을 안전하게 적용한다.

## 범위

- 기존 `KnowledgeStore` 인터페이스와 파이프라인 동작을 유지한다.
- Supabase JavaScript 클라이언트를 제거하고 `pg` connection pool을 사용한다.
- 기존 PostgreSQL 함수가 제공하는 트랜잭션, 멱등성, 검증 로직은 보존한다.
- Railway PostgreSQL에 존재하지 않는 Supabase 전용 role, grant, RLS 설정은 제거한다.
- Web 컨테이너 시작 전에 미적용 migration을 자동 실행한다.
- 환경변수와 Railway 배포 절차를 `DATABASE_URL` 기준으로 문서화한다.

프런트엔드 코드와 진행 중인 GPS 시연 작업은 이 변경의 범위에 포함하지 않는다.

## 선택한 접근

`PostgresKnowledgeStore`는 기존 RPC 함수 이름과 JSON payload 계약을 그대로 사용하되, HTTP 기반 Supabase RPC 대신 parameterized SQL로 함수를 호출한다. 예를 들어 `mz_get_claim`은 `select public.mz_get_claim($1::jsonb) as data` 형태로 실행한다. 호출 가능한 함수는 코드에 고정된 목록으로 제한해 SQL 식별자 주입 가능성을 없앤다.

모든 도메인 객체 변환과 Zod 검증은 현재 저장소 구현과 동일하게 유지한다. 따라서 저장 방식 변경이 API 응답, 점수 계산, 지식 검증 상태에 영향을 주지 않는다.

## 구성 요소

### PostgreSQL 저장소

- `pg.Pool`을 생성하는 factory가 `DATABASE_URL`을 필수로 검증한다.
- 저장소는 최소 `query(text, values)` 인터페이스에 의존해 단위 테스트에서 실제 SQL 호출 계약을 검증할 수 있게 한다.
- DB 오류는 기존과 마찬가지로 호출자에게 전달한다.
- readiness probe는 기존 `getPointBalance` 경로를 사용하므로 DB 연결과 schema 준비 상태를 함께 확인한다.

### Schema migration

- migration SQL은 번호가 붙은 독립 파일로 관리한다.
- migration runner는 전용 ledger table을 만들고 PostgreSQL advisory lock을 획득한 뒤 아직 기록되지 않은 migration만 transaction 안에서 실행한다.
- 성공한 migration만 ledger에 기록하며 실패하면 rollback하고 서버를 시작하지 않는다.
- 동시에 두 인스턴스가 시작해도 advisory lock으로 migration 실행을 직렬화한다.
- 초기 schema는 기존 table, index, enum, 함수 및 원자적 `mz_commit_contribution` 로직을 보존한다.
- 애플리케이션이 DB owner 연결을 사용하므로 Supabase 전용 RLS와 `service_role`, `anon`, `authenticated` grant는 포함하지 않는다.

### 배포 시작 흐름

컨테이너는 다음 순서로 시작한다.

1. `DATABASE_URL`로 migration runner 실행
2. 모든 migration 성공 후 Fastify 서버 실행
3. `/ready`가 PostgreSQL 함수 호출에 성공하면 Railway가 새 배포로 트래픽 전환

Railway가 주입하는 `PORT`는 기존처럼 Fastify가 사용한다. 프런트는 Fastify가 같은 origin에서 계속 제공하므로 별도의 프런트 서비스나 API base URL은 필요하지 않다.

## 환경변수

운영 Web 서비스의 필수 변수는 다음과 같다.

- `DATABASE_URL=${{Postgres.DATABASE_URL}}`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `MILEZERO_MODE=production`
- `CORS_ORIGINS=https://${{RAILWAY_PUBLIC_DOMAIN}}`

`PORT`는 Railway가 자동 주입한다. `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`는 제거한다. `CLIENT_DIST_DIR`는 Dockerfile 기본값 `/app/frontend/dist`를 사용하므로 선택 사항이다.

## 오류 처리

- `DATABASE_URL`이 없으면 서버 시작 전에 명확한 구성 오류를 발생시킨다.
- migration 실패 시 프로세스가 non-zero로 종료되어 잘못된 schema로 서비스되지 않게 한다.
- 함수가 없는 경우나 PostgreSQL 연결 실패는 readiness 실패와 API 오류로 드러나며 조용히 무시하지 않는다.
- migration transaction이 실패하면 해당 migration의 변경과 ledger 기록을 모두 rollback한다.

## 테스트 및 검증

- 저장소 단위 테스트에서 함수 이름, JSON parameter binding, 결과 변환, DB 오류 전파를 검증한다.
- 환경변수 factory 테스트에서 `DATABASE_URL` 필수 조건을 검증한다.
- PGlite 기반 migration 테스트에서 Railway용 초기 schema를 새 DB에 적용하고 핵심 함수 및 멱등성을 검증한다.
- migration runner 테스트에서 최초 적용, 재실행 skip, 실패 rollback을 검증한다.
- 서버 의존성 테스트에서 production 모드가 `DATABASE_URL`을 요구하는지 확인한다.
- 최종적으로 백엔드·프런트 테스트, 전체 typecheck, production build를 실행한다.

## 제외 사항

- 기존 Supabase 운영 데이터의 실데이터 이전은 포함하지 않는다. 아직 운영 데이터가 있다면 별도의 export/import 절차가 필요하다.
- ORM 도입, connection pooling 프록시 추가, read replica, 다중 region 구성은 포함하지 않는다.
- 프런트 GPS 시연 기능이나 API 계약은 변경하지 않는다.
