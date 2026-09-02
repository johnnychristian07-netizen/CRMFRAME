# CRM B2B Multitenant Backend

Backend MVP for a real B2B CRM: companies, contacts, opportunities, pipelines, tasks, activity timeline, permissions, audit trail and an automation/outbox seam.

## Stack
- Node.js + TypeScript
- Fastify
- PostgreSQL 16
- PostgreSQL Row Level Security (RLS)
- JWT
- Transactional outbox
- Redis container reserved for jobs/cache as the system grows

## Run locally

```bash
cp .env.example .env
docker compose up -d
npm install
npm run migrate
npm run seed
npm run dev
```

In another terminal:

```bash
npm run worker
```

## Development token
The dev token route is disabled automatically in `NODE_ENV=production`.

```bash
curl -s http://localhost:3000/auth/dev-token \
  -H 'content-type: application/json' \
  -d '{"email":"owner@demo.local","workspaceSlug":"crm-demo"}'
```

Copy the returned token:

```bash
export TOKEN='...'
```

## Example flow

List pipelines and stages:

```bash
curl -s http://localhost:3000/pipelines -H "authorization: Bearer $TOKEN"
```

Create a company:

```bash
curl -s http://localhost:3000/companies \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"Acme Brasil","domain":"acme.com.br","industry":"Software"}'
```

Create a contact:

```bash
curl -s http://localhost:3000/contacts \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"firstName":"Ana","lastName":"Silva","email":"ana@acme.com.br","companyId":"COMPANY_UUID"}'
```

Create an opportunity using IDs returned by `/pipelines`:

```bash
curl -s http://localhost:3000/opportunities \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"Contrato Enterprise","companyId":"COMPANY_UUID","pipelineId":"PIPELINE_UUID","pipelineStageId":"STAGE_UUID","amount":120000,"contactIds":["CONTACT_UUID"]}'
```

Move stage:

```bash
curl -s http://localhost:3000/opportunities/OPPORTUNITY_UUID/move-stage \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"stageId":"NEXT_STAGE_UUID"}'
```

Create a task:

```bash
curl -s http://localhost:3000/tasks \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"title":"Ligar para Ana","priority":"HIGH","opportunityId":"OPPORTUNITY_UUID","dueAt":"2026-09-03T13:00:00Z"}'
```

Read opportunity timeline:

```bash
curl -s "http://localhost:3000/activities?opportunityId=OPPORTUNITY_UUID" \
  -H "authorization: Bearer $TOKEN"
```

## Permission model
- `OWNER`: full workspace access.
- `ADMIN`: full CRM access.
- `MANAGER`: CRM access scoped to the manager's teams.
- `MEMBER`: works with records they own / tasks assigned to them.
- `VIEWER`: read-only across the workspace.

The code already resolves TEAM membership through `teams` + `team_members`.

## Important production work still expected
This repository is an MVP backend foundation, not a claim of production completion. Before a real launch, add a production identity provider / passwordless auth, refresh/session management, rate limiting, idempotency keys, full custom-field validation, invitation/member APIs, team management APIs, webhook delivery/retries, executable automation actions, file attachments, notification channels, observability, backup/restore drills and a broader automated test suite.

See `ARCHITECTURE.md` for the domain and security decisions.
