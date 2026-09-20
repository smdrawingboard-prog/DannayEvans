-- ============================================================================
-- 014 — THE AGREEMENT PACK AS DATA
--
-- Three of the five undrafted agreements were supplied: the Right to
-- Represent, the background verification consent, and the mutual NDA. They
-- replace their clause skeletons here and are marked `needs_legal_review`
-- like the other supplied documents, because the business's own disclaimer
-- says to have them reviewed.
--
-- Rather than splice more prose into a function body, the pack now lives in
-- a catalogue table. A template is a row, so the next one supplied is an
-- insert, and workspaces that already exist can be topped up instead of
-- being left on whatever shipped the day they signed up.
--
-- Still undrafted: the Data Processing Agreement and the Temporary
-- Employment Contract. Both carry statutory obligations and stay as
-- headings until a practitioner writes them.
-- ============================================================================

create table system_document_templates (
  code         text primary key,
  name         text not null,
  description  text,
  category     text not null,
  jurisdiction text not null default 'ZA',
  status       template_status not null,
  signed_by    text[]  not null default '{}',
  merge_keys   text[]  not null default '{}',
  field_schema jsonb   not null default '[]'::jsonb,
  body_html    text    not null,
  -- Bumped whenever the text changes. A workspace on an older version is
  -- eligible to be brought forward; one that has edited its own copy is not.
  version      int     not null default 1,
  updated_at   timestamptz not null default now()
);

comment on table system_document_templates is
  'The standard agreement pack. Reference data shared by every tenant; a '
  'workspace gets its own editable copy at signup.';

-- Reference data, readable by anyone signed in, writable by nobody.
alter table system_document_templates enable row level security;
create policy system_templates_read on system_document_templates
  for select using (true);
grant select on system_document_templates to authenticated;

-- Link a workspace's copy back to the catalogue entry it came from.
alter table document_templates
  add column if not exists system_code    text references system_document_templates(code),
  add column if not exists system_version int;

create unique index document_templates_one_per_system_code
  on document_templates (org_id, system_code) where system_code is not null;

/**
 * The moment an agency edits the text of a template we shipped, it stops
 * being ours: we will not overwrite their wording on a later top-up. A sync
 * bumps system_version in the same statement, which is how it exempts itself.
 */
create or replace function release_edited_system_template()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.body_html is distinct from old.body_html
     and new.system_version is not distinct from old.system_version then
    new.is_system := false;
  end if;
  return new;
end;
$$;

create trigger t_release_edited_system_template
  before update of body_html on document_templates
  for each row execute function release_edited_system_template();

-- ---------------------------------------------------------------------------
-- The pack
-- ---------------------------------------------------------------------------
insert into system_document_templates
  (code, name, description, category, status, signed_by, merge_keys,
   field_schema, body_html)
values
('terms_of_business',
 'Standard Terms of Business — Permanent Recruitment',
 'Scope of services, fees, replacement guarantee and POPIA obligations between the agency and a client.',
 'terms_of_business', 'needs_legal_review',
 array['agency', 'client'],
 array['agency_legal_name', 'agency_registration_number', 'client_legal_name', 'client_registration_number', 'fee_percent', 'payment_terms_days', 'guarantee_days', 'replacement_window_days', 'introduction_validity_months'],
 $j$[
    {
        "type": "full_name",
        "label": "Agency name",
        "recipient": "agency",
        "required": true
    },
    {
        "type": "signature",
        "label": "Signed for the Agency",
        "recipient": "agency",
        "required": true
    },
    {
        "type": "date_signed",
        "label": "Date",
        "recipient": "agency",
        "required": true
    },
    {
        "type": "full_name",
        "label": "Client name",
        "recipient": "client",
        "required": true
    },
    {
        "type": "signature",
        "label": "Signed for the Client",
        "recipient": "client",
        "required": true
    },
    {
        "type": "date_signed",
        "label": "Date",
        "recipient": "client",
        "required": true
    }
]$j$::jsonb,
 $b$STANDARD TERMS OF BUSINESS FOR PERMANENT RECRUITMENT SERVICES

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
This template is provided for informational purposes. Have it reviewed by a South African labour law practitioner to confirm it meets your operational needs before you rely on it.$b$),

('candidate_consent',
 'Candidate Consent for the Processing of Personal Information',
 'POPIA consent covering collection, processing, sharing, retention and data subject rights. Sign before any candidate data is processed.',
 'candidate_consent', 'needs_legal_review',
 array['candidate'],
 array['agency_legal_name', 'information_officer_email', 'information_officer_name', 'retention_months'],
 $j$[
    {
        "type": "full_name",
        "label": "Candidate full name",
        "recipient": "candidate",
        "required": true
    },
    {
        "type": "text",
        "label": "ID / Passport number",
        "recipient": "candidate",
        "required": true
    },
    {
        "type": "signature",
        "label": "Candidate signature",
        "recipient": "candidate",
        "required": true
    },
    {
        "type": "date_signed",
        "label": "Date",
        "recipient": "candidate",
        "required": true
    }
]$j$::jsonb,
 $b$CANDIDATE CONSENT FOR THE PROCESSING OF PERSONAL INFORMATION
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
This template is provided for informational purposes. Have it reviewed by a legal professional specialising in South African privacy law to confirm full compliance before you rely on it.$b$),

('rtr',
 'Right to Represent',
 'The candidate grants the agency exclusive right to submit them to one named employer for one named role. This is the document that decides who is owed the fee.',
 'rtr', 'needs_legal_review',
 array['candidate', 'agency'],
 array['agency_legal_name', 'candidate_full_name', 'role_title', 'client_name', 'job_reference', 'rtr_validity_months', 'prior_submission_months'],
 $j$[
    {
        "type": "full_name",
        "label": "Candidate full name",
        "recipient": "candidate",
        "required": true
    },
    {
        "type": "text",
        "label": "ID / Passport number",
        "recipient": "candidate",
        "required": true
    },
    {
        "type": "signature",
        "label": "Candidate signature",
        "recipient": "candidate",
        "required": true
    },
    {
        "type": "date_signed",
        "label": "Date",
        "recipient": "candidate",
        "required": true
    },
    {
        "type": "full_name",
        "label": "Agency representative name",
        "recipient": "agency",
        "required": true
    },
    {
        "type": "signature",
        "label": "Signed for the Agency representative",
        "recipient": "agency",
        "required": true
    },
    {
        "type": "date_signed",
        "label": "Date",
        "recipient": "agency",
        "required": true
    }
]$j$::jsonb,
 $b$RIGHT TO REPRESENT (RTR) AGREEMENT

BETWEEN:

{{agency_legal_name}}
(Hereinafter referred to as the "Agency")

AND

{{candidate_full_name}}
(Hereinafter referred to as the "Candidate")

1. REPRESENTATION DETAILS

The Candidate hereby grants the Agency the exclusive right to represent them, submit their Curriculum Vitae (CV), and negotiate on their behalf for the following specific position:

  Position / Job Title: {{role_title}}
  Prospective Employer (Client): {{client_name}}
  Job Reference Number (if applicable): {{job_reference}}

2. EXCLUSIVITY AND DURATION

2.1. The Candidate agrees that this authorization is exclusive to the Agency for the specific Position and Client mentioned above.
2.2. This exclusive representation shall remain valid for a period of {{rtr_validity_months}} months from the date of signature of this agreement.
2.3. During this period, the Candidate agrees not to apply directly to the Client for the specified Position, nor will they authorize any other recruitment agency, broker, or third party to submit their details to the Client for this Position.

3. CANDIDATE DECLARATIONS

By signing this agreement, the Candidate declares and warrants that:

3.1. They have not been submitted to, nor have they interviewed with, the above-mentioned Client for this specific Position through any other recruitment agency or directly within the past {{prior_submission_months}} months.
3.2. All information provided to the Agency, including employment history, qualifications, and reasons for leaving previous employment, is true, accurate, and complete.
3.3. They understand that misrepresentation of any information may lead to the immediate withdrawal of their application or termination of employment if already engaged by the Client.

4. DATA PRIVACY (POPIA)

4.1. The Candidate acknowledges that their personal information will be processed and submitted to the Client in accordance with the Protection of Personal Information Act (POPIA), as previously agreed upon in the Agency's standard Candidate POPIA Consent Form.

5. FEES

5.1. The Candidate acknowledges that the Agency's placement fees are paid entirely by the Client. Under the South African Employment Services Act, the Agency will not charge the Candidate any fees for work-seeking services or placement.

---
This template is provided for informational purposes. Have it reviewed by a South African labour law practitioner before you rely on it.$b$),

('background_check_consent',
 'Consent for Background Verification and Vetting',
 'Separate written consent for criminal, credit, qualification and identity verification. Required in addition to the general POPIA consent.',
 'background_check_consent', 'needs_legal_review',
 array['candidate'],
 array['agency_legal_name', 'candidate_full_name'],
 $j$[
    {
        "type": "text",
        "label": "ID / Passport number",
        "recipient": "candidate",
        "required": true
    },
    {
        "type": "checkbox",
        "label": "Criminal record check (SAPS / AFISwitch)",
        "recipient": "candidate",
        "required": false,
        "document_kind": "criminal_check"
    },
    {
        "type": "checkbox",
        "label": "Educational qualifications (institutions / Umalusi / SAQA)",
        "recipient": "candidate",
        "required": false,
        "document_kind": "qualification"
    },
    {
        "type": "checkbox",
        "label": "Employment references",
        "recipient": "candidate",
        "required": false,
        "document_kind": "reference"
    },
    {
        "type": "checkbox",
        "label": "Professional memberships",
        "recipient": "candidate",
        "required": false,
        "document_kind": "professional_licence"
    },
    {
        "type": "checkbox",
        "label": "Identity verification (Home Affairs)",
        "recipient": "candidate",
        "required": false,
        "document_kind": "id_document"
    },
    {
        "type": "checkbox",
        "label": "Driver's licence / PrDP",
        "recipient": "candidate",
        "required": false
    },
    {
        "type": "checkbox",
        "label": "Credit check \u2014 the role involves handling cash or finances (NCA)",
        "recipient": "candidate",
        "required": false,
        "document_kind": "credit_check"
    },
    {
        "type": "full_name",
        "label": "Candidate full name",
        "recipient": "candidate",
        "required": true
    },
    {
        "type": "signature",
        "label": "Candidate signature",
        "recipient": "candidate",
        "required": true
    },
    {
        "type": "date_signed",
        "label": "Date",
        "recipient": "candidate",
        "required": true
    }
]$j$::jsonb,
 $b$CONSENT FOR BACKGROUND VERIFICATION AND VETTING

Agency Name: {{agency_legal_name}}
(Hereinafter referred to as the "Agency")

Candidate Name: {{candidate_full_name}}

1. PURPOSE OF BACKGROUND CHECKS

As part of the recruitment process, the Agency and/or its prospective Clients require certain background checks to be conducted to verify your credentials, employment history, and general suitability for the proposed position.

These checks are conducted in strict compliance with the Protection of Personal Information Act (POPIA) and the National Credit Act (NCA).

2. TYPES OF VERIFICATIONS

I, the undersigned, hereby authorize the Agency, its designated third-party verification providers (e.g., MIE, LexisNexis), and its Clients to conduct the checks ticked below:

  Criminal Record Check: Verification through the South African Police Service (SAPS) or AFISwitch via fingerprint or ID number.
  Educational Qualifications: Verification of matric, diplomas, degrees, and short courses through the relevant institutions, Umalusi, or SAQA.
  Employment References: Contacting previous employers and listed references to confirm dates of employment, duties, and performance.
  Professional Memberships: Verification of good standing with professional bodies (e.g., SAICA, HPCSA).
  Identity Verification: Validation of ID document/passport through the Department of Home Affairs.
  Driver's License / PrDP: Verification of valid driver's licenses and professional driving permits.

3. CREDIT RECORD CHECK (NCA COMPLIANCE)

Please note: Under the National Credit Act (NCA), credit checks may only be conducted if the position requires trust and honesty and entails the handling of cash or finances.

  Credit Check: I acknowledge that the role I am applying for involves the handling of cash or finances, and I hereby consent to a credit record check being conducted through a registered credit bureau (e.g., TransUnion, Experian, XDS).

4. CANDIDATE DECLARATION AND CONSENT

4.1. I authorize the Agency and its authorized verification agents to forward my personal information (including my name, ID number, and fingerprints if required) to the relevant suppliers, institutions, and government bodies for the purpose of verifying my credentials.
4.2. I understand that the results of these checks will be shared with prospective employers (Clients) for the sole purpose of evaluating my employment application.
4.3. I indemnify the Agency, its verification agents, and its Clients against any liability, claim, or damage that may arise as a result of conducting these checks or relying on the information provided by third-party institutions.
4.4. I confirm that all information and documentation I have provided to the Agency is true, accurate, and complete.

5. WAIVER

I understand that if any of the information provided by me is found to be false, forged, or materially inaccurate, my application may be immediately rejected, or if I am already employed, it may constitute grounds for dismissal by the Client.

---
A criminal record check is special personal information under POPIA s26 and needs a section 27 justification in addition to this consent. A credit check must be relevant to the role. This template is provided for informational purposes. Have it reviewed by a legal professional specialising in South African privacy law before you rely on it.$b$),

('nda',
 'Mutual Non-Disclosure Agreement',
 'Mutual confidentiality between the agency and a client, covering unannounced vacancies and restructuring on one side and candidate data and fee structures on the other.',
 'nda', 'needs_legal_review',
 array['agency', 'client'],
 array['agency_legal_name', 'agency_registration_number', 'client_legal_name', 'client_registration_number', 'nda_duration_years'],
 $j$[
    {
        "type": "signature",
        "label": "Signed for the Agency",
        "recipient": "agency",
        "required": true
    },
    {
        "type": "full_name",
        "label": "Agency signatory name",
        "recipient": "agency",
        "required": true
    },
    {
        "type": "text",
        "label": "Title",
        "recipient": "agency",
        "required": true
    },
    {
        "type": "date_signed",
        "label": "Date",
        "recipient": "agency",
        "required": true
    },
    {
        "type": "signature",
        "label": "Signed for the Client",
        "recipient": "client",
        "required": true
    },
    {
        "type": "full_name",
        "label": "Client signatory name",
        "recipient": "client",
        "required": true
    },
    {
        "type": "text",
        "label": "Title",
        "recipient": "client",
        "required": true
    },
    {
        "type": "date_signed",
        "label": "Date",
        "recipient": "client",
        "required": true
    }
]$j$::jsonb,
 $b$MUTUAL NON-DISCLOSURE AGREEMENT

ENTERED INTO BY AND BETWEEN:

{{agency_legal_name}}
Registration Number: {{agency_registration_number}}
(Hereinafter referred to as the "Agency")

AND

{{client_legal_name}}
Registration Number: {{client_registration_number}}
(Hereinafter referred to as the "Client")

(Collectively referred to as the "Parties" and individually as a "Party")

1. PURPOSE

The Parties intend to engage in discussions regarding the potential provision of recruitment services by the Agency to the Client (the "Purpose"). During these discussions, it may become necessary for either Party (the "Disclosing Party") to disclose certain confidential and proprietary information to the other Party (the "Receiving Party").

2. DEFINITION OF CONFIDENTIAL INFORMATION

"Confidential Information" shall mean any and all non-public information disclosed by one Party to the other, whether orally, in writing, or electronically. This includes, but is not limited to:

  Client Information: Business strategies, unannounced vacancies, organizational restructuring plans, financial data, product developments, and intellectual property.
  Agency Information: Candidate details, CVs, proprietary sourcing methodologies, fee structures, and customized recruitment strategies.
  Any information that, by its nature, should reasonably be considered confidential by the Receiving Party.

3. OBLIGATIONS OF THE RECEIVING PARTY

The Receiving Party agrees to:

3.1. Hold all Confidential Information in strict confidence and exercise the same degree of care to prevent disclosure as it uses to protect its own confidential information (but in no event less than a reasonable degree of care).
3.2. Use the Confidential Information solely for the Purpose stated in Clause 1.
3.3. Not disclose the Confidential Information to any third party without the prior written consent of the Disclosing Party, except to its employees, directors, or advisors who have a strict "need to know" and are bound by similar confidentiality obligations.

4. EXCLUSIONS FROM CONFIDENTIAL INFORMATION

The obligations in Clause 3 shall not apply to information that:

4.1. Was already known to the Receiving Party prior to disclosure without any obligation of confidentiality.
4.2. Is or becomes publicly known through no wrongful act or breach of this Agreement by the Receiving Party.
4.3. Is independently developed by the Receiving Party without the use of or reference to the Disclosing Party's Confidential Information.
4.4. Is required to be disclosed by law, court order, or regulatory authority, provided that the Receiving Party gives prompt written notice to the Disclosing Party to allow them to seek a protective order.

5. RETURN OR DESTRUCTION OF INFORMATION

Upon written request by the Disclosing Party, or upon termination of the business relationship, the Receiving Party shall promptly return or securely destroy all documents, files, and copies containing Confidential Information. The Receiving Party shall provide written certification of such destruction. (Note: The Agency may retain candidate data as required by law or candidate consent in terms of POPIA.)

6. NO OBLIGATION OR TRANSFER OF RIGHTS

6.1. Neither Party is obligated to enter into any further business agreements by virtue of signing this Agreement.
6.2. All Confidential Information remains the exclusive property of the Disclosing Party. No license or rights are granted to the Receiving Party under any patent, copyright, or trademark.

7. DURATION

The confidentiality obligations set forth in this Agreement shall commence on the date of last signature and shall remain in full force and effect for a period of {{nda_duration_years}} years from the date of disclosure, or indefinitely for information constituting a trade secret.

8. GOVERNING LAW

This Agreement shall be governed by and construed in accordance with the laws of the Republic of South Africa. The Parties consent to the exclusive jurisdiction of the South African courts for any dispute arising out of this Agreement.

---
This template is provided for informational purposes. Have it reviewed by a South African legal practitioner before you rely on it.$b$),

('dpa',
 'Data Processing Agreement',
 'Sets out how candidate personal information transferred to the client must be secured and processed.',
 'dpa', 'needs_legal_drafting',
 array['agency', 'client'],
 array['agency_legal_name', 'client_legal_name'],
 $j$[
    {
        "type": "full_name",
        "label": "Name",
        "required": true
    },
    {
        "type": "signature",
        "label": "Signature",
        "required": true
    },
    {
        "type": "date_signed",
        "label": "Date",
        "required": true
    }
]$j$::jsonb,
 $b$DATA PROCESSING AGREEMENT

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
  11. Audit and inspection rights$b$),

('temp_employment_contract',
 'Temporary Employment Contract',
 'For agencies acting as employer of record for temporary staff. Payroll and statutory terms.',
 'temp_employment_contract', 'needs_legal_drafting',
 array['agency', 'candidate'],
 array['agency_legal_name', 'candidate_full_name', 'client_name', 'role_title'],
 $j$[
    {
        "type": "full_name",
        "label": "Name",
        "required": true
    },
    {
        "type": "signature",
        "label": "Signature",
        "required": true
    },
    {
        "type": "date_signed",
        "label": "Date",
        "required": true
    }
]$j$::jsonb,
 $b$TEMPORARY EMPLOYMENT CONTRACT

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
  11. Governing law: Republic of South Africa$b$);

-- ---------------------------------------------------------------------------
-- Installing and updating a workspace's copies
-- ---------------------------------------------------------------------------

/**
 * Give a workspace its own editable copy of every catalogue entry it does
 * not already have, and bring forward the ones it has not edited.
 */
create or replace function sync_document_pack(p_org uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  insert into document_templates
    (org_id, name, description, category, jurisdiction, status, is_system,
     signed_by, merge_keys, field_schema, body_html, system_code, system_version)
  select p_org, s.name, s.description, s.category, s.jurisdiction, s.status, true,
         s.signed_by, s.merge_keys, s.field_schema, s.body_html, s.code, s.version
    from system_document_templates s
  on conflict (org_id, system_code) where system_code is not null
  do update set
       name         = excluded.name,
       description  = excluded.description,
       status       = excluded.status,
       signed_by    = excluded.signed_by,
       merge_keys   = excluded.merge_keys,
       field_schema = excluded.field_schema,
       body_html    = excluded.body_html,
       system_version = excluded.system_version
     where document_templates.is_system
       and document_templates.system_version is distinct from excluded.system_version;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

/**
 * Called at signup. Kept under its original name so create_organisation does
 * not need to change; it now just delegates to the catalogue.
 */
create or replace function seed_document_pack(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform sync_document_pack(p_org);
end;
$$;

-- Workspaces seeded by migration 012 hold copies with no link back to the
-- catalogue. Their categories are the catalogue codes, so adopt them rather
-- than inserting a second set alongside. Version 0 marks them as stale.
update document_templates d
   set system_code = d.category, system_version = 0
 where d.is_system
   and d.system_code is null
   and exists (select 1 from system_document_templates s where s.code = d.category);

-- Bring every workspace that signed up before this migration onto the
-- supplied text, leaving anything they have edited alone.
do $$
declare o record;
begin
  for o in select id from organisations loop
    perform sync_document_pack(o.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges. Seeding is the platform's job; a tenant never calls it.
-- ---------------------------------------------------------------------------
revoke execute on function sync_document_pack(uuid)          from public, anon, authenticated;
revoke execute on function seed_document_pack(uuid)          from public, anon, authenticated;
revoke execute on function release_edited_system_template()  from public, anon, authenticated;
