# CRM B2B Multitenant — Architecture

## Boundary
`workspace_id` is the tenant boundary. All CRM-owned tables carry it explicitly and use PostgreSQL Row Level Security.

## Domain graph

```text
User --< WorkspaceMembership >-- Workspace
                                 |-- Company --< Contact
                                 |        `--< Opportunity >-- PipelineStage -- Pipeline
                                 |                 `--< OpportunityContact >-- Contact
                                 |-- Task
                                 |-- Activity
                                 |-- Team --< TeamMember
                                 |-- AutomationRule --< AutomationRun
                                 |-- AuditLog
                                 `-- OutboxEvent
```

## Security
1. JWT identifies user + selected workspace.
2. Membership is validated on every authenticated request.
3. Application permission matrix checks the action.
4. Data scope limits records to ALL / TEAM / OWN.
5. `SET LOCAL app.workspace_id` feeds PostgreSQL RLS inside every transaction.
6. Composite foreign keys prevent cross-workspace relationships.

## Domain invariants
- A pipeline stage must belong to the opportunity's pipeline.
- `WON` and `LOST` stages close the opportunity; `OPEN` stages reopen it.
- A lost opportunity requires a lost reason when moved through the API.
- A completed task has `completed_at`; non-completed tasks do not.
- User-facing activities and security audit logs are separate concerns.
- Important mutations write an outbox event in the same DB transaction.

## Event path

```text
HTTP command
  -> validate membership + permission
  -> begin tenant transaction
  -> mutate aggregate
  -> append Activity
  -> append AuditLog
  -> append OutboxEvent
  -> commit
  -> Worker dispatches matching AutomationRules
```

## Why modular monolith first
The modules are isolated by domain but share one PostgreSQL transaction boundary. This keeps consistency strong while the product is evolving. Outbox events create a clean extraction path for future services without requiring Kafka/microservices on day one.
