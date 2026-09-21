/** Agreement library, agreement detail, documents and outreach screens. */
import { appPage, stat, table, panel, e } from './build.mjs'

const P = (tone, label) => `<span class="pill ${tone}">${e(label)}</span>`

const agreements = appPage({
  file: 'agreements.html',
  title: 'Agreements',
  description:
    'The standard agreement pack installed with every workspace, with each document&apos;s readiness stated plainly.',
  heading: 'Agreements',
  lede: 'Your standard pack. Every workspace starts with these; edit one and it becomes yours, and we stop updating it.',
  body: `
<div class="note warn">
  <p>Nothing in this pack has been signed off by a practitioner.</p>
  <p style="margin-bottom:0" class="soft">Five agreements carry real text that has not
  been reviewed. Two are clause headings only and cannot be sent.</p>
</div>

${panel('', table(
  ['Agreement', 'Signed by', 'Jurisdiction', 'Status', 'Ours or yours'],
  [
    ['<a href="agreement.html">Standard Terms of Business — Permanent Recruitment</a><br><span class="small muted">Scope, fees, replacement guarantee and POPIA obligations between agency and client.</span>',
     '<span class="small soft">agency and client</span>', '<span class="small soft">ZA</span>', P('warn', 'Needs legal review'), '<span class="small muted">Standard</span>'],
    ['Mutual Non-Disclosure Agreement<br><span class="small muted">Unannounced vacancies on one side, candidate data and fee structures on the other.</span>',
     '<span class="small soft">agency and client</span>', '<span class="small soft">ZA</span>', P('warn', 'Needs legal review'), '<span class="small muted">Standard</span>'],
    ['Data Processing Agreement<br><span class="small muted">How candidate data transferred to the client must be secured.</span>',
     '<span class="small soft">agency and client</span>', '<span class="small soft">ZA</span>', P('bad', 'Not drafted'), '<span class="small muted">Standard</span>'],
    ['Right to Represent<br><span class="small muted">Exclusive right to submit one candidate to one named employer.</span>',
     '<span class="small soft">candidate and agency</span>', '<span class="small soft">ZA</span>', P('warn', 'Needs legal review'), '<span class="small muted">Standard</span>'],
    ['Candidate Consent for the Processing of Personal Information<br><span class="small muted">POPIA consent. Sign before any candidate data is processed.</span>',
     '<span class="small soft">candidate</span>', '<span class="small soft">ZA</span>', P('warn', 'Needs legal review'), '<span class="small muted">Standard</span>'],
    ['Consent for Background Verification and Vetting<br><span class="small muted">Criminal, credit, qualification and identity checks.</span>',
     '<span class="small soft">candidate</span>', '<span class="small soft">ZA</span>', P('warn', 'Needs legal review'), '<span class="small muted">Standard</span>'],
    ['Temporary Employment Contract<br><span class="small muted">For acting as employer of record. BCEA and LRA terms.</span>',
     '<span class="small soft">agency and candidate</span>', '<span class="small soft">ZA</span>', P('bad', 'Not drafted'), '<span class="small muted">Standard</span>'],
  ],
))}

<p class="small muted">Nothing claims to be legally approved, and a test enforces that.
The two undrafted agreements say <strong>NOT YET DRAFTED</strong> in the body text
itself — a status field nobody reads is not a warning.</p>`,
})

const BODY = `RIGHT TO REPRESENT (RTR) AGREEMENT

BETWEEN:

Kgosi &amp; Partners (Pty) Ltd
(Hereinafter referred to as the "Agency")

AND

Ayanda Zulu
(Hereinafter referred to as the "Candidate")

1. REPRESENTATION DETAILS

The Candidate hereby grants the Agency the exclusive right to represent them, submit their Curriculum Vitae (CV), and negotiate on their behalf for the following specific position:

  Position / Job Title: Head of Finance
  Prospective Employer (Client): Molefe Group
  Job Reference Number (if applicable): <span class="blank">[ job reference ]</span>

2. EXCLUSIVITY AND DURATION

2.1. The Candidate agrees that this authorization is exclusive to the Agency for the specific Position and Client mentioned above.
2.2. This exclusive representation shall remain valid for a period of 12 months from the date of signature of this agreement.
2.3. During this period, the Candidate agrees not to apply directly to the Client for the specified Position, nor will they authorize any other recruitment agency, broker, or third party to submit their details to the Client for this Position.

3. CANDIDATE DECLARATIONS

3.1. They have not been submitted to, nor have they interviewed with, the above-mentioned Client for this specific Position through any other recruitment agency or directly within the past 6 months.

[…]

5. FEES

5.1. The Candidate acknowledges that the Agency's placement fees are paid entirely by the Client. Under the South African Employment Services Act, the Agency will not charge the Candidate any fees for work-seeking services or placement.`

const agreement = appPage({
  file: 'agreement.html',
  title: 'Agreement detail',
  description:
    'An agreement rendered with merge fields resolved from the client, candidate and role records, ready to send for signature.',
  heading: 'Right to Represent',
  lede: 'The candidate grants the agency exclusive right to submit them to one named employer for one named role. This is the document that decides who is owed the fee.',
  body: `
<div class="note warn">
  <p style="margin:0">1 blank has nothing to fill it. It will print as a visible gap:
  <span class="mono">job_reference</span></p>
</div>

<div class="grid" style="grid-template-columns:1fr 300px">
  ${panel('As it will be sent', `<div class="doc">${BODY}</div>`)}
  <div class="stack">
    ${panel('Fill it in', `
      <p class="small soft" style="margin:0 0 8px">Candidate</p>
      <p class="mono" style="margin:0 0 12px">Ayanda Zulu</p>
      <p class="small soft" style="margin:0 0 8px">Client</p>
      <p class="mono" style="margin:0">Molefe Group</p>`)}
    ${panel('Signed by', `
      <ul style="list-style:none;padding:0;margin:0;font-size:.85rem" class="stack-s">
        <li style="display:flex;justify-content:space-between;gap:8px"><span class="soft">Candidate full name</span><span class="small muted">candidate</span></li>
        <li style="display:flex;justify-content:space-between;gap:8px"><span class="soft">ID / Passport number</span><span class="small muted">candidate</span></li>
        <li style="display:flex;justify-content:space-between;gap:8px"><span class="soft">Candidate signature</span><span class="small muted">candidate</span></li>
        <li style="display:flex;justify-content:space-between;gap:8px"><span class="soft">Agency representative name</span><span class="small muted">agency</span></li>
        <li style="display:flex;justify-content:space-between;gap:8px"><span class="soft">Signed for the Agency</span><span class="small muted">agency</span></li>
      </ul>
      <p class="small muted" style="margin:10px 0 0">These are typed by whoever signs.
      They are never filled in from your records.</p>`)}
    ${panel('Send for signature', `
      <p class="small" style="color:var(--warning);margin:0 0 10px">Sending with 1 visible blank.</p>
      <span class="btn primary" style="width:100%;justify-content:center">Send for signature</span>`)}
  </div>
</div>

<p class="small muted">Merge fields resolve at the moment of sending, from the records
as they stand then — so a registration number corrected this morning appears in the
agreement that goes out this afternoon.</p>`,
})

const documents = appPage({
  file: 'documents.html',
  title: 'Documents',
  description:
    'The document library, with POPIA special personal information and post-offer collection rules enforced at upload.',
  heading: 'Documents',
  lede: 'Everything you hold, and what POPIA says about holding it.',
  body: `
<div class="grid g3">
  ${stat('Documents', 46)}
  ${stat('Special personal information', 3, 'Criminal or medical records')}
  ${stat('Document kinds', 25)}
</div>

${panel('Library', table(
  ['File', 'Kind', 'Belongs to', 'Size', 'Added'],
  [
    ['<a href="#">Ayanda_Zulu_CV.pdf</a>', '<span class="soft">CV / résumé</span>', 'Ayanda Zulu<br><span class="small muted">candidate</span>', '<span class="small muted">240 KB</span>', '<span class="small muted">18 Sep 2026</span>'],
    ['<a href="#">saps_clearance.pdf</a><br><span class="small muted">s27: The role involves handling cash; consent obtained on the vetting form.</span>',
     '<span class="soft">Criminal record check</span><br>' + P('bad', 'special'), 'Ayanda Zulu<br><span class="small muted">candidate</span>', '<span class="small muted">1.1 MB</span>', '<span class="small muted">19 Sep 2026</span>'],
    ['<a href="#">molefe_tob_signed.pdf</a>', '<span class="soft">Terms of business</span>', 'Molefe Group<br><span class="small muted">client</span>', '<span class="small muted">380 KB</span>', '<span class="small muted">02 Sep 2026</span>'],
    ['<a href="#">saica_certificate.pdf</a>', '<span class="soft">Professional licence</span>', 'Thandi Mokoena<br><span class="small muted">candidate</span>', '<span class="small muted">96 KB</span>', '<span class="small muted">27 Aug 2026</span>'],
  ],
))}

<div class="note bad">
  <p><strong>What a refusal looks like.</strong> Uploading banking details for a
  candidate at screening stage returns:</p>
  <p class="mono" style="margin-bottom:0">Banking details may only be collected once an
  offer has been made</p>
</div>

${panel('What the rules are', table(
  ['Kind', 'When', 'Why'],
  [
    ['Criminal record check', P('bad', 'consent first'), '<span class="small muted">POPIA s26 special personal information. Requires separate written consent and an s27 justification.</span>'],
    ['Medical disclosure', P('warn', 'post-offer only'), '<span class="small muted">POPIA s26 special personal information. Post-offer only.</span>'],
    ['Banking details', P('warn', 'post-offer only'), '<span class="small muted">Post-offer only. Needed to pay someone, not to consider them.</span>'],
    ['Tax identification', P('warn', 'post-offer only'), '<span class="small muted">Post-offer only.</span>'],
    ['Credit check', '<span class="muted small">any time</span>', '<span class="small muted">Requires separate written consent, and must be relevant to the role.</span>'],
    ['Interview notes', '<span class="muted small">any time</span>', '<span class="small muted">The candidate can ask to see these. Write them as if they will.</span>'],
    ['National identity document', '<span class="muted small">any time</span>', '<span class="small muted">Certified copy. Do not collect before it is needed.</span>'],
  ],
))}

<p class="small muted">These are refused at the database, not just hidden here. The
row goes in before the bytes, so an upload that breaks one of them never reaches
storage. Files open through a signed link minted at the moment of the click and good
for five minutes — no storage URL sits in the page.</p>`,
})

const outreach = appPage({
  file: 'outreach.html',
  title: 'Outreach and consent',
  description:
    'Sender identity and the suppression list. POPIA s69 enforced rather than documented.',
  heading: 'Outreach and consent',
  lede: 'What has to be true before a marketing message can leave this workspace.',
  body: `
<div class="grid g2">
  ${stat('Marketing sends', 'Blocked', 'No postal address on file')}
  ${stat('Suppressed addresses', 12)}
</div>

${panel('The rule that applies here', `
  <p class="soft">POPIA section 69 does not work like the UK rule. Electronic direct
  marketing needs the recipient's consent, or an existing customer relationship for
  similar services. Where neither holds you may approach them
  <strong>once</strong> to ask for that consent — and not at all if they have already
  refused.</p>
  <p class="soft">A juristic person is a data subject under POPIA, so "it is business
  to business" does not carry the exemption across the way it does under UK GDPR.</p>
  <p class="small muted" style="margin-bottom:0">The platform enforces this: a second
  unconsented approach to the same address is refused at the point of sending, not
  flagged afterwards.</p>`)}

${panel('Who the email is from', `
  <div class="grid g2">
    <div><p class="small soft" style="margin:0 0 4px">Registered legal name</p>
      <p class="mono" style="margin:0">Kgosi &amp; Partners (Pty) Ltd</p></div>
    <div><p class="small soft" style="margin:0 0 4px">Registration number</p>
      <p class="mono" style="margin:0">2019/443188/07</p></div>
    <div><p class="small soft" style="margin:0 0 4px">Postal address</p>
      <p class="mono" style="margin:0;color:var(--danger)">not set</p></div>
    <div><p class="small soft" style="margin:0 0 4px">Unsubscribe link</p>
      <p class="mono" style="margin:0;color:var(--danger)">not set</p></div>
  </div>
  <p class="small" style="color:var(--warning);margin:14px 0 0">Until these are set, no
  marketing message can be sent and no sequence can be activated. All three regimes
  require them at the foot of the email.</p>`)}

${panel('Suppression list', table(
  ['Address', 'Reason', 'Source', 'When'],
  [
    ['<span class="mono">m.dlamini@bhengu.co.za</span>', P('', 'opted out'), '<span class="small muted">contact_channel</span>', '<span class="small muted">04 Sep 2026</span>'],
    ['<span class="mono">info@naidoocapital.co.za</span>', P('', 'complained'), '<span class="small muted">added by hand</span>', '<span class="small muted">22 Aug 2026</span>'],
    ['<span class="mono">p.vanwyk@molefe.co.za</span>', P('', 'do not contact'), '<span class="small muted">added by hand</span>', '<span class="small muted">11 Aug 2026</span>'],
  ],
)) }

<div class="note">
  <p style="margin:0">A suppression is permanent, crosses every channel, and outranks
  a consent recorded later. It cannot be edited or deleted from the interface — that
  is deliberate. Operational messages are untouched: a candidate who unsubscribed
  from marketing still gets told about their interview.</p>
</div>`,
})

export { agreements, agreement, documents, outreach }
