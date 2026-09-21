-- ============================================================================
-- 019 — WHAT MAY BE COLLECTED, AND WHEN
--
-- The taxonomy already records which document kinds are POPIA s26 special
-- personal information and which are lawful only once an offer has been made.
-- Until now that was description. This enforces it.
--
--   - a post-offer document cannot be attached to a candidate who has not
--     been offered anything; asking for banking details to consider someone
--     is the collection this rule exists to prevent
--   - special personal information needs recorded consent first
--   - a criminal record check additionally needs the s27 justification being
--     relied on, written down, because s26 prohibits the processing and s27
--     is the only thing that lifts the prohibition
--
-- The UI hides what it can, but the rule lives here: a hidden field is not a
-- control, and the same insert can be made straight through the API.
-- ============================================================================

-- Which stage means an offer has actually been made. Flagged rather than
-- inferred from the stage's name, because an agency can rename its stages.
alter table pipeline_stages
  add column if not exists is_offer boolean not null default false;

comment on column pipeline_stages.is_offer is
  'At or beyond this stage an offer exists, which is what makes post-offer '
  'collection lawful. Set on the offer stage, not on the placed stage.';

update pipeline_stages
   set is_offer = true
 where kind = 'candidate'
   and (is_won or lower(name) like '%offer%');

-- The backfill above only reaches pipelines that already exist. A workspace
-- created after this migration seeds its own, so the seeder sets the flag too.
create or replace function seed_default_pipeline(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into pipeline_stages (org_id, kind, name, position, sla_days) values
    (p_org, 'candidate', 'Applied',            1,  3),
    (p_org, 'candidate', 'Screening',          2,  5),
    (p_org, 'candidate', 'Interview',          3,  7),
    (p_org, 'candidate', 'Client Interview',   4, 10),
    (p_org, 'candidate', 'Reference Check',    5,  5),
    (p_org, 'candidate', 'Offer',              6,  5),
    (p_org, 'candidate', 'Placed',             7, null),
    (p_org, 'candidate', 'Rejected',           8, null)
  on conflict do nothing;

  insert into pipeline_stages (org_id, kind, name, position, sla_days, probability_pct, is_won, is_lost) values
    (p_org, 'deal', 'Lead',          1,  7,  10, false, false),
    (p_org, 'deal', 'Contacted',     2,  7,  20, false, false),
    (p_org, 'deal', 'Discovery',     3, 10,  40, false, false),
    (p_org, 'deal', 'Proposal Sent', 4, 10,  60, false, false),
    (p_org, 'deal', 'Negotiation',   5, 14,  80, false, false),
    (p_org, 'deal', 'Signed',        6, null,100, true,  false),
    (p_org, 'deal', 'Lost',          7, null,  0, false, true)
  on conflict do nothing;

  update pipeline_stages set is_won   = true where org_id = p_org and kind = 'candidate' and name = 'Placed';
  update pipeline_stages set is_lost  = true where org_id = p_org and kind = 'candidate' and name = 'Rejected';
  update pipeline_stages set is_offer = true where org_id = p_org and kind = 'candidate' and name in ('Offer', 'Placed');
end;
$$;

revoke execute on function seed_default_pipeline(uuid) from public, anon, authenticated;

-- The justification relied on for special personal information.
alter table documents
  add column if not exists justification text;

comment on column documents.justification is
  'POPIA s27 justification for processing special personal information. '
  'Required for a criminal record check.';

/**
 * Whether an offer exists for this candidate: they are at or past an offer
 * stage on some application, or already placed.
 */
create or replace function candidate_is_post_offer(p_org uuid, p_candidate uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  -- Definer rights, so membership is checked rather than assumed.
  perform assert_org_access(p_org);

  return exists (
    select 1
      from applications a
      join pipeline_stages s on s.id = a.stage_id
     where a.org_id = p_org
       and a.candidate_id = p_candidate
       and (s.is_offer or s.is_won)
  ) or exists (
    select 1
      from placements pl
      join applications a on a.id = pl.application_id
     where pl.org_id = p_org
       and a.candidate_id = p_candidate
  );
end;
$$;

/**
 * Refuse a document the agency is not yet entitled to hold.
 *
 * Only candidate documents are gated: a client's contract has no data subject
 * to protect in this sense.
 */
create or replace function document_collection_allowed()
returns trigger language plpgsql set search_path = public as $$
declare
  k record;
  v_consent boolean;
begin
  select * into k from document_kinds where code = new.document_type;
  if not found then
    -- The foreign key will refuse it anyway; this is just a clearer message.
    raise exception 'unknown document type "%"', new.document_type
      using errcode = 'foreign_key_violation';
  end if;

  if new.subject_type <> 'candidate' then
    return new;
  end if;

  if k.post_offer_only and not candidate_is_post_offer(new.org_id, new.subject_id) then
    raise exception
      '% may only be collected once an offer has been made', k.label
      using errcode = 'insufficient_privilege';
  end if;

  if k.special_personal_information then
    select consent_given into v_consent
      from candidates where id = new.subject_id;

    if not coalesce(v_consent, false) then
      raise exception
        '% is special personal information and needs the candidate''s recorded consent first',
        k.label
        using errcode = 'insufficient_privilege';
    end if;

    -- Consent alone does not lift the s26 prohibition on a criminal record
    -- check; s27 has to supply a justification, and it has to be written down.
    if new.document_type = 'criminal_check'
       and coalesce(trim(new.justification), '') = '' then
      raise exception
        'a criminal record check needs the POPIA s27 justification recorded'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

create trigger t_document_collection_allowed
  before insert or update of document_type, subject_type, subject_id on documents
  for each row execute function document_collection_allowed();

do $$
declare f text;
begin
  foreach f in array array[
    'candidate_is_post_offer(uuid, uuid)',
    'document_collection_allowed()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

grant execute on function candidate_is_post_offer(uuid, uuid) to authenticated;
