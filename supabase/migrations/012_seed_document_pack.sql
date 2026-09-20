-- ============================================================================
-- 012 — SEED THE STANDARD AGREEMENT PACK
--
-- Installed into every new workspace so an agency is not starting from a
-- blank template library on day one.
--
-- Two of these are the business's own documents, reproduced as supplied and
-- marked `needs_legal_review` because the source carries that disclaimer
-- itself. The rest were named as required but not supplied, so they ship as
-- clause skeletons marked `needs_legal_drafting`. Inventing contract prose
-- and seeding it as ready-to-send would be worse than shipping nothing,
-- because somebody would send it.
--
-- Merge keys are resolved at send time from the organisation, client and
-- candidate records. A key with no value renders as a visible [ ] blank
-- rather than silently disappearing.
-- ============================================================================

alter table document_templates
  add column if not exists status template_status not null default 'needs_legal_review',
  add column if not exists jurisdiction text,
  add column if not exists signed_by text[] not null default '{}',
  add column if not exists is_system boolean not null default false;

comment on column document_templates.status is
  'ready = supplied and usable; needs_legal_review = usable text, unreviewed; '
  'needs_legal_drafting = structure only, clauses must be written.';

create or replace function seed_document_pack(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin

-- ---------------------------------------------------------------------------
-- 1. Terms of Business — supplied by the business, reproduced as given
-- ---------------------------------------------------------------------------
insert into document_templates
  (org_id, name, description, category, jurisdiction, status, is_system,
   signed_by, merge_keys, field_schema, body_html)
values (
  p_org,
  'Standard Terms of Business — Permanent Recruitment',
  'Scope of services, fees, replacement guarantee and POPIA obligations between the agency and a client.',
  'terms_of_business', 'ZA', 'needs_legal_review', true,
  array['agency','client'],
  array['agency_legal_name','agency_registration_number','client_legal_name',
        'client_registration_number','fee_percent','payment_terms_days',
        'guarantee_days','replacement_window_days','introduction_validity_months'],
  $f$[
    {"type":"full_name","label":"Agency signatory name","recipient":"agency","required":true},
    {"type":"signature","label":"Signed for the Agency","recipient":"agency","required":true},
    {"type":"date_signed","label":"Date","recipient":"agency","required":true},
    {"type":"full_name","label":"Client signatory name","recipient":"client","required":true},
    {"type":"signature","label":"Signed for the Client","recipient":"client","required":true},
    {"type":"date_signed","label":"Date","recipient":"client","required":true}
  ]$f$::jsonb,
  $t1$STANDARD TERMS OF BUSINESS FOR PERMANENT RECRUITMENT SERVICES

ENTERED INTO BY AND BETWEEN:

{{agency_legal_name}}
Registration Number: {{agency_registration_number}}
(Hereinafter referred to as the "Agency")

AND

{{client_legal_name}}
Registration Number: {{client_registration_number}}
(Hereinafter referred to as the "Client")

1. DEFINITIONS

1.1. "Candidate" means any person introduced by the Agency to the Client for an Engagement.
1.2. "Engagement" means the employment, hire, or other use of the Candidate by the Client on a permanent basis.
1.3. "Introduction" means the passing of a Candidate's curriculum vitae (CV) or details to the Client by the Agency.
1.4. "Total Cost to Company (TCTC)" means the total guaranteed annual remuneration package payable to the Candidate, including basic salary, guaranteed bonuses, and all employer contributions to medical aid, pension, and provident funds.
1.5. "POPIA" means the Protection of Personal Information Act No. 4 of 2013.

2. ACCEPTANCE OF TERMS

2.1. These Terms and Conditions are deemed to be accepted by the Client upon the Client requesting the Agency to introduce Candidates, or the interviewing of a Candidate, or the passing on of any information about a Candidate to any third party.

3. FEES AND PAYMENT

3.1. The placement fee is calculated at {{fee_percent}}% of the Candidate's first-year Total Cost to Company (TCTC), excluding VAT.
3.2. Value Added Tax (VAT) at the prevailing South African rate (currently 15%) will be added to all invoices where applicable.
3.3. Invoices are generated on the day the Candidate accepts the formal offer of employment and are payable within {{payment_terms_days}} days of the invoice date.
3.4. Overdue accounts will attract interest at the maximum rate permissible under the National Credit Act or the prime lending rate of the Agency's bank plus 2%.

4. REPLACEMENT GUARANTEE

4.1. Should the Candidate's employment terminate within {{guarantee_days}} days of the commencement date, the Agency will use its best endeavours to find a suitable replacement at no additional fee.
4.2. This guarantee only applies if:
  a) The fee was paid in full within the stipulated payment period.
  b) The Agency was notified in writing within 7 days of the termination.
  c) The termination was not due to retrenchment, unfair dismissal, or a material change in the job description.
4.3. If a replacement cannot be found within {{replacement_window_days}} days, a credit note will be issued based on a sliding scale:
  - Departure within 0-30 days: 75% credit
  - Departure within 31-60 days: 50% credit
  - Departure within 61-90 days: 25% credit

5. SUITABILITY AND LIABILITY

5.1. While the Agency makes every effort to ensure the suitability of Candidates, the Client is ultimately responsible for making their own assessments, taking up references, and ensuring the Candidate holds the required qualifications and work permits for South Africa.
5.2. The Agency shall not be liable for any loss, damage, delay, or expense incurred by the Client arising directly or indirectly from the Introduction or Engagement of a Candidate.

6. CONFIDENTIALITY AND POPIA COMPLIANCE

6.1. Both parties agree to keep all information relating to the business, candidates, and financial affairs of the other party strictly confidential.
6.2. Both parties warrant that they will comply fully with their respective obligations under POPIA.
6.3. The Client agrees that CVs and personal information of Candidates are provided solely for the purpose of potential employment and must be processed, securely stored, and securely destroyed in accordance with POPIA guidelines.
6.4. The Client may not introduce the Candidate to any third party. If this occurs and results in an Engagement within {{introduction_validity_months}} months of the initial Introduction, the Client will be liable for the full placement fee.

7. GOVERNING LAW

7.1. This Agreement shall be governed by and construed in accordance with the laws of the Republic of South Africa. Any dispute arising from this agreement shall be subject to the jurisdiction of the South African courts.

SIGNED ON BEHALF OF THE AGENCY:

SIGNED ON BEHALF OF THE CLIENT:

---
This template is provided for informational purposes. Have it reviewed by a South African labour law practitioner to confirm it meets your operational needs before you rely on it.$t1$
);

-- ---------------------------------------------------------------------------
-- 2. Candidate POPIA consent — supplied by the business, reproduced as given
-- ---------------------------------------------------------------------------
insert into document_templates
  (org_id, name, description, category, jurisdiction, status, is_system,
   signed_by, merge_keys, field_schema, body_html)
values (
  p_org,
  'Candidate Consent for the Processing of Personal Information',
  'POPIA consent covering collection, processing, sharing, retention and data subject rights. Sign before any candidate data is processed.',
  'candidate_consent', 'ZA', 'needs_legal_review', true,
  array['candidate'],
  -- The candidate's name and ID number are not merge fields: the signer
  -- types them into the signature block, so they live in field_schema.
  array['agency_legal_name','information_officer_name','information_officer_email',
        'retention_months'],
  $f$[
    {"type":"full_name","label":"Candidate name","recipient":"candidate","required":true},
    {"type":"text","label":"ID / Passport number","recipient":"candidate","required":true},
    {"type":"signature","label":"Signature","recipient":"candidate","required":true},
    {"type":"date_signed","label":"Date","recipient":"candidate","required":true}
  ]$f$::jsonb,
  $t2$CANDIDATE CONSENT FOR THE PROCESSING OF PERSONAL INFORMATION
In compliance with the Protection of Personal Information Act, No. 4 of 2013 (POPIA)

Agency Name: {{agency_legal_name}}
Information Officer: {{information_officer_name}}
Contact Email: {{information_officer_email}}

1. PURPOSE AND INTRODUCTION

To assist you in finding employment, {{agency_legal_name}} (hereinafter referred to as "the Agency") needs to collect, process, and store your personal information. Under the Protection of Personal Information Act (POPIA), we are required to obtain your explicit consent to do so.

2. NATURE OF PERSONAL INFORMATION COLLECTED

The personal information we collect and process may include, but is not limited to:
  - Identity number, passport number, and date of birth.
  - Contact details (email, phone number, physical address).
  - Curriculum Vitae (CV), employment history, and references.
  - Educational qualifications, certificates, and professional memberships.
  - Remuneration details and payslips (where legally permissible and necessary).
  - Results of any background checks (criminal, credit, or academic verifications) as required by prospective employers.

3. PURPOSE OF PROCESSING

By signing this document, you agree that the Agency may use your personal information for the following purposes:
  - Assessing your suitability for permanent or temporary employment opportunities.
  - Submitting your CV and relevant details to prospective employers (Clients of the Agency) for consideration, only with your prior knowledge.
  - Conducting reference checks with your provided referees.
  - Conducting qualification, credit, and criminal checks (if required by the Client and with your specific notification).
  - Communicating with you regarding job opportunities, interview arrangements, and employment offers.

4. SHARING OF INFORMATION

Your personal information will only be shared with prospective employers who have agreed to maintain the confidentiality and security of your data in line with POPIA regulations. We will not sell your data or share it with unauthorised third parties for marketing purposes.

5. DATA RETENTION

The Agency will retain your personal information securely on our database for a period of {{retention_months}} months to consider you for future opportunities. After this period, we will contact you to renew your consent or securely destroy your data, unless retention is required by law.

6. YOUR RIGHTS AS A DATA SUBJECT

Under POPIA, you have the right to:
  - Request access to the personal information we hold about you.
  - Request correction or updating of your personal information.
  - Request the deletion or destruction of your personal information.
  - Withdraw your consent at any time by notifying our Information Officer in writing (this will not affect the lawfulness of processing based on consent before its withdrawal).
  - Lodge a complaint with the Information Regulator of South Africa.

7. DECLARATION AND CONSENT

I, the undersigned, hereby confirm that I have read and understood the contents of this document. I voluntarily consent to the collection, processing, storage, and sharing of my personal information by {{agency_legal_name}} for the purposes of recruitment, as outlined above.

I confirm that the information I have provided, and will provide in the future, is accurate and up to date.

---
This template is provided for informational purposes. Have it reviewed by a legal professional specialising in South African privacy law to confirm full compliance before you rely on it.$t2$
);

-- ---------------------------------------------------------------------------
-- 3-7. Named but not supplied. Structure only — the clauses must be written
--      by a practitioner before any of these is sent.
-- ---------------------------------------------------------------------------
insert into document_templates
  (org_id, name, description, category, jurisdiction, status, is_system,
   signed_by, merge_keys, field_schema, body_html)
select p_org, v.name, v.description, v.category, 'ZA', 'needs_legal_drafting', true,
       v.signed_by, v.merge_keys,
       $f$[
         {"type":"full_name","label":"Name","required":true},
         {"type":"signature","label":"Signature","required":true},
         {"type":"date_signed","label":"Date","required":true}
       ]$f$::jsonb,
       v.body
from (values
  ('Non-Disclosure Agreement',
   'Protects confidential client information such as unannounced products or internal restructuring.',
   'nda', array['agency','client'],
   array['agency_legal_name','client_legal_name'],
   $s1$NON-DISCLOSURE AGREEMENT

NOT YET DRAFTED. This template exists so the workflow is in place; the
clauses below are headings, not enforceable terms. Have a practitioner draft
the text before sending it to anyone.

Between {{agency_legal_name}} and {{client_legal_name}}.

Clauses this agreement needs to cover:
  1. Definition of Confidential Information, and what is excluded from it
  2. Permitted purpose and permitted recipients
  3. Standard of care and security obligations
  4. Duration of the obligation, and survival after termination
  5. Return or destruction of information on request
  6. Carve-outs for disclosure required by law or court order
  7. Remedies, including interdictory relief
  8. Governing law: Republic of South Africa$s1$),

  ('Data Processing Agreement',
   'Sets out how candidate personal information transferred to the client must be secured and processed.',
   'dpa', array['agency','client'],
   array['agency_legal_name','client_legal_name'],
   $s2$DATA PROCESSING AGREEMENT

NOT YET DRAFTED. Headings only. A DPA carries statutory obligations and
must be drafted by a practitioner.

Between {{agency_legal_name}} and {{client_legal_name}}.

Clauses this agreement needs to cover:
  1. Which party is responsible party and which is operator under POPIA
     (controller and processor under UK/EU GDPR)
  2. Subject matter, duration, nature and purpose of the processing
  3. Categories of data subject and of personal information
  4. Documented instructions, and the operator acting only on them
  5. Confidentiality undertakings from everyone with access
  6. Security measures under POPIA s19, and breach notification under s22,
     including the timeframe for notifying the responsible party
  7. Sub-processors: prior authorisation and flow-down of obligations
  8. Cross-border transfer safeguards under POPIA s72
  9. Assistance with data subject requests
  10. Deletion or return of personal information at the end of the engagement
  11. Audit and inspection rights$s2$),

  ('Right to Represent',
   'The candidate authorises the agency to submit their profile to one named employer, preventing dual submission.',
   'rtr', array['candidate'],
   array['agency_legal_name','candidate_full_name','client_name','role_title','rtr_expires_at'],
   $s3$RIGHT TO REPRESENT

NOT YET DRAFTED. Headings only. This one is short but it decides who is owed
a fee, so it should be drafted properly.

{{candidate_full_name}} authorises {{agency_legal_name}} to submit their
profile to {{client_name}} for the role of {{role_title}}.

Clauses this agreement needs to cover:
  1. The named employer, and the named role or roles
  2. Exclusivity: the candidate confirms they have not been submitted to this
     employer by another agency, and by whom if they have
  3. Validity period, expiring {{rtr_expires_at}}
  4. What happens if the candidate applies directly during that period
  5. Withdrawal by either party, and the effect on any live process
  6. Confirmation that this is not an employment contract and creates no
     obligation to hire$s3$),

  ('Background Check Consent',
   'Separate written consent for criminal, credit and academic verification. Required in addition to the general POPIA consent.',
   'background_check_consent', array['candidate'],
   array['agency_legal_name','candidate_full_name','candidate_id_number'],
   $s4$BACKGROUND CHECK CONSENT

NOT YET DRAFTED. Headings only.

A criminal record check is special personal information under POPIA s26 and
needs a s27 justification as well as consent. A credit check must be relevant
to the role. Neither is covered by the general processing consent, which is
why this is a separate document.

Candidate: {{candidate_full_name}} ({{candidate_id_number}})
Agency: {{agency_legal_name}}

Clauses this document needs to cover:
  1. Exactly which checks are authorised, each one ticked separately
  2. Why each check is relevant to the specific role
  3. The verification bureau or third party conducting the check
  4. What happens to an adverse finding, and the candidate's right to
     respond before any decision is taken
  5. Retention period for the result, and secure destruction after it
  6. Withdrawal of consent, and its effect on the application
  7. For criminal checks: the s27 justification being relied on$s4$),

  ('Temporary Employment Contract',
   'For agencies acting as employer of record for temporary staff. Payroll and statutory terms.',
   'temp_employment_contract', array['agency','candidate'],
   array['agency_legal_name','candidate_full_name','client_name','role_title'],
   $s5$TEMPORARY EMPLOYMENT CONTRACT

NOT YET DRAFTED. Headings only. This is a contract of employment and carries
statutory obligations under the Basic Conditions of Employment Act and the
Labour Relations Act. It must be drafted by a labour law practitioner.

Employer: {{agency_legal_name}}
Employee: {{candidate_full_name}}
Assignment: {{role_title}} at {{client_name}}

Clauses this contract needs to cover:
  1. Parties, and that the agency is the employer of record
  2. Assignment, client site, and that the client is not the employer
  3. Duration, and whether it is fixed term or open ended
  4. Ordinary hours, overtime, and rest periods under the BCEA
  5. Remuneration, pay interval, and deductions
  6. Leave: annual, sick, family responsibility, parental
  7. UIF, SDL and any statutory contributions
  8. Deemed employment under LRA s198A where the assignment exceeds three
     months, and what that means for both parties
  9. Termination and notice
  10. Confidentiality and return of client property
  11. Governing law: Republic of South Africa$s5$)
) as v(name, description, category, signed_by, merge_keys, body);

end;
$$;

-- ---------------------------------------------------------------------------
-- Install the pack with every new workspace
-- ---------------------------------------------------------------------------
create or replace function create_organisation(
  p_name   text,
  p_slug   text,
  p_region region_code default 'ZA'
) returns organisations
language plpgsql security definer set search_path = public as $$
declare
  v_org      organisations;
  v_plan     uuid;
  v_currency char(3);
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  v_currency := default_currency_for_region(p_region);

  insert into organisations (name, legal_name, slug, region, currency, locale, timezone)
  values (
    p_name, p_name,
    lower(p_slug),
    p_region,
    v_currency,
    case p_region when 'ZA' then 'en-ZA' when 'UK' then 'en-GB' else 'en' end,
    case p_region
      when 'ZA' then 'Africa/Johannesburg'
      when 'UK' then 'Europe/London'
      when 'AE' then 'Asia/Dubai'
      when 'US' then 'America/New_York'
      when 'AU' then 'Australia/Sydney'
      else 'UTC' end
  )
  returning * into v_org;

  insert into memberships (org_id, user_id, role)
  values (v_org.id, auth.uid(), 'owner');

  perform seed_default_pipeline(v_org.id);
  perform seed_default_automations(v_org.id);
  perform seed_document_pack(v_org.id);

  insert into careers_sites (org_id, headline, meta_title, meta_description)
  values (
    v_org.id,
    'Careers at ' || p_name,
    left('Careers at ' || p_name, 60),
    left('Open roles at ' || p_name || '. Apply in minutes — we reply to every application.', 160)
  );

  select id into v_plan from pricing_plans where code = 'starter';
  if not exists (select 1 from plan_prices where plan_id = v_plan and currency = v_currency) then
    v_currency := 'USD';
  end if;

  insert into subscriptions (org_id, plan_id, currency, status, trial_ends_at)
  values (v_org.id, v_plan, v_currency, 'trialing', now() + interval '14 days');

  insert into audit_log (org_id, actor_id, entity_type, entity_id, action, new_value)
  values (v_org.id, auth.uid(), 'organisation', v_org.id, 'created',
          jsonb_build_object('name', p_name, 'region', p_region, 'currency', v_currency));

  return v_org;
end;
$$;

revoke all on function create_organisation(text, text, region_code) from public;
grant execute on function create_organisation(text, text, region_code) to authenticated;
revoke execute on function seed_document_pack(uuid) from public, anon, authenticated;
