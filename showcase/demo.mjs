/** The walkthrough screens. Sample data, real layout. */
import { appPage, stat, table, panel, e, BRAND } from './build.mjs'

const P = (tone, label) => `<span class="pill ${tone}">${e(label)}</span>`

// ---------------------------------------------------------------------------
const index = appPage({
  file: 'index.html',
  title: 'Overview',
  description:
    'A walkthrough of every screen in Hireframe, the recruitment platform with an e-signature engine built in.',
  heading: 'Kgosi & Partners',
  lede: 'Cape Town · ZAR · POPIA · trial, 9 days left',
  body: `
<div class="grid g4">
  ${stat('Open roles', 7)}
  ${stat('In pipeline', 41)}
  ${stat('Placements this month', 3)}
  ${stat('Envelopes used', '18 / 150', 'Growth plan')}
</div>

${panel('Needs you today', `
  <ul class="stack-s" style="list-style:none;padding:0;margin:0;font-size:.9rem">
    <li>${P('bad', 'blocked')} Marketing sequence cannot be activated — no postal address on file.
      <span class="muted">Outreach and consent</span></li>
    <li>${P('warn', 'expiring')} 2 rights to represent lapse within 30 days.</li>
    <li>${P('warn', 'held')} A day-90 referral request is waiting on marketing consent.</li>
    <li>${P('acc', 'awaiting')} Terms of Business sent to Molefe Group, unsigned for 6 days.</li>
  </ul>`)}

<div class="grid g2">
  ${panel('Where the pipeline is', table(
    ['Stage', 'Candidates', 'Oldest'],
    [
      ['Applied', '<span class="num">14</span>', '<span class="muted">2d</span>'],
      ['Screening', '<span class="num">9</span>', '<span class="muted">6d</span>'],
      ['Interview', '<span class="num">8</span>', '<span class="muted">11d</span>'],
      ['Client interview', '<span class="num">5</span>', '<span class="warn muted">19d</span>'],
      ['Offer', '<span class="num">3</span>', '<span class="muted">4d</span>'],
      ['Placed', '<span class="num">2</span>', '<span class="muted">—</span>'],
    ],
  ))}
  ${panel('Signature activity', table(
    ['Document', 'Recipient', 'State'],
    [
      ['Offer — Financial Manager', 'T. Mokoena', P('ok', 'completed')],
      ['Terms of Business', 'Molefe Group', P('acc', 'sent')],
      ['Candidate POPIA consent', 'S. Khumalo', P('ok', 'completed')],
      ['Right to Represent', 'A. Zulu', P('warn', 'viewed')],
    ],
  ))}
</div>`,
})

// ---------------------------------------------------------------------------
const CARDS = {
  Applied: [['Naledi Mabaso', 'Financial Accountant', 2, false]],
  Screening: [['Thandi Mokoena', 'Group Reporting Manager', 6, false]],
  Interview: [['Sipho Khumalo', 'Finance Manager', 11, false]],
  'Client interview': [['Ayanda Zulu', 'Head of Finance', 19, true]],
  Offer: [['Lerato Nkosi', 'Financial Director', 4, false]],
}

const pipeline = appPage({
  file: 'pipeline.html',
  title: 'Pipeline',
  description: 'The candidate pipeline as a board, with stage SLAs and scoring.',
  heading: 'Pipeline',
  lede: 'Financial Manager at Molefe Group. Stages and their targets are set per workspace.',
  body: `
<div class="board">
  ${Object.entries(CARDS)
    .map(
      ([stage, cards]) => `
  <div class="col">
    <h3>${e(stage)}</h3>
    ${cards
      .map(
        ([name, role, days, late]) => `
    <article class="card${late ? ' late' : ''}">
      <div class="nm">${e(name)}</div>
      <div class="sub">${e(role)}</div>
      <div class="sub" style="margin-top:4px${late ? ';color:var(--warning)' : ''}">
        ${days}d in stage${late ? ' · past 10d target' : ''}
      </div>
      <div style="margin-top:6px"><a class="small" href="assess.html">${
        name === 'Ayanda Zulu' ? 'Scored 80%' : 'Score'
      }</a></div>
    </article>`,
      )
      .join('')}
  </div>`,
    )
    .join('')}
</div>

<div class="note">
  <p style="margin:0">A card turns amber once it passes the stage's own target, which
  the agency sets. Nothing is hidden when it stalls — it just becomes visible.</p>
</div>`,
})

// ---------------------------------------------------------------------------
const CFO = [
  ['Financial leadership scope (P&L, team size, budget)', 25, 5],
  ['Industry and sector relevance', 20, 4],
  ['Strategic contribution evidence', 15, 3],
  ['Stakeholder and board management', 15, 4],
  ['Qualifications (CA(SA), ACCA, CFA, MBA)', 10, 5],
  ['Geographic experience relevant to the role', 10, 2],
  ['Cultural and leadership style fit', 5, 4],
]
const total = CFO.reduce((s, [, w, sc]) => s + w * sc, 0)

const assess = appPage({
  file: 'assess.html',
  title: 'Assessment',
  description:
    'Scoring a candidate against a weighted scorecard. The total is derived from the scores, never typed.',
  heading: 'Ayanda Zulu',
  lede: 'Head of Finance at Molefe Group · currently Group Financial Manager · Client interview',
  body: `
<div class="grid g3">
  ${stat('Assessments submitted', 2)}
  ${stat('Consensus score', `${total} / 500`, 'averaged across 2')}
  ${stat('On the application', `${total / 5}%`, 'Derived, not typed')}
</div>

<section class="panel">
  <header><h2>Your assessment</h2><span class="small soft num">${total} / 500</span></header>
  <div class="body stack">
    ${CFO.map(
      ([label, weight, picked]) => `
    <div style="padding-bottom:14px;border-bottom:1px solid var(--line)">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline">
        <strong style="font-weight:400">${e(label)}</strong>
        <span class="small muted num">weight ${weight}%</span>
      </div>
      <div class="score-row">
        ${[1, 2, 3, 4, 5]
          .map((n) => `<span class="sq${n === picked ? ' on' : ''}">${n}</span>`)
          .join('')}
        <span class="small muted" style="margin-left:6px">${
          { 5: 'Exceeds — direct relevant experience, evidenced with results',
            4: 'Meets fully — solid evidence',
            3: 'Meets adequately — some gaps but broadly competent',
            2: 'Partially meets — a significant gap' }[picked]
        }</span>
      </div>
    </div>`,
    ).join('')}
    <p class="small muted" style="margin:0">Every criterion has to be scored before it
    can be submitted, so an unfinished assessment never reads as a finished one.</p>
  </div>
</section>

<div class="note ok">
  <p style="margin:0">The total moves as you score, but what is stored is the
  database's own calculation. A total sent from the browser is overwritten; a score
  outside 1 to 5, or one against a criterion this scorecard does not have, is
  refused.</p>
</div>`,
})

// ---------------------------------------------------------------------------
const scorecards = appPage({
  file: 'scorecards.html',
  title: 'Scorecards',
  description: 'Weighted scorecards for executive mandates. Weights must sum to 100.',
  heading: 'Scorecards',
  lede: 'Weights are agreed with the client at the start of a search. That agreement is what stops the argument at shortlist presentation.',
  body: `
${panel(
  'Chief Financial Officer',
  table(['Criterion', 'Weight', 'Looking for'], CFO.map(([label, w]) => [
    e(label),
    `<span class="num soft">${w}%</span>`,
    '<span class="small muted">Scale indicators, not job titles</span>',
  ])) +
    `<p class="small muted" style="margin:12px 0 0">Totals 100%. Maximum score 500,
    which the platform computes from the scores rather than accepting a typed total.</p>`,
  P('acc', 'Yours'),
)}

${panel(
  'Chief Human Resources Officer',
  table(['Criterion', 'Weight'], [
    ['HR leadership scope and transformation experience', '<span class="num soft">25%</span>'],
    ['Organisational design and change management', '<span class="num soft">20%</span>'],
    ['Employment relations and labour law competence', '<span class="num soft">15%</span>'],
    ['Talent development and succession planning', '<span class="num soft">15%</span>'],
    ['Cultural alignment with the client organisation', '<span class="num soft">10%</span>'],
    ['Qualifications and professional memberships', '<span class="num soft">10%</span>'],
    ['Data and systems literacy (HRIS, analytics)', '<span class="num soft">5%</span>'],
  ]),
  P('', 'Standard'),
)}

<div class="note">
  <p style="margin:0">Reweight one and it becomes yours — we stop updating it. It
  still has to add up to 100, or nothing can be scored against it.</p>
</div>`,
})

// ---------------------------------------------------------------------------
const rtr = appPage({
  file: 'right-to-represent.html',
  title: 'Right to represent',
  description:
    'Live grants, expiries and the dual-submission guard that stops two agencies claiming the same fee.',
  heading: 'Right to represent',
  lede: 'One live grant per candidate per employer. A second is refused, which is what stops the dual submission that costs you the fee.',
  body: `
<div class="grid g3">
  ${stat('Live grants', 6)}
  ${stat('Expiring within 30 days', 2, 'Renew before they lapse')}
  ${stat('Not yet signed', 1, 'A grant is weak without a signature')}
</div>

${panel('All grants', table(
  ['Candidate', 'Employer', 'Status', 'Expires', 'Signed'],
  [
    ['Ayanda Zulu', 'Molefe Group', P('ok', 'live'), '<span class="small">14 Mar 2027</span>', '<span class="small soft">21 Sep 2026</span>'],
    ['Thandi Mokoena', 'Bhengu Holdings', P('ok', 'live'), '<span class="small" style="color:var(--warning)">09 Oct 2026</span>', '<span class="small soft">09 Apr 2026</span>'],
    ['Sipho Khumalo', 'Naidoo Capital', P('ok', 'live'), '<span class="small">02 Jan 2027</span>', '<span class="small" style="color:var(--warning)">not sent</span>'],
    ['Lerato Nkosi', 'Molefe Group', P('', 'expired'), '<span class="small">30 Aug 2026</span>', '<span class="small soft">01 Mar 2026</span>'],
  ],
))}

<div class="note bad">
  <p><strong>What happens on a duplicate.</strong> Recording a second live grant for
  Ayanda Zulu to Molefe Group returns:</p>
  <p class="mono" style="margin-bottom:0">There is already a live right to represent
  this candidate to Molefe Group.</p>
</div>

<p class="small muted">The refusal comes from a partial unique index, so it holds
whether the request arrives from this screen or straight through the API. Recording a
grant is not the same as having it signed — send the agreement so the candidate
actually signs it.</p>`,
})

// ---------------------------------------------------------------------------
const placements = appPage({
  file: 'placements.html',
  title: 'Placements',
  description: 'Placements and the 90-day check-in schedule, with consent-held messages surfaced.',
  heading: 'Placements',
  lede: 'Most agencies lose the candidate at the point of placement. The check-ins are scheduled from the start date, not from memory.',
  body: `
<div class="grid g3">
  ${stat('Within guarantee', 4)}
  ${stat('Check-ins due', 2, 'Overdue or due today')}
  ${stat('Held for consent', 1, 'Referral asks need marketing opt-in')}
</div>

<div class="note warn">
  <p style="margin:0">One referral request is held back. The day-90 message asks the
  candidate for introductions, which is direct marketing under POPIA rather than part
  of the placement. It needs its own opt-in before it can be sent.</p>
</div>

${panel('Placements', table(
  ['Candidate', 'Role', 'Client', 'Starts', 'Guarantee', 'Check-ins due'],
  [
    ['Thandi Mokoena', 'Financial Manager', 'Molefe Group', '<span class="small soft">01 Jun 2026</span>', P('acc', 'live'), '<span class="small muted">none</span>'],
    ['Sipho Khumalo<br><span class="small muted">relocating to GB</span>', 'Finance Director', 'Bhengu Holdings', '<span class="small soft">15 Jul 2026</span>', P('acc', 'live'), '<span class="small" style="color:var(--warning)">day 60</span>'],
    ['Naledi Mabaso', 'Group Accountant', 'Naidoo Capital', '<span class="small soft">02 Mar 2026</span>', P('', 'ended'), '<span class="small" style="color:var(--warning)">day 90</span>'],
  ],
))}

${panel('Next check-ins', `
  <ul class="stack-s" style="list-style:none;padding:0;margin:0;font-size:.9rem">
    <li style="display:flex;justify-content:space-between;gap:12px">
      <span class="soft">Day 60</span><span class="small muted">13 Sep 2026</span></li>
    <li style="display:flex;justify-content:space-between;gap:12px">
      <span class="soft">Day 90 <span class="small muted">asks for referrals</span></span>
      <span class="small" style="color:var(--warning)">awaiting marketing consent on WhatsApp</span></li>
    <li style="display:flex;justify-content:space-between;gap:12px">
      <span class="soft">Day 3</span><span class="small muted">18 Jul 2026</span></li>
  </ul>`)}

<p class="small muted">A start date that moves shifts the check-ins that have not gone
out, and leaves the ones that have. A message already delivered cannot be un-sent by
editing a date.</p>`,
})

export { index, pipeline, assess, scorecards, rtr, placements }
