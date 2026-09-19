-- ============================================================================
-- 003 — SEALED: DOCUMENT & SIGNATURE ENGINE
--
-- This is the core product. The recruitment platform is one vertical consumer
-- of it; nothing in this file knows what a candidate is.
--
-- Design rules:
--   1. Provider-agnostic. `provider` + `provider_ref` let the same envelope be
--      fulfilled by the built-in engine, PandaDoc, DocuSign or anything else.
--   2. The audit trail is append-only and immutable. Evidence quality is the
--      product: ECTA s13 (South Africa), eIDAS (EU) and the UK eSignature
--      regime all turn on being able to show who signed what, when, and how
--      their identity was established.
--   3. Signed content is addressed by hash so tampering is detectable.
-- ============================================================================

create type envelope_status as enum (
  'draft',      -- being assembled
  'sent',       -- dispatched to the first recipient
  'in_progress',-- at least one recipient has acted
  'completed',  -- every required signer has signed
  'declined',   -- a recipient refused
  'voided',     -- cancelled by the sender
  'expired'     -- passed its deadline unsigned
);

create type recipient_role as enum ('signer', 'approver', 'cc', 'filler');
create type recipient_status as enum (
  'pending', 'delivered', 'viewed', 'signed', 'declined', 'bounced'
);

-- How the recipient's identity was established. Drives evidence weight.
create type auth_method as enum (
  'email_link',   -- possession of the emailed link
  'sms_otp',      -- one-time passcode to a phone
  'access_code',  -- shared secret set by the sender
  'id_document',  -- uploaded identity document
  'platform_sso'  -- already authenticated in the platform
);

create type field_type as enum (
  'signature', 'initials', 'full_name', 'date_signed',
  'text', 'number', 'checkbox', 'dropdown', 'attachment'
);

-- ---------------------------------------------------------------------------
-- Reusable templates (offer letter, contract of employment, terms of business)
-- ---------------------------------------------------------------------------
create table document_templates (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organisations(id) on delete cascade,
  name          text not null,
  description   text,
  category      text,        -- vertical hint, e.g. 'offer_letter', 'terms_of_business'
  storage_path  text,        -- source file in the `sealed-documents` bucket
  body_html     text,        -- or a merge-field template rendered at send time
  -- Field layout, validated in the application against the `field_type` enum.
  field_schema  jsonb not null default '[]'::jsonb,
  merge_keys    text[] not null default '{}',
  active        boolean not null default true,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on document_templates (org_id) where active;

-- ---------------------------------------------------------------------------
-- Envelopes — one signing transaction
-- ---------------------------------------------------------------------------
create table envelopes (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organisations(id) on delete cascade,
  template_id    uuid references document_templates(id) on delete set null,

  subject        text not null,
  message        text,
  status         envelope_status not null default 'draft',

  -- Which provider fulfils this envelope. 'sealed' is the built-in engine.
  provider       text not null default 'sealed',
  provider_ref   text,                    -- external id, e.g. a PandaDoc doc id
  provider_meta  jsonb not null default '{}'::jsonb,

  -- Ordered signing: recipients act in `signing_order` sequence when true.
  sequential     boolean not null default false,

  -- Polymorphic link back to whatever vertical object caused this envelope.
  -- Deliberately not a foreign key: the engine must not depend on the vertical.
  subject_type   text,                    -- 'candidate' | 'deal' | 'placement' | ...
  subject_id     uuid,

  sent_at        timestamptz,
  completed_at   timestamptz,
  expires_at     timestamptz,
  reminder_every interval,
  last_reminder_at timestamptz,

  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint completed_needs_timestamp
    check (status <> 'completed' or completed_at is not null)
);
create index on envelopes (org_id, status);
create index on envelopes (org_id, subject_type, subject_id);
create index on envelopes (provider, provider_ref);

-- ---------------------------------------------------------------------------
-- Documents inside an envelope
-- ---------------------------------------------------------------------------
create table envelope_documents (
  id            uuid primary key default gen_random_uuid(),
  envelope_id   uuid not null references envelopes(id) on delete cascade,
  org_id        uuid not null references organisations(id) on delete cascade,
  file_name     text not null,
  mime_type     text not null,
  storage_path  text not null,
  page_count    int,
  size_bytes    bigint,
  position      int not null default 0,

  -- SHA-256 of the bytes at seal time. Re-hash on download to prove integrity.
  content_hash  text,
  sealed_path   text,        -- flattened, signed output
  sealed_hash   text,
  created_at    timestamptz not null default now()
);
create index on envelope_documents (envelope_id, position);

-- ---------------------------------------------------------------------------
-- Recipients
-- ---------------------------------------------------------------------------
create table envelope_recipients (
  id             uuid primary key default gen_random_uuid(),
  envelope_id    uuid not null references envelopes(id) on delete cascade,
  org_id         uuid not null references organisations(id) on delete cascade,

  full_name      text not null,
  email          citext not null,
  phone          text,
  role           recipient_role not null default 'signer',
  signing_order  int not null default 1,
  status         recipient_status not null default 'pending',

  auth_method    auth_method not null default 'email_link',
  -- Only the hash is stored; the raw token lives in the emailed link alone.
  access_token_hash text unique,
  access_code_hash  text,
  otp_hash          text,
  otp_expires_at    timestamptz,
  failed_auth_count int not null default 0,

  delivered_at   timestamptz,
  first_viewed_at timestamptz,
  signed_at      timestamptz,
  declined_at    timestamptz,
  decline_reason text,

  -- Evidence captured at the moment of signing.
  signed_ip      inet,
  signed_user_agent text,
  signature_image_path text,          -- drawn or typed mark
  consent_to_electronic_signature boolean not null default false,

  created_at     timestamptz not null default now(),
  unique (envelope_id, email, signing_order)
);
create index on envelope_recipients (envelope_id, signing_order);
create index on envelope_recipients (org_id, status);

-- ---------------------------------------------------------------------------
-- Fields placed on a document
-- ---------------------------------------------------------------------------
create table envelope_fields (
  id           uuid primary key default gen_random_uuid(),
  envelope_id  uuid not null references envelopes(id) on delete cascade,
  document_id  uuid not null references envelope_documents(id) on delete cascade,
  recipient_id uuid references envelope_recipients(id) on delete cascade,
  org_id       uuid not null references organisations(id) on delete cascade,

  type         field_type not null,
  label        text,
  required     boolean not null default true,
  page         int not null default 1,
  -- Position as a fraction of page width/height so it survives re-rendering.
  x            numeric(6,5) not null check (x between 0 and 1),
  y            numeric(6,5) not null check (y between 0 and 1),
  width        numeric(6,5) not null default 0.2,
  height       numeric(6,5) not null default 0.04,

  options      text[],           -- for dropdown
  value        text,             -- filled at signing time
  filled_at    timestamptz,
  created_at   timestamptz not null default now()
);
create index on envelope_fields (envelope_id);
create index on envelope_fields (recipient_id) where recipient_id is not null;

-- ---------------------------------------------------------------------------
-- Audit trail — append-only. This table is the evidence.
-- ---------------------------------------------------------------------------
create table envelope_events (
  id           bigserial primary key,
  envelope_id  uuid not null references envelopes(id) on delete cascade,
  org_id       uuid not null references organisations(id) on delete cascade,
  recipient_id uuid references envelope_recipients(id) on delete set null,

  event_type   text not null,   -- created|sent|delivered|viewed|field_filled|
                                -- signed|declined|voided|completed|reminded|
                                -- auth_failed|downloaded
  actor_label  text not null,   -- name/email frozen at event time
  detail       jsonb not null default '{}'::jsonb,
  ip_address   inet,
  user_agent   text,
  occurred_at  timestamptz not null default now()
);
create index on envelope_events (envelope_id, occurred_at);

-- Enforce immutability at the database level, not just in application code.
create or replace function reject_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'envelope_events is append-only';
end;
$$;
create trigger t_events_no_update before update or delete on envelope_events
  for each row execute function reject_mutation();

-- ---------------------------------------------------------------------------
-- Completion certificate — the artefact handed over in a dispute
-- ---------------------------------------------------------------------------
create table signature_certificates (
  id            uuid primary key default gen_random_uuid(),
  envelope_id   uuid not null unique references envelopes(id) on delete cascade,
  org_id        uuid not null references organisations(id) on delete cascade,
  storage_path  text not null,
  -- SHA-256 over the ordered event log plus every sealed document hash.
  evidence_hash text not null,
  issued_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Advance the envelope when its recipients finish
-- ---------------------------------------------------------------------------
create or replace function sync_envelope_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_outstanding int;
begin
  if new.status = 'declined' then
    update envelopes
       set status = 'declined', updated_at = now()
     where id = new.envelope_id and status not in ('voided', 'completed');
    return new;
  end if;

  if new.status = 'signed' then
    select count(*) into v_outstanding
      from envelope_recipients
     where envelope_id = new.envelope_id
       and role in ('signer', 'approver')
       and status <> 'signed';

    if v_outstanding = 0 then
      update envelopes
         set status = 'completed', completed_at = now(), updated_at = now()
       where id = new.envelope_id and status not in ('voided', 'declined');
    else
      update envelopes
         set status = 'in_progress', updated_at = now()
       where id = new.envelope_id and status = 'sent';
    end if;
  end if;

  return new;
end;
$$;

create trigger t_recipient_status
  after update of status on envelope_recipients
  for each row when (old.status is distinct from new.status)
  execute function sync_envelope_status();

create trigger t_tmpl_touch before update on document_templates
  for each row execute function touch_updated_at();
create trigger t_env_touch before update on envelopes
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
--
-- Note: recipients are usually NOT platform users. They reach the envelope
-- through a signing endpoint that runs with the service role and authorises
-- on access_token_hash, never through these policies.
-- ---------------------------------------------------------------------------
alter table document_templates     enable row level security;
alter table envelopes              enable row level security;
alter table envelope_documents     enable row level security;
alter table envelope_recipients    enable row level security;
alter table envelope_fields        enable row level security;
alter table envelope_events        enable row level security;
alter table signature_certificates enable row level security;

create policy tmpl_member on document_templates for all
  using (org_id in (select current_org_ids()))
  with check (org_id in (select current_org_ids()));

create policy env_member on envelopes for all
  using (org_id in (select current_org_ids()))
  with check (org_id in (select current_org_ids()));

create policy envdoc_member on envelope_documents for all
  using (org_id in (select current_org_ids()))
  with check (org_id in (select current_org_ids()));

create policy envrec_member on envelope_recipients for all
  using (org_id in (select current_org_ids()))
  with check (org_id in (select current_org_ids()));

create policy envfield_member on envelope_fields for all
  using (org_id in (select current_org_ids()))
  with check (org_id in (select current_org_ids()));

create policy envevent_select on envelope_events for select
  using (org_id in (select current_org_ids()));
create policy envevent_insert on envelope_events for insert
  with check (org_id in (select current_org_ids()));

create policy cert_member on signature_certificates for select
  using (org_id in (select current_org_ids()));
