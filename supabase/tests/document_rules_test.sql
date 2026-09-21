-- ============================================================================
-- What may be collected about a candidate, and when.
-- ============================================================================
\set ON_ERROR_STOP on
\set QUIET on

begin;

create or replace function assert(cond boolean, label text)
returns void language plpgsql as $$
begin
  if not cond then raise exception 'FAILED: %', label; end if;
  raise notice 'passed: %', label;
end $$;

insert into auth.users (id, email)
values ('0d000000-0000-0000-0000-00000000000d', 'docs@test.test');

set local role authenticated;
set local request.jwt.claim.sub = '0d000000-0000-0000-0000-00000000000d';
select create_organisation('Docs Test', 'docs-test', 'ZA');
reset role;

\set org '(select id from organisations where slug = ''docs-test'')'

insert into clients (id, org_id, name)
values ('c3000000-0000-0000-0000-000000000001', :org, 'Client Co');
insert into jobs (id, org_id, client_id, title, slug)
values ('30c00000-0000-0000-0000-000000000001', :org,
        'c3000000-0000-0000-0000-000000000001', 'Financial Manager', 'financial-manager');
insert into candidates (id, org_id, full_name, email)
values ('cb000000-0000-0000-0000-000000000001', :org, 'Ayanda Zulu', 'a@test.test');
insert into applications (id, org_id, job_id, candidate_id, stage_id)
values ('ab000000-0000-0000-0000-000000000001', :org,
        '30c00000-0000-0000-0000-000000000001',
        'cb000000-0000-0000-0000-000000000001',
        (select id from pipeline_stages where org_id = :org and kind='candidate' and position=2));

\set cand '''cb000000-0000-0000-0000-000000000001'''

-- ---------------------------------------------------------------------------
-- The offer flag is set on the offer stage, not guessed at upload time
-- ---------------------------------------------------------------------------
select assert(
  (select count(*) from pipeline_stages
    where org_id = :org and kind = 'candidate' and is_offer) >= 1,
  'the seeded pipeline marks where an offer exists');

select assert(not candidate_is_post_offer(:org, :cand),
  'a candidate at screening stage is not post-offer');

-- ---------------------------------------------------------------------------
-- An ordinary document is unaffected by any of this
-- ---------------------------------------------------------------------------
insert into documents (org_id, file_name, mime_type, document_type,
                       storage_path, subject_type, subject_id)
values (:org, 'cv.pdf', 'application/pdf', 'cv',
        'x/cv.pdf', 'candidate', :cand);
select assert(true, 'a CV uploads without ceremony');

-- ---------------------------------------------------------------------------
-- Post-offer documents
-- ---------------------------------------------------------------------------
do $$
declare v_org uuid;
begin
  select id into v_org from organisations where slug = 'docs-test';
  begin
    insert into documents (org_id, file_name, mime_type, document_type,
                           storage_path, subject_type, subject_id)
    values (v_org, 'bank.pdf', 'application/pdf', 'banking_details',
            'x/bank.pdf', 'candidate', 'cb000000-0000-0000-0000-000000000001');
    raise exception 'FAILED: banking details were collected before an offer';
  exception when insufficient_privilege then
    raise notice 'passed: banking details cannot be collected before an offer';
  end;
end $$;

-- Move to the offer stage and it becomes lawful.
update applications
   set stage_id = (select id from pipeline_stages
                    where org_id = :org and kind='candidate' and is_offer
                    order by position limit 1)
 where id = 'ab000000-0000-0000-0000-000000000001';

select assert(candidate_is_post_offer(:org, :cand),
  'once an offer is made the candidate is post-offer');

insert into documents (org_id, file_name, mime_type, document_type,
                       storage_path, subject_type, subject_id)
values (:org, 'bank.pdf', 'application/pdf', 'banking_details',
        'x/bank.pdf', 'candidate', :cand);
select assert(true, 'and banking details can then be collected');

-- ---------------------------------------------------------------------------
-- Special personal information needs consent, and a criminal check needs more
-- ---------------------------------------------------------------------------
do $$
declare v_org uuid;
begin
  select id into v_org from organisations where slug = 'docs-test';
  begin
    insert into documents (org_id, file_name, mime_type, document_type,
                           storage_path, subject_type, subject_id, justification)
    values (v_org, 'saps.pdf', 'application/pdf', 'criminal_check',
            'x/saps.pdf', 'candidate', 'cb000000-0000-0000-0000-000000000001',
            'Role requires handling of cash.');
    raise exception 'FAILED: a criminal check was stored without consent';
  exception when insufficient_privilege then
    raise notice 'passed: special personal information needs consent first';
  end;
end $$;

update candidates set consent_given = true, consent_at = now() where id = :cand;

do $$
declare v_org uuid;
begin
  select id into v_org from organisations where slug = 'docs-test';
  begin
    insert into documents (org_id, file_name, mime_type, document_type,
                           storage_path, subject_type, subject_id)
    values (v_org, 'saps.pdf', 'application/pdf', 'criminal_check',
            'x/saps.pdf', 'candidate', 'cb000000-0000-0000-0000-000000000001');
    raise exception 'FAILED: a criminal check was stored with no s27 justification';
  exception when insufficient_privilege then
    raise notice 'passed: a criminal record check needs its s27 justification recorded';
  end;
end $$;

insert into documents (org_id, file_name, mime_type, document_type,
                       storage_path, subject_type, subject_id, justification)
values (:org, 'saps.pdf', 'application/pdf', 'criminal_check',
        'x/saps.pdf', 'candidate', :cand,
        'The role involves handling cash; consent obtained on the vetting form.');
select assert(true, 'with consent and a justification it is allowed');

-- A medical disclosure is special AND post-offer, and consent is not enough
-- on its own to make it early.
select assert(
  (select special_personal_information and post_offer_only
     from document_kinds where code = 'medical_disclosure'),
  'a medical disclosure is both special and post-offer only');

-- ---------------------------------------------------------------------------
-- An unknown type is refused rather than stored as free text
-- ---------------------------------------------------------------------------
do $$
declare v_org uuid;
begin
  select id into v_org from organisations where slug = 'docs-test';
  begin
    insert into documents (org_id, file_name, mime_type, document_type,
                           storage_path, subject_type, subject_id)
    values (v_org, 'x.pdf', 'application/pdf', 'vibes',
            'x/x.pdf', 'candidate', 'cb000000-0000-0000-0000-000000000001');
    raise exception 'FAILED: an unknown document type was accepted';
  exception when foreign_key_violation then
    raise notice 'passed: an unknown document type is refused';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- None of this applies to a client's own paperwork
-- ---------------------------------------------------------------------------
insert into documents (org_id, file_name, mime_type, document_type,
                       storage_path, subject_type, subject_id)
values (:org, 'tob.pdf', 'application/pdf', 'terms_of_business',
        'x/tob.pdf', 'client', 'c3000000-0000-0000-0000-000000000001');
select assert(true, 'a client document is not gated on candidate consent');

-- ---------------------------------------------------------------------------
-- Cross-tenant
-- ---------------------------------------------------------------------------
insert into auth.users (id, email)
values ('0d000000-0000-0000-0000-00000000000e', 'outsider@elsewhere.test');
set local role authenticated;
set local request.jwt.claim.sub = '0d000000-0000-0000-0000-00000000000e';

do $$
declare v_org uuid;
begin
  select id into v_org from organisations where slug = 'docs-test';
  begin
    perform candidate_is_post_offer(v_org, 'cb000000-0000-0000-0000-000000000001');
    raise exception 'FAILED: an outsider probed another agency''s candidate';
  exception when insufficient_privilege then
    raise notice 'passed: an outsider cannot probe another agency''s candidate';
  end;
end $$;

reset role;

do $$
begin
  if has_function_privilege('anon', 'candidate_is_post_offer(uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'document_collection_allowed()', 'execute') then
    raise exception 'FAILED: the document rules are anon-callable';
  end if;
  raise notice 'passed: the document rules are not anon-callable';
end $$;

rollback;

\echo ''
\echo 'All document rule assertions passed.'
