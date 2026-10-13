Twin fleet simulated conversation review — 13 October 2026, Brisbane time

Testing found additional defects. This is a diagnosis report, not a production repair or a release approval. All 20 active creators were exercised on their actual engine: the full V2 pass covered 17 creators; the three V1 creators received a separate bounded pass with the limitations below. No fan messages, purchases, database changes, creator migrations or production deployments occurred.

**Results and scope**

The V2 run completed **464 real-model turns using exactly 464 requests**. Of those turns, **51 failed the predeclared action assertions**, all because an existing-card follow-up caused an unwanted new photo. The other 413 met the automated assertions; that is not a claim that every reply was correct. A separate manual review examined the 34 heuristically flagged turns and found issues beyond those assertions.

The V2 run ended at 18:02:24 Brisbane. The original settings/catalogue snapshot was taken at 17:51:31. A fresh settings comparison at 18:12:31 found no changes to the 20 creator assignments, V2 variables or inspected feature settings. Bot and dashboard remained on runtime `2f24f023c0cf46bea1c3b3b334458cf1a5df265e`, image `sha256:dff48242b35b94e7b0e757ee4b7778a11958ef85b231b5fdb369542902e325f9`. The release branch remained `2b59d900bd61fbcd335228f2032c6548b37535a1` (later documentation). V1 remained on `caa2a94ee519eb84d25b6c77023f732e8fed7b36`, image `sha256:f9618c70eb79abd38cce8991f47b4a6b11f19b7d28eb7d3886baa0a4e5b368ab`.

**Confirmed V2 findings**

| Finding | Evidence and interpretation |
|---|---|
| Existing-card discussion sends another file | 51 cases across all 16 V2 creators with photos: 16 accepting the existing card, 14 asking what it contains, 7 asking its Stars price on Business, and 14 price questions on ordinary chats. The new file keys differ from the preceding card. Allison has no catalogue, so her unavailable responses were appropriate. This broadens the already known action-selection defect; it is not 51 separate bugs. |
| Spoken item prices are invented | Ten numeric item-price claims were confirmed among the flagged replies. Kyla said 100 Stars while the simulated paid payload was five; Riley suggested 200 while the payload was five. Actual delivery pricing passed the tested checks. Five other numeric flags were permitted currency-conversion explanations and were not counted as item-price defects. Some unflagged, vague price estimates also lack item-price evidence. |
| Alternatives appear on price questions | Dakota and Trashy received the automatic “here's a different option” caption during an existing-card price question. No new visual requirement had been requested. The exact match-token cause still needs the full catalogue/menu trace; it has not been assumed from the word Stars. |
| Accurate colour description is deleted — newly confirmed | Kyla's catalogue says “blue ribbed crop top.” The model's shorter “blue crop top” was rejected as unsupported; grounding erased the entire caption while the correct five-Star photo card was acknowledged by the fake transport. `coloursBefore` does not recognise the intervening modifier. This was reproduced deterministically using the current code, without another model call. |
| Reported refusal is mistaken for inventory denial — newly confirmed | Dreka's reference to the fan having said no photos was labelled “stock claim contradicts remaining availability.” A separate neutral sentence, “you said no photos earlier,” is also incorrectly removed with a nonempty inventory. The actual Dreka reply also contained refusal banter prohibited by the prompt: correcting this classification must not restore that banter. |
| Failed reference checks can produce invented explanations | When fresh ownership verification was deliberately unavailable, Kyla claimed Telegram would not allow repeated resends. Other creators described the request as an attempt to get a free photo or asserted that the prior card must be visible. The code correctly withheld a send; the explanation was not grounded in the simulated failure. This extends the known recovery-language gap. |

Three acknowledged photo cards had empty captions. The guard correctly removed an unsupported pose in one case; the two false-positive mechanisms above affected the others. A fourth empty-result flag came from the deliberate Telegram 403 rejection: recovery was correctly suppressed because send permission was denied. It is not an additional silence bug.

**Behaviour retained in this pass**

There were 64 successful exact-reference cases across creators with photos, including 16 owned-photo resends delivered as unlocked synthetic photos. Requested generic/new/different photos, eligible free previews, refusals, tone changes, greetings, recent name/city recall, reset without a reference, unknown transport outcomes, failed ownership verification and the focused exhausted/analysis-blocked/free-only/paid-only cases met their specified action assertions. No turn produced more than one media action. Tested file identity, selected path, actual payload price and receipt persistence checks passed.

The snapshot had memory and message credits off for V2. The live `V2_BUNDLES` setting was explicitly `off`; bundle records in a catalogue do not mean bundles are active. An earlier progress update incorrectly described bundles as enabled. The simulation preserved the off setting. Active tip switches were represented with the existing tip runtime and an in-memory backend; no deliberate tip purchase was made. Creator variables and emoji policies used the shared renderer, and all 17 rendered/display-part comparisons matched. A fresh dashboard HTTP/browser display check was not part of this run.

**Separate V1 results**

Autumn Renae, Dan Dangler and Hazey Haley were tested on the actual V1 image, with frozen live clone mappings, prompt templates and catalogues. Only pacing/read effects/random voice I/O were disabled; users, history, receipts and commerce were in memory. No live bot token or database credential was passed into a simulation container.

The V1 harness recorded 60 turn attempts and 300 real model requests. Each creator reached the predeclared 100-request ceiling. **52 turns completed before the budget boundary; eight boundary/later turns are excluded from product pass/fail conclusions.** Original results are retained, including the 14 raw assertion failures. They have not been relabelled as successful.

Five pre-boundary name-recall checks failed: Autumn twice, Dan twice, Hazey once. Examples include “you're and you live in brisbane” and “you told me from brisbane”; the fan had supplied Alex immediately beforehand. Those malformed or missing-name responses are an additional finding in V1, not evidence of a V2 memory defect. V1 also missed some renewed photo requests and failed to resolve questions about a captured prior offer. Those need comparison with its configured offer limits and Messenger/receipt fidelity before being called confirmed product defects. Its existing pipeline used up to 18 model calls for a simple introduction; this was measured, not introduced by the test.

The first V1 dry run failed before any model call because its non-root container user could not read the isolated fixture. The test-directory ownership was corrected, that original failure was retained, and a second 20-turn dry run completed with zero model calls and no handler errors. The actual V1 model pass then ran once. No model failures were rerun to seek a favourable answer.

**Creator coverage**

| Creator | Engine | Reviewed turns | Raw V2 action failures / V1 note |
|---|---|---:|---|
| alanna-pow | V2 | 27 | 4 unwanted-photo cases |
| allison-parker | V2 | 27 | 0 unwanted-photo cases |
| bethany-marquez | V2 | 27 | 3 unwanted-photo cases |
| briana-redd | V2 | 27 | 3 unwanted-photo cases |
| cat-chase | V2 | 27 | 2 unwanted-photo cases |
| dakota-lyn | V2 | 27 | 4 unwanted-photo cases |
| dreka-cakez | V2 | 27 | 2 unwanted-photo cases |
| fit-sid | V2 | 27 | 3 unwanted-photo cases |
| kyla-yesenosky | V2 | 27 | 3 unwanted-photo cases |
| mrs-callace | V2 | 27 | 3 unwanted-photo cases |
| olivia-jade | V2 | 27 | 3 unwanted-photo cases |
| riley-mae-lewis | V2 | 32 | 3 unwanted-photo cases |
| sania-mallory | V2 | 27 | 4 unwanted-photo cases |
| tammy | V2 | 27 | 4 unwanted-photo cases |
| toochi | V2 | 27 | 3 unwanted-photo cases |
| trashy | V2 | 27 | 4 unwanted-photo cases |
| tru-kait | V2 | 27 | 3 unwanted-photo cases |
| autumn-renae | V1 | 16 before budget boundary | See legacy limits below |
| dan-dangler | V1 | 17 before budget boundary | See legacy limits below |
| hazey-haley | V1 | 19 before budget boundary | See legacy limits below |

**Evidence, compatibility and next stage**

Only diagnostic scripts and evidence were changed. The V2 simulation commit is `c350ee50992178a21f9610a8ea0062e94c7e9901`; the V1 test is `8d1bb69945021c63d5b44190315c3c774ed48d8c`, with the isolated fixture-permission correction at `8cabab442210698f54058d13889edefa72903f79`. [The final evidence read](https://github.com/jesse98/twin-dashboard/actions/runs/38367670326) preserves the original summaries and compressed readback. Full model requests, untouched responses, accumulated histories and fake transport records remain in `/home/ubuntu/twin-v2-validation/fleet-simulation-20261013-1791877888400228253`. Model-reported inference cost for the two passes was approximately $0.192 USD.

The current source, shared photo/Stars prompt and pending PR #1 were inspected. PR #1 is still open at `ea69bd64dcb57a022c41724c04c1073a2de5e7a8`; its colour/garment changes overlap the already deployed grounding component and do not repair the newly reproduced modifier or stock-attribution cases. It should not be applied as a second guard.

These findings identify the existing responsible areas: `src/turn.ts` selection/reference handling, `src/media.ts` menu matching, `src/grounding.ts` validation, and the current shared photo/Stars paragraphs. No replacement implementation is proposed as tested here. The next repair stage must use these saved cases, preserve the working resend/ownership/pricing checks and resolve the existing-component interactions before a production replacement. There is no new product commit to deploy or roll back from this testing stage.

This was a new simulated conversation pass using fresh isolated histories, not another replay of the older seven-turn incident or uploaded PDF. It cannot establish actual Telegram visibility, inbound Business connectivity, payment settlement, real file-byte correctness, long-term memory, videos/voice, dashboard performance or absence of other bugs. No “all fixed” or bug-free conclusion is justified.

**Jesse's standing development instructions — retained verbatim**

For every Twin V2 recommendation or edit, inspect the current code, relevant prompts and recent changes first. Check how the proposed change interacts with existing behaviour before implementing it.

Make the smallest necessary change. Do not add contradictory instructions, duplicate handlers, competing logic, unnecessary prompt layers or extra AI calls. Update the existing responsible component wherever practical.

Keep the bot’s prompt and displayed prompt consistent with what the code actually does. Preserve previously approved behaviour except where the requested change explicitly modifies it.

Test the affected flow and relevant failure cases. Check data compatibility and rollback when applicable. Explain what changed, what was verified and any remaining uncertainty. Never claim there are no clashes without checking.

Work one agreed stage at a time. These are development instructions; keep them outside the bot’s fan-facing prompt.

Apply these requirements to suggestions as well as implementation. Do not recommend or add a change until you have checked it against existing prompts, code and pending work for contradictions, duplicate logic and failure risks.
