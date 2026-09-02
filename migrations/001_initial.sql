CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE membership_role AS ENUM ('OWNER','ADMIN','MANAGER','MEMBER','VIEWER');
CREATE TYPE record_status AS ENUM ('ACTIVE','ARCHIVED');
CREATE TYPE stage_type AS ENUM ('OPEN','WON','LOST');
CREATE TYPE task_status AS ENUM ('TODO','IN_PROGRESS','COMPLETED','CANCELED');
CREATE TYPE task_priority AS ENUM ('LOW','MEDIUM','HIGH','URGENT');
CREATE TYPE activity_type AS ENUM (
  'NOTE','CALL','EMAIL','MEETING','TASK_CREATED','TASK_COMPLETED',
  'OPPORTUNITY_CREATED','OPPORTUNITY_STAGE_CHANGED','OPPORTUNITY_WON','OPPORTUNITY_LOST',
  'CONTACT_CREATED','COMPANY_CREATED','FILE_ATTACHED','AUTOMATION_EXECUTED'
);
CREATE TYPE actor_type AS ENUM ('USER','SYSTEM','AUTOMATION','INTEGRATION');
CREATE TYPE custom_field_entity AS ENUM ('COMPANY','CONTACT','OPPORTUNITY','TASK');
CREATE TYPE custom_field_type AS ENUM ('TEXT','TEXTAREA','NUMBER','CURRENCY','DATE','DATETIME','BOOLEAN','SELECT','MULTISELECT','URL','EMAIL','PHONE');
CREATE TYPE automation_status AS ENUM ('DRAFT','ACTIVE','PAUSED');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  avatar_url text,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  currency char(3) NOT NULL DEFAULT 'BRL',
  locale text NOT NULL DEFAULT 'pt-BR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE workspace_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role membership_role NOT NULL DEFAULT 'MEMBER',
  status record_status NOT NULL DEFAULT 'ACTIVE',
  joined_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);
CREATE INDEX idx_memberships_user ON workspace_memberships(user_id, status);
CREATE INDEX idx_memberships_workspace ON workspace_memberships(workspace_id, status);

CREATE TABLE teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(workspace_id, id),
  UNIQUE(workspace_id, name)
);

CREATE TABLE team_members (
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  team_id uuid NOT NULL,
  membership_id uuid NOT NULL REFERENCES workspace_memberships(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(team_id, membership_id),
  FOREIGN KEY(workspace_id, team_id) REFERENCES teams(workspace_id, id)
);

CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  name text NOT NULL,
  legal_name text,
  normalized_name text NOT NULL,
  domain text,
  normalized_domain text,
  website text,
  industry text,
  employee_count integer CHECK(employee_count IS NULL OR employee_count >= 0),
  annual_revenue numeric(18,2) CHECK(annual_revenue IS NULL OR annual_revenue >= 0),
  phone text,
  email text,
  owner_user_id uuid REFERENCES users(id),
  lifecycle_stage text,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(workspace_id, id)
);
CREATE INDEX idx_companies_workspace_name ON companies(workspace_id, normalized_name) WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_workspace_domain ON companies(workspace_id, normalized_domain) WHERE deleted_at IS NULL AND normalized_domain IS NOT NULL;
CREATE INDEX idx_companies_owner ON companies(workspace_id, owner_user_id) WHERE deleted_at IS NULL;

CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  company_id uuid,
  first_name text NOT NULL,
  last_name text,
  full_name text NOT NULL,
  email text,
  normalized_email text,
  phone text,
  mobile text,
  job_title text,
  linkedin_url text,
  owner_user_id uuid REFERENCES users(id),
  status record_status NOT NULL DEFAULT 'ACTIVE',
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(workspace_id, id),
  FOREIGN KEY(workspace_id, company_id) REFERENCES companies(workspace_id, id)
);
CREATE INDEX idx_contacts_workspace_name ON contacts(workspace_id, full_name) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_workspace_email ON contacts(workspace_id, normalized_email) WHERE deleted_at IS NULL AND normalized_email IS NOT NULL;
CREATE INDEX idx_contacts_company ON contacts(workspace_id, company_id) WHERE deleted_at IS NULL;

CREATE TABLE pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(workspace_id, id),
  UNIQUE(workspace_id, name)
);
CREATE UNIQUE INDEX uq_default_pipeline_per_workspace ON pipelines(workspace_id) WHERE is_default = true AND deleted_at IS NULL;

CREATE TABLE pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  pipeline_id uuid NOT NULL,
  name text NOT NULL,
  position integer NOT NULL CHECK(position >= 0),
  stage_type stage_type NOT NULL DEFAULT 'OPEN',
  probability smallint NOT NULL DEFAULT 0 CHECK(probability BETWEEN 0 AND 100),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, id),
  UNIQUE(workspace_id, pipeline_id, id),
  UNIQUE(pipeline_id, position),
  FOREIGN KEY(workspace_id, pipeline_id) REFERENCES pipelines(workspace_id, id)
);
CREATE INDEX idx_stages_pipeline ON pipeline_stages(workspace_id, pipeline_id, position);

CREATE TABLE lost_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, id),
  UNIQUE(workspace_id, name)
);

CREATE TABLE opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  company_id uuid,
  pipeline_id uuid NOT NULL,
  pipeline_stage_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  owner_user_id uuid REFERENCES users(id),
  amount numeric(18,2) NOT NULL DEFAULT 0 CHECK(amount >= 0),
  currency char(3) NOT NULL DEFAULT 'BRL',
  expected_close_date date,
  closed_at timestamptz,
  lost_reason_id uuid,
  source text,
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(workspace_id, id),
  FOREIGN KEY(workspace_id, company_id) REFERENCES companies(workspace_id, id),
  FOREIGN KEY(workspace_id, pipeline_id) REFERENCES pipelines(workspace_id, id),
  FOREIGN KEY(workspace_id, pipeline_stage_id) REFERENCES pipeline_stages(workspace_id, id),
  FOREIGN KEY(workspace_id, pipeline_id, pipeline_stage_id) REFERENCES pipeline_stages(workspace_id, pipeline_id, id),
  FOREIGN KEY(workspace_id, lost_reason_id) REFERENCES lost_reasons(workspace_id, id)
);
CREATE INDEX idx_opps_pipeline_stage ON opportunities(workspace_id, pipeline_id, pipeline_stage_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_opps_owner ON opportunities(workspace_id, owner_user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_opps_company ON opportunities(workspace_id, company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_opps_close_date ON opportunities(workspace_id, expected_close_date) WHERE deleted_at IS NULL;

CREATE TABLE opportunity_contacts (
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  opportunity_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  role text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(opportunity_id, contact_id),
  FOREIGN KEY(workspace_id, opportunity_id) REFERENCES opportunities(workspace_id, id),
  FOREIGN KEY(workspace_id, contact_id) REFERENCES contacts(workspace_id, id)
);
CREATE UNIQUE INDEX uq_opportunity_primary_contact ON opportunity_contacts(opportunity_id) WHERE is_primary = true;

CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  title text NOT NULL,
  description text,
  status task_status NOT NULL DEFAULT 'TODO',
  priority task_priority NOT NULL DEFAULT 'MEDIUM',
  assigned_to_user_id uuid REFERENCES users(id),
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  due_at timestamptz,
  completed_at timestamptz,
  company_id uuid,
  contact_id uuid,
  opportunity_id uuid,
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(workspace_id, id),
  FOREIGN KEY(workspace_id, company_id) REFERENCES companies(workspace_id, id),
  FOREIGN KEY(workspace_id, contact_id) REFERENCES contacts(workspace_id, id),
  FOREIGN KEY(workspace_id, opportunity_id) REFERENCES opportunities(workspace_id, id),
  CHECK ((status = 'COMPLETED' AND completed_at IS NOT NULL) OR (status <> 'COMPLETED' AND completed_at IS NULL))
);
CREATE INDEX idx_tasks_assignee_due ON tasks(workspace_id, assigned_to_user_id, due_at) WHERE deleted_at IS NULL AND status NOT IN ('COMPLETED','CANCELED');
CREATE INDEX idx_tasks_opportunity ON tasks(workspace_id, opportunity_id) WHERE deleted_at IS NULL;

CREATE TABLE activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  type activity_type NOT NULL,
  actor_user_id uuid REFERENCES users(id),
  company_id uuid,
  contact_id uuid,
  opportunity_id uuid,
  task_id uuid,
  title text NOT NULL,
  body text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'APP',
  source_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, id),
  FOREIGN KEY(workspace_id, company_id) REFERENCES companies(workspace_id, id),
  FOREIGN KEY(workspace_id, contact_id) REFERENCES contacts(workspace_id, id),
  FOREIGN KEY(workspace_id, opportunity_id) REFERENCES opportunities(workspace_id, id),
  FOREIGN KEY(workspace_id, task_id) REFERENCES tasks(workspace_id, id)
);
CREATE INDEX idx_activities_timeline ON activities(workspace_id, occurred_at DESC);
CREATE INDEX idx_activities_company ON activities(workspace_id, company_id, occurred_at DESC);
CREATE INDEX idx_activities_contact ON activities(workspace_id, contact_id, occurred_at DESC);
CREATE INDEX idx_activities_opportunity ON activities(workspace_id, opportunity_id, occurred_at DESC);

CREATE TABLE custom_field_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  entity_type custom_field_entity NOT NULL,
  name text NOT NULL,
  key text NOT NULL,
  field_type custom_field_type NOT NULL,
  required boolean NOT NULL DEFAULT false,
  options jsonb,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(workspace_id, entity_type, key),
  UNIQUE(workspace_id, id)
);

CREATE TABLE automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  name text NOT NULL,
  status automation_status NOT NULL DEFAULT 'DRAFT',
  trigger_event text NOT NULL,
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(workspace_id, id)
);

CREATE TABLE automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  automation_rule_id uuid NOT NULL,
  event_id uuid,
  status text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  FOREIGN KEY(workspace_id, automation_rule_id) REFERENCES automation_rules(workspace_id, id)
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  actor_user_id uuid REFERENCES users(id),
  actor_type actor_type NOT NULL DEFAULT 'USER',
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  ip_address inet,
  user_agent text,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON audit_logs(workspace_id, entity_type, entity_id, created_at DESC);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text
);
CREATE INDEX idx_outbox_unpublished ON outbox_events(occurred_at) WHERE published_at IS NULL;


-- Membership-aware foreign keys ensure owners/assignees/actors belong to the same workspace.
ALTER TABLE companies
  ADD CONSTRAINT fk_companies_owner_membership FOREIGN KEY(workspace_id, owner_user_id) REFERENCES workspace_memberships(workspace_id, user_id),
  ADD CONSTRAINT fk_companies_creator_membership FOREIGN KEY(workspace_id, created_by_user_id) REFERENCES workspace_memberships(workspace_id, user_id);
ALTER TABLE contacts
  ADD CONSTRAINT fk_contacts_owner_membership FOREIGN KEY(workspace_id, owner_user_id) REFERENCES workspace_memberships(workspace_id, user_id),
  ADD CONSTRAINT fk_contacts_creator_membership FOREIGN KEY(workspace_id, created_by_user_id) REFERENCES workspace_memberships(workspace_id, user_id);
ALTER TABLE opportunities
  ADD CONSTRAINT fk_opportunities_owner_membership FOREIGN KEY(workspace_id, owner_user_id) REFERENCES workspace_memberships(workspace_id, user_id),
  ADD CONSTRAINT fk_opportunities_creator_membership FOREIGN KEY(workspace_id, created_by_user_id) REFERENCES workspace_memberships(workspace_id, user_id);
ALTER TABLE tasks
  ADD CONSTRAINT fk_tasks_assignee_membership FOREIGN KEY(workspace_id, assigned_to_user_id) REFERENCES workspace_memberships(workspace_id, user_id),
  ADD CONSTRAINT fk_tasks_creator_membership FOREIGN KEY(workspace_id, created_by_user_id) REFERENCES workspace_memberships(workspace_id, user_id);
ALTER TABLE activities
  ADD CONSTRAINT fk_activities_actor_membership FOREIGN KEY(workspace_id, actor_user_id) REFERENCES workspace_memberships(workspace_id, user_id);
ALTER TABLE automation_rules
  ADD CONSTRAINT fk_automation_creator_membership FOREIGN KEY(workspace_id, created_by_user_id) REFERENCES workspace_memberships(workspace_id, user_id);
ALTER TABLE audit_logs
  ADD CONSTRAINT fk_audit_actor_membership FOREIGN KEY(workspace_id, actor_user_id) REFERENCES workspace_memberships(workspace_id, user_id);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','workspaces','workspace_memberships','teams','companies','contacts','pipelines','pipeline_stages','opportunities','tasks','custom_field_definitions','automation_rules']
  LOOP
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;

-- Tenant isolation. The application sets app.workspace_id at the beginning of each transaction.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'teams','team_members','companies','contacts','pipelines','pipeline_stages','lost_reasons',
    'opportunities','opportunity_contacts','tasks','activities','custom_field_definitions',
    'automation_rules','automation_runs','audit_logs','outbox_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%I ON %I USING (workspace_id = nullif(current_setting(''app.workspace_id'', true), '''')::uuid) WITH CHECK (workspace_id = nullif(current_setting(''app.workspace_id'', true), '''')::uuid)',
      t, t
    );
  END LOOP;
END $$;

-- Membership visibility is scoped by the authenticated user or active workspace.
ALTER TABLE workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY membership_visibility ON workspace_memberships
USING (
  user_id = nullif(current_setting('app.user_id', true), '')::uuid
  OR workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid
)
WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);
