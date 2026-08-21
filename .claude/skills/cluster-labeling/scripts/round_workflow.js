export const meta = {
  name: 'cluster-labeling-round',
  description: 'Run a labeling round: N blind readers over cluster cards, contract check, then adversarially verify EVERY exemplar',
  whenToUse: 'A labeling or re-labeling round over a run dir that already has cards and crops. Pass runDir/cards/brief/batchPrefix/batches via args.',
  phases: [
    { title: 'Read', detail: 'cluster-reader agents, one batch of cards each' },
    { title: 'Contract', detail: 'verdict-record contract check before anything consumes the verdicts' },
    { title: 'Verify', detail: 'adversarial pass over every exemplar, not only the changed ones' },
  ],
}

// ---------------------------------------------------------------------------
// Parameterised on purpose. This replaces the per-run `rejudge_workflow.js`
// that lived inside a gitignored run directory: untracked, unrecoverable, and
// forked for every round. Round 3's copy is frozen beside its data as
// `rejudge_workflow.PREV-round3-*.js`; everything after it runs through here.
//
// args: {
//   runDir:      repo-relative run directory
//   cards:       cards filename inside runDir
//   brief:       round brief filename inside runDir
//   batchPrefix: verdict files are `${batchPrefix}_${i}.json`
//   batches:     array of arrays of cluster ids, one per reader
//   hierarchy:   repo-relative land-cover.json -- the AOI pack's. Required: it
//                is what the contract gate reads `_status: not-assignable` from,
//                and this engine is AOI-agnostic so it cannot default to one.
// }
// ---------------------------------------------------------------------------
const A = typeof args === 'string' ? JSON.parse(args) : args
const RUN = A.runDir
const CARDS = A.cards || 'cards.json'
const BRIEF = A.brief
const PREFIX = A.batchPrefix || 'batch'
const batches = A.batches
const HIERARCHY = A.hierarchy
const SELF = '.claude/skills/cluster-labeling/scripts/round_workflow.js'

// Fail here, not four phases later. Without the hierarchy the contract gate
// reports NOT CHECKED and a blocked class rides through unnoticed -- the exact
// silent pass this gate was widened to stop.
if (!HIERARCHY) throw new Error('args.hierarchy is required (AOI pack land-cover.json)')
const CONTRACT = '.claude/skills/cluster-labeling/references/verdict-record.md'

// The reader's structured return carries NO record-shaped array. The full
// contract-compliant records go to disk; what comes back is a receipt. This is
// deliberate: a summary array here would be a second enumeration of the verdict
// fields, which is the exact drift `verdict-record.md` exists to prevent, and
// `check_verdict_contract.py` would flag it as a restatement.
const RECEIPT = {
  type: 'object',
  required: ['batch', 'path', 'n_verdicts', 'n_cards'],
  properties: {
    batch: { type: 'integer' },
    path: { type: 'string', description: 'absolute path of the JSON file you wrote' },
    n_verdicts: { type: 'integer' },
    n_cards: { type: 'integer' },
    notes: { type: 'string', description: 'anything that blocked full coverage; empty if none' },
  },
}

const VERIFY = {
  type: 'object',
  required: ['results'],
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        required: ['cluster', 'exemplar', 'verdict', 'note'],
        properties: {
          cluster: { type: 'integer' },
          exemplar: { type: 'integer' },
          verdict: { type: 'string', enum: ['upheld', 'refuted', 'unclear'] },
          better_label: { type: 'string', description: 'dotted path if you would use a third label; empty otherwise' },
          note: { type: 'string' },
        },
      },
    },
  },
}

phase('Read')
log(`reading ${batches.flat().length} cards across ${batches.length} readers -> ${PREFIX}_*.json`)

const read = await parallel(batches.map((ids, i) => () =>
  agent(
    `Judge Auroville cluster cells ${ids.join(', ')}.

Run dir: \`${RUN}\` (repo root /Users/cyberchitta/GitHub/geo-darshan).
Round brief: \`${RUN}/${BRIEF}\` — read it after your standing reading list.
Your input cards: \`${RUN}/${CARDS}\` — filter to YOUR ids only.

Judge every exemplar of every one of your ${ids.length} cards.

Then do BOTH:
1. Write the complete verdict array (every exemplar) as JSON to
   \`${RUN}/${PREFIX}_${i}.json\`. **Every field named in \`${CONTRACT}\`, on
   every record.** That table is the single source of truth and this prompt
   deliberately does not restate it — a second list is how two of them drifted
   apart before.
2. Return the receipt. \`n_verdicts\` must equal the total number of exemplars
   across your cards; if anything stopped you reaching that, say so in \`notes\`
   rather than padding the count.`,
    { label: `read:b${i}`, phase: 'Read', agentType: 'cluster-reader', schema: RECEIPT }
  )
))

const ok = read.filter(Boolean)
const totalV = ok.reduce((a, r) => a + (r.n_verdicts || 0), 0)
log(`${ok.length}/${batches.length} readers returned; ${totalV} verdicts written`)
if (ok.length < batches.length) {
  const lost = batches.filter((_, i) => !read[i]).flat()
  log(`WARNING: ${batches.length - ok.length} reader batch(es) failed — cells NOT covered: ${lost.join(', ')}`)
}
for (const r of ok) if (r.notes) log(`reader b${r.batch}: ${r.notes}`)

// Gate on the record contract BEFORE anything expensive consumes the verdicts.
// A dropped channel field is invisible downstream: the miner reports zero and
// the zero reads as "nothing to report" rather than "nobody was asked".
phase('Contract')
const CONTRACT_SCHEMA = {
  type: 'object',
  required: ['passed', 'summary'],
  properties: {
    passed: { type: 'boolean', description: 'true only if the checker exits 0' },
    summary: { type: 'string', description: 'the RECORDS and SOURCES verdicts; quote any failure verbatim' },
  },
}
const contract = await agent(
  `Run the verdict-record contract checker over this round and report exactly what it says.
Do not fix anything, do not edit any file — this is a measurement.

From the repo root (/Users/cyberchitta/GitHub/geo-darshan):

    uv run --no-project python .claude/skills/cluster-labeling/scripts/check_verdict_contract.py \\
      ${RUN} --verdicts '${PREFIX}_*.json' --sources ${SELF} ${RUN}/${BRIEF} \\
      --hierarchy ${HIERARCHY}

Set \`passed\` true only if it exits 0.

One reading note that inverts the script's own hedge: it prints CHANNEL ABSENT as
"expected if this pass predates the channel". **This pass did not.** The readers
were just asked for those fields, so a CHANNEL ABSENT line here is a REAL DEFECT —
the field was dropped, and every downstream count of it is meaningless. Say so
plainly rather than repeating the script's hedge.`,
  { label: 'contract', phase: 'Contract', schema: CONTRACT_SCHEMA }
)
if (!contract || !contract.passed) {
  log(`CONTRACT CHECK FAILED — ${contract ? contract.summary : 'checker agent did not return'}`)
  log('Verdicts still stand, but any channel-derived count is not trustworthy.')
} else {
  log('contract check passed: every record carries every field')
}

// EVERY exemplar is verified, not only the changed ones. Round 3 sent only
// changes, so 158 of 266 exemplars were never challenged and agreement was
// unexamined by construction — `convergence-loop.md` calls fixing this the
// single biggest unblocker, since verification coverage is what the gate binds
// on. The verifier reads the written verdicts itself; a workflow script cannot
// read files, but an agent can.
phase('Verify')
log(`verifying every exemplar across ${batches.length} batches (not only changes)`)

const verified = await parallel(batches.map((ids, i) => () =>
  agent(
    `ADVERSARIAL CHECK. Another analyst judged these land-cover cells. Your job is to try to REFUTE each verdict by looking at the imagery yourself.

Run dir: \`${RUN}\` (repo root /Users/cyberchitta/GitHub/geo-darshan).
Round brief: \`${RUN}/${BRIEF}\`.

Read \`${RUN}/${PREFIX}_*.json\` and filter to clusters ${ids.join(', ')}.
Check **every** verdict for those clusters, not only ones that look surprising.

For each, read the exemplar's crops yourself (\`crops/cNNN_eN*\`, cluster
zero-padded to 3 digits) and the cluster's locator, and decide independently.
Default to \`refuted\` when the evidence for the label is not actually visible in
the crop — a label must earn its place. Use \`upheld\` only when you can name the
visual evidence yourself. Use \`unclear\` when the crop cannot settle it.
If you think the label is wrong AND you would use something else, set
\`better_label\`.

Judge against the class definitions, NOT against any earlier round. Do not read
\`judgments.json\`, \`rejudge_batch_*.json\`, \`*_baseline.json\` or \`ledger.json\` —
this round's independence is the measurement, and consulting them destroys it.

Write your results to \`${RUN}/${PREFIX}_verify_${i}.json\` as a JSON array, AND
return them. Round 4's verify pass returned 321 records that existed only in a
workflow return value; a session reading the run dir cold would have found the
adversarial pass missing entirely. One record per exemplar you checked — do not
emit a second record for an exemplar you already covered.`,
    { label: `verify:b${i}`, phase: 'Verify', agentType: 'cluster-reader', schema: VERIFY, effort: 'high' }
  )
))

const vres = verified.filter(Boolean).flatMap(v => v.results || [])
const tally = { upheld: 0, refuted: 0, unclear: 0 }
for (const r of vres) tally[r.verdict] = (tally[r.verdict] || 0) + 1
const contested = vres.filter(r => r.verdict === 'refuted' && r.better_label)
log(`verify tally: ${JSON.stringify(tally)} over ${vres.length} exemplars`)
log(`${contested.length} refutations name a third label — contested, decided one at a time by a person`)

return {
  batch_files: ok.map(r => r.path),
  readers_ok: ok.length,
  readers_expected: batches.length,
  total_verdicts: totalV,
  verified: vres.length,
  tally,
  contested: contested.map(r => ({ cluster: r.cluster, exemplar: r.exemplar, better_label: r.better_label })),
  results: vres,
}
