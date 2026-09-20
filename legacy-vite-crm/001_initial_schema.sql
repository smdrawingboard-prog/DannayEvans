-- ============================================================
-- Recruitment CRM Dashboard — Initial Schema
-- London-based executive recruitment firm, global placements
-- Currency: GBP | Compliance: UK GDPR + GDPR
-- ============================================================

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ============================================================
-- STAFF
-- ============================================================
create table staff (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text unique not null,
  role text not null check (role in ('admin', 'recruiter', 'sales_rep')),
  active boolean default true,
  created_at timestamptz default now()
);

-- ============================================================
-- JOB LISTINGS / MANDATES
-- ============================================================
create table job_listings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  client_company text not null,
  mandate_type text default 'Retained' check (mandate_type in ('Retained', 'Contingency', 'RPO')),
  recruiter_id uuid references staff(id) on delete set null,
  status text default 'Active' check (status in ('Active', 'Shortlisting', 'Offer Stage', 'Filled', 'On Hold', 'Cancelled')),
  date_posted date default current_date,
  date_filled date,
  notes text,
  created_at timestamptz default now()
);

-- ============================================================
-- CANDIDATES
-- ============================================================
create table candidates (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  linkedin_url text,
  nationality text,
  current_title text,
  current_company text,
  current_location text,
  target_role text,
  target_geography text,
  job_listing_id uuid references job_listings(id) on delete set null,
  recruiter_id uuid references staff(id) on delete set null,
  stage text default 'New Application' check (stage in (
    'New Application',
    'CV Screening',
    'Recruiter Interview',
    'Longlist Submitted to Client',
    'Client Interview Round 1',
    'Client Interview Round 2 / Final',
    'Reference Check',
    'Offer Extended',
    'Placed',
    'Rejected / Withdrawn'
  )),
  stage_entered_at timestamptz default now(),
  source text,
  gdpr_consent boolean default false,
  gdpr_consent_date timestamptz,
  right_to_work_checked boolean default false,
  right_to_work_date date,
  notes text,
  created_at timestamptz default now()
);

-- ============================================================
-- DEALS (BUSINESS DEVELOPMENT / SALES PIPELINE)
-- ============================================================
create table deals (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text,
  contact_email text,
  contact_linkedin_url text,
  sales_rep_id uuid references staff(id) on delete set null,
  mandate_type text default 'Retained' check (mandate_type in ('Retained', 'Contingency', 'RPO')),
  role_being_filled text,
  estimated_fee_gbp numeric(12,2),
  stage text default 'Lead Identified' check (stage in (
    'Lead Identified',
    'Initial Outreach',
    'Discovery Call',
    'Proposal Sent',
    'Negotiation',
    'Retained Mandate Signed',
    'Lost / No Decision'
  )),
  probability_pct int default 10 check (probability_pct between 0 and 100),
  expected_close_date date,
  actual_close_date date,
  outcome text check (outcome in ('Won', 'Lost', null)),
  source text check (source in ('LinkedIn Sales Navigator', 'Referral', 'Inbound', 'Cold Email', 'Event', 'Other')),
  notes text,
  -- External CRM IDs
  linkedin_lead_id text,
  hubspot_deal_id text,
  salesforce_opportunity_id text,
  pipedrive_deal_id text,
  bullhorn_id text,
  created_at timestamptz default now()
);

-- ============================================================
-- DOCUMENTS
-- ============================================================
create table documents (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_type text not null,
  document_type text not null check (document_type in ('CV', 'Cover Letter', 'Assessment', 'Reference', 'Contract', 'Proposal', 'Other')),
  storage_path text not null,
  linked_entity_type text not null check (linked_entity_type in ('candidate', 'deal')),
  linked_entity_id uuid not null,
  uploaded_by uuid references staff(id) on delete set null,
  file_size_bytes bigint,
  created_at timestamptz default now()
);

-- ============================================================
-- ACTIVITY LOG (AUDIT TRAIL)
-- ============================================================
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  staff_id uuid references staff(id) on delete set null,
  action text not null,
  old_value text,
  new_value text,
  created_at timestamptz default now()
);

-- ============================================================
-- INTEGRATION SETTINGS
-- ============================================================
create table integration_settings (
  id uuid primary key default gen_random_uuid(),
  integration_name text not null unique check (integration_name in (
    'LinkedIn Sales Navigator',
    'HubSpot',
    'Salesforce',
    'Pipedrive',
    'Bullhorn',
    'Apify',
    'SendGrid',
    'WhatsApp'
  )),
  enabled boolean default false,
  sync_direction text default 'push' check (sync_direction in ('push', 'pull', 'bidirectional')),
  api_key_ref text, -- reference to secret name, never the actual key
  config jsonb default '{}',
  last_synced_at timestamptz,
  last_sync_status text,
  last_sync_records int,
  last_sync_errors int,
  created_at timestamptz default now()
);

-- Seed default integrations
insert into integration_settings (integration_name, enabled, sync_direction) values
  ('LinkedIn Sales Navigator', false, 'pull'),
  ('HubSpot', false, 'bidirectional'),
  ('Salesforce', false, 'bidirectional'),
  ('Pipedrive', false, 'bidirectional'),
  ('Bullhorn', false, 'bidirectional'),
  ('Apify', false, 'pull'),
  ('SendGrid', false, 'push'),
  ('WhatsApp', false, 'push');

-- ============================================================
-- WEEKLY REPORTS
-- ============================================================
create table weekly_reports (
  id uuid primary key default gen_random_uuid(),
  week_ending date not null,
  generated_by uuid references staff(id) on delete set null,
  placements_count int,
  deals_closed_count int,
  revenue_closed_gbp numeric(12,2),
  pipeline_value_gbp numeric(12,2),
  notion_page_url text,
  email_sent boolean default false,
  report_data jsonb,
  created_at timestamptz default now()
);

-- ============================================================
-- NOTIFICATIONS LOG
-- ============================================================
create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references staff(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp', 'in_app')),
  subject text,
  body text not null,
  entity_type text,
  entity_id uuid,
  sent boolean default false,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index idx_candidates_stage on candidates(stage);
create index idx_candidates_recruiter on candidates(recruiter_id);
create index idx_candidates_job_listing on candidates(job_listing_id);
create index idx_candidates_stage_entered on candidates(stage_entered_at);
create index idx_deals_stage on deals(stage);
create index idx_deals_sales_rep on deals(sales_rep_id);
create index idx_deals_outcome on deals(outcome);
create index idx_documents_linked on documents(linked_entity_type, linked_entity_id);
create index idx_activity_entity on activity_log(entity_type, entity_id);
create index idx_notifications_recipient on notifications(recipient_id, sent);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table staff enable row level security;
alter table job_listings enable row level security;
alter table candidates enable row level security;
alter table deals enable row level security;
alter table documents enable row level security;
alter table activity_log enable row level security;
alter table integration_settings enable row level security;
alter table weekly_reports enable row level security;
alter table notifications enable row level security;

-- Helper function: get current user's role
create or replace function get_my_role()
returns text as $$
  select role from staff where email = auth.jwt() ->> 'email' and active = true limit 1;
$$ language sql security definer;

-- Helper function: get current user's ID
create or replace function get_my_staff_id()
returns uuid as $$
  select id from staff where email = auth.jwt() ->> 'email' and active = true limit 1;
$$ language sql security definer;

-- STAFF policies
create policy "Admins full access to staff" on staff
  for all using (get_my_role() = 'admin');

create policy "Staff can view own record" on staff
  for select using (email = auth.jwt() ->> 'email');

-- JOB LISTINGS policies
create policy "Admins full access to job_listings" on job_listings
  for all using (get_my_role() = 'admin');

create policy "Recruiters read write own job listings" on job_listings
  for all using (
    get_my_role() = 'recruiter'
    and recruiter_id = get_my_staff_id()
  );

create policy "Sales reps read job listings" on job_listings
  for select using (get_my_role() = 'sales_rep');

-- CANDIDATES policies
create policy "Admins full access to candidates" on candidates
  for all using (get_my_role() = 'admin');

create policy "Recruiters read write own candidates" on candidates
  for all using (
    get_my_role() = 'recruiter'
    and recruiter_id = get_my_staff_id()
  );

create policy "Sales reps read candidates" on candidates
  for select using (get_my_role() = 'sales_rep');

-- DEALS policies
create policy "Admins full access to deals" on deals
  for all using (get_my_role() = 'admin');

create policy "Sales reps read write own deals" on deals
  for all using (
    get_my_role() = 'sales_rep'
    and sales_rep_id = get_my_staff_id()
  );

create policy "Recruiters read deals" on deals
  for select using (get_my_role() = 'recruiter');

-- DOCUMENTS policies
create policy "Admins full access to documents" on documents
  for all using (get_my_role() = 'admin');

create policy "Recruiters read write documents" on documents
  for all using (get_my_role() = 'recruiter');

create policy "Sales reps read write documents" on documents
  for all using (get_my_role() = 'sales_rep');

-- ACTIVITY LOG policies
create policy "Admins full access to activity_log" on activity_log
  for all using (get_my_role() = 'admin');

create policy "Staff read own activity" on activity_log
  for select using (staff_id = get_my_staff_id());

-- INTEGRATION SETTINGS policies (admin only)
create policy "Admins only integration_settings" on integration_settings
  for all using (get_my_role() = 'admin');

-- WEEKLY REPORTS policies
create policy "Admins full access to weekly_reports" on weekly_reports
  for all using (get_my_role() = 'admin');

create policy "All staff read weekly reports" on weekly_reports
  for select using (get_my_role() in ('admin', 'recruiter', 'sales_rep'));

-- NOTIFICATIONS policies
create policy "Users see own notifications" on notifications
  for select using (recipient_id = get_my_staff_id());

create policy "Admins full access to notifications" on notifications
  for all using (get_my_role() = 'admin');

-- ============================================================
-- SUPABASE STORAGE BUCKET
-- ============================================================
-- Run this in Supabase dashboard or via management API:
-- insert into storage.buckets (id, name, public) values ('crm-documents', 'crm-documents', false);
-- Storage RLS: only authenticated users can access their linked documents

-- ============================================================
-- GDPR / UK GDPR COMPLIANCE NOTES
-- ============================================================
-- Lawful basis: Legitimate interest or explicit consent (gdpr_consent field)
-- Retention: Candidate data retained 2 years from last activity, then deleted
-- Right to erasure: Requestable by email, processed within 30 days
-- Data transfers outside UK/EEA: Standard Contractual Clauses (SCCs) apply
-- Privacy notice URL must be displayed on all candidate-facing forms
-- The gdpr_consent_date records when consent was given

-- Automated retention cleanup (run as scheduled function in Supabase):
-- delete from candidates
--   where updated_at < now() - interval '2 years'
--   and gdpr_consent = false;
