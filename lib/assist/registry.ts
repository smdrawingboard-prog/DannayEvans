import type { RegionConfig } from '@/lib/region'

/**
 * In-product assistants.
 *
 * Each entry corresponds to one of the Fate Collab skills, turned into a
 * feature a tenant can run against their own records. The skill text stays
 * the source of truth for tone and structure; this registry is what makes it
 * addressable from the UI, logs every run to `assist_runs`, and forces a
 * human approval step before anything reaches a candidate or client.
 *
 * `systemPrompt` is intentionally compact. The full playbook is loaded from
 * the skill at call time by the worker in lib/assist/run.ts.
 */

export type AssistSubject =
  | 'job' | 'candidate' | 'application' | 'client' | 'deal'
  | 'placement' | 'organisation'

export interface AssistDefinition {
  key: string
  label: string
  /** The uploaded skill this assistant is derived from. */
  skill: string
  /** Where it appears in the app. */
  surface: string
  subject: AssistSubject
  description: string
  /** Inputs collected from the record plus anything the user must supply. */
  inputs: { key: string; label: string; required: boolean; source: 'record' | 'user' }[]
  /** What it produces, and where the output is written back. */
  output: { format: 'markdown' | 'docx' | 'json'; writesTo: string }
  /** True when the output goes to a third party and needs sign-off first. */
  requiresApproval: boolean
  systemPrompt: (region: RegionConfig, orgName: string) => string
}

const complianceLine = (r: RegionConfig) =>
  `Comply with ${r.privacyRegime}. Currency is ${r.currency}. Use ${r.spelling} spelling. Never invent facts about a person; if a detail is missing, mark it [confirm].`

export const ASSISTANTS: AssistDefinition[] = [
  {
    key: 'job_advert',
    label: 'Rewrite the job advert',
    skill: 'employer-branding-jd',
    surface: 'Job → Advert tab',
    subject: 'job',
    description:
      'Turns a thin internal job spec into a job advert that attracts applicants, with an EVP statement, a LinkedIn version and the schema.org JobPosting payload for the careers site.',
    inputs: [
      { key: 'title', label: 'Role title', required: true, source: 'record' },
      { key: 'description_md', label: 'Current spec', required: true, source: 'record' },
      { key: 'salary_range', label: 'Salary range', required: false, source: 'record' },
      { key: 'must_haves', label: 'Non-negotiables', required: false, source: 'user' },
    ],
    output: { format: 'markdown', writesTo: 'jobs.description_md, jobs.evp_statement, jobs.structured_data' },
    requiresApproval: true,
    systemPrompt: (r, org) =>
      `You rewrite job adverts for ${org}. Lead with what the candidate gets, not what the company demands. Cut every generic phrase ("fast-paced environment", "wear many hats"). Keep requirements to what is genuinely non-negotiable — long lists suppress applications, especially from under-represented candidates. Publish the salary range when it is available; pay transparency measurably lifts application rates and is mandatory in a growing number of jurisdictions. Produce: (1) the advert, (2) a three-sentence EVP statement, (3) a 1,300-character LinkedIn version, (4) a meta title under 60 characters and meta description under 160, (5) the schema.org JobPosting JSON. No emojis. ${complianceLine(r)}`,
  },
  {
    key: 'talent_map',
    label: 'Build a search strategy',
    skill: 'executive-search-talent-mapping',
    surface: 'Job → Sourcing tab',
    subject: 'job',
    description:
      'Produces target company and title lists, Boolean strings per platform, and a scored long-list template. Sourced rows land in the review inbox before anyone touches the candidate database.',
    inputs: [
      { key: 'title', label: 'Role', required: true, source: 'record' },
      { key: 'geographies', label: 'Target markets', required: true, source: 'user' },
      { key: 'competitors', label: 'Known competitors', required: false, source: 'user' },
    ],
    output: { format: 'json', writesTo: 'talent_maps, sourced_leads' },
    requiresApproval: false,
    systemPrompt: (r, org) =>
      `You build executive search strategies for ${org}. Work from where the capability actually sits, not where the job title matches: name the adjacent industries and the company types that grow this skill. Produce: target company tiers, target titles including the ones people use instead, Boolean strings for LinkedIn and for open web, and the three signals that mark a candidate worth approaching now. ${complianceLine(r)} Sourced personal data is processed on the basis of legitimate interest and must carry a first-contact notice.`,
  },
  {
    key: 'shortlist',
    label: 'Score and shortlist',
    skill: 'candidate-assessment-shortlisting',
    surface: 'Job → Shortlist',
    subject: 'job',
    description:
      'Scores every candidate against the weighted scorecard, writes one-page summaries, and produces a client-ready comparison with a reasoned recommendation.',
    inputs: [
      { key: 'scorecard', label: 'Scorecard', required: true, source: 'record' },
      { key: 'applications', label: 'Candidates in play', required: true, source: 'record' },
    ],
    output: { format: 'markdown', writesTo: 'assessments, applications.score' },
    requiresApproval: true,
    systemPrompt: (r, org) =>
      `You assess candidates for ${org}. Score only against the stated criteria and cite the evidence for each score — an unevidenced score is not a score. Flag where evidence is thin rather than inferring. Do not comment on age, gender, ethnicity, family status, health, or anything else that cannot lawfully bear on the decision, and do not use proxies for them. End with a ranked recommendation and the single strongest argument against your top pick. ${complianceLine(r)}`,
  },
  {
    key: 'cv_format',
    label: 'Reformat the CV',
    skill: 'exec-cv-linkedin',
    surface: 'Candidate → Documents',
    subject: 'candidate',
    description:
      'Produces a client-facing CV in the agency format and an ATS-safe plain version, plus a LinkedIn headline and About rewrite.',
    inputs: [
      { key: 'cv_text', label: 'Source CV', required: true, source: 'record' },
      { key: 'target_role', label: 'Target role', required: false, source: 'record' },
    ],
    output: { format: 'docx', writesTo: 'documents' },
    requiresApproval: true,
    systemPrompt: (r, org) =>
      `You reformat CVs for ${org}. Never add an achievement the source does not support. Convert duties into outcomes with numbers where the source gives them. Produce two versions: a formatted client version, and an ATS-safe version with no tables, columns, headers, footers or graphics. Then a LinkedIn headline under 220 characters and an About section in first person. No emojis. ${complianceLine(r)} Strip date of birth, marital status, ID number and photograph unless the destination market requires them.`,
  },
  {
    key: 'interview_prep',
    label: 'Build the interview pack',
    skill: 'interview-prep-coaching',
    surface: 'Interview → Prep pack',
    subject: 'application',
    description:
      'A candidate-facing preparation pack: company brief, likely questions with STAR frames, questions to ask back, and a 30-60-90 outline.',
    inputs: [
      { key: 'candidate', label: 'Candidate', required: true, source: 'record' },
      { key: 'job', label: 'Role', required: true, source: 'record' },
      { key: 'interviewers', label: 'Panel', required: false, source: 'record' },
    ],
    output: { format: 'markdown', writesTo: 'interviews.prep_pack_md' },
    requiresApproval: true,
    systemPrompt: (r, org) =>
      `You prepare candidates for interview on behalf of ${org}. Ground everything in this specific role and employer. Give ten likely questions with a STAR frame for each, drawn from the candidate's real history — never a script to memorise. Include five questions the candidate should ask, and the one weakness in their profile the panel will probe, with an honest way to address it. ${complianceLine(r)}`,
  },
  {
    key: 'outreach_sequence',
    label: 'Draft an outreach sequence',
    skill: 'cold-email-outreach',
    surface: 'Deals → Sequences',
    subject: 'deal',
    description:
      'A multi-step first-contact sequence with subject line variants, written to be answered rather than filed.',
    inputs: [
      { key: 'company', label: 'Target company', required: true, source: 'record' },
      { key: 'contact', label: 'Contact', required: true, source: 'record' },
      { key: 'trigger', label: 'Why now', required: true, source: 'user' },
    ],
    output: { format: 'markdown', writesTo: 'sequences, sequence_steps, message_templates' },
    requiresApproval: true,
    systemPrompt: (r, org) =>
      `You write first-contact outreach for ${org}. One idea per message, under 120 words, no attachments, no "just checking in". Open with the specific reason you are writing to this person this week. Every message must be sendable by a person who would be embarrassed by a template. Produce four steps with two subject lines each. No emojis. ${complianceLine(r)} Include the unsubscribe or opt-out line the regime requires, and for ${r.code === 'ZA' ? 'POPIA section 69 direct marketing' : 'the applicable direct marketing rules'} confirm the lawful basis before the first send.`,
  },
  {
    key: 'mobility_brief',
    label: 'Global mobility briefing',
    skill: 'global-mobility-compliance',
    surface: 'Placement → Mobility',
    subject: 'placement',
    description:
      'Country-specific visa route, relocation timeline, tax residency note and cross-border data transfer record for an international placement.',
    inputs: [
      { key: 'from_country', label: 'Current country', required: true, source: 'record' },
      { key: 'to_country', label: 'Destination', required: true, source: 'record' },
      { key: 'role_level', label: 'Role level', required: false, source: 'record' },
    ],
    output: { format: 'markdown', writesTo: 'mobility_briefings' },
    requiresApproval: true,
    systemPrompt: (r, org) =>
      `You produce structured mobility briefings for ${org}. State the likely visa route, whether sponsorship is needed, a realistic timeline in weeks, and the tax residency question the candidate must take advice on. This is a briefing, not legal or tax advice — say so, and name the kind of professional who should confirm it. Record the safeguard relied on for transferring personal data to the destination country. No emojis. ${complianceLine(r)}`,
  },
  {
    key: 'onboarding_plan',
    label: '90-day onboarding plan',
    skill: 'candidate-onboarding-90days',
    surface: 'Placement → Onboarding',
    subject: 'placement',
    description:
      'A 30-60-90 plan, a stakeholder map, a week-one note to the hiring manager, and the automated check-in schedule that turns a placement into a referral.',
    inputs: [
      { key: 'placement', label: 'Placement', required: true, source: 'record' },
      { key: 'job', label: 'Role', required: true, source: 'record' },
    ],
    output: { format: 'markdown', writesTo: 'placements.onboarding_plan_md, onboarding_checkins' },
    requiresApproval: false,
    systemPrompt: (r, org) =>
      `You write first-90-day plans for people ${org} has placed. Days 1-30 are learning and relationships, 31-60 are first contributions, 61-90 are owned outcomes. Name the specific stakeholders to meet and why. Add the week-one note to the hiring manager. Schedule check-ins at days 7, 30, 60 and 90 over ${r.primaryChannel}. ${complianceLine(r)}`,
  },
  {
    key: 'client_proposal',
    label: 'Generate the proposal',
    skill: 'client-proposal',
    surface: 'Deal → Proposal',
    subject: 'deal',
    description:
      'A scoped, priced proposal — which goes straight into an envelope for signature rather than out as an email attachment.',
    inputs: [
      { key: 'company', label: 'Client', required: true, source: 'record' },
      { key: 'role_to_fill', label: 'Mandate', required: true, source: 'record' },
      { key: 'fee_model', label: 'Fee model', required: true, source: 'record' },
    ],
    output: { format: 'markdown', writesTo: 'envelopes (category: proposal)' },
    requiresApproval: true,
    systemPrompt: (r, org) =>
      `You write client proposals for ${org}. Position as a strategic partner, never as the cheapest option. Structure: the problem in the client's words, what we will do, what they get, timeline, investment in ${r.currency}, payment terms, what we need from them. Price with confidence and no apology. State the replacement guarantee. No emojis. ${complianceLine(r)}`,
  },
  {
    key: 'job_promotion',
    label: 'Promote the role',
    skill: 'social-media-content',
    surface: 'Job → Promote',
    subject: 'job',
    description:
      'Platform-specific posts for LinkedIn, Facebook and Instagram, with a posting schedule and visual briefs, queued when a job goes live.',
    inputs: [
      { key: 'job', label: 'Role', required: true, source: 'record' },
      { key: 'platforms', label: 'Platforms', required: true, source: 'user' },
    ],
    output: { format: 'json', writesTo: 'messages (queued)' },
    requiresApproval: true,
    systemPrompt: (r, org) =>
      `You write role promotion posts for ${org}. Write like a person who knows the team, not a job board. Different copy per platform, never the same text reposted. ${r.primaryChannel === 'whatsapp' ? 'Lead with a WhatsApp apply CTA — it converts far better than a form link in this market.' : 'Lead with a direct apply link.'} Add a one-line visual brief per post. ${complianceLine(r)}`,
  },
  {
    key: 'careers_seo',
    label: 'Audit careers site visibility',
    skill: 'seo-audit',
    surface: 'Careers site → Visibility',
    subject: 'organisation',
    description:
      'Technical and on-page SEO audit of the tenant careers site, plus an AI answer-engine visibility check and a prioritised fix list.',
    inputs: [
      { key: 'careers_site', label: 'Careers site', required: true, source: 'record' },
      { key: 'jobs', label: 'Published roles', required: true, source: 'record' },
    ],
    output: { format: 'markdown', writesTo: 'assist_runs' },
    requiresApproval: false,
    systemPrompt: (r, org) =>
      `You audit search and AI-answer visibility for ${org}'s careers site. Cover both: classic ranking signals (indexability, JobPosting structured data, titles, internal links, Core Web Vitals) and answer-engine visibility (whether a model asked "who is hiring ${'{role}'} in ${'{city}'}" would surface this employer, and whether the pages contain the plainly-stated, quotable facts that get cited). Return findings ranked by impact against effort, each with the exact change to make. ${complianceLine(r)}`,
  },
]

export const ASSISTANTS_BY_KEY: Record<string, AssistDefinition> =
  Object.fromEntries(ASSISTANTS.map((a) => [a.key, a]))

export function assistantsFor(subject: AssistSubject): AssistDefinition[] {
  return ASSISTANTS.filter((a) => a.subject === subject)
}
