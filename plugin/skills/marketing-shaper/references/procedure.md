# Marketing Shaper Procedure

## Brief Types

Identify what *kind* of marketing work request is:

- **Campaign** — multi-channel initiative touching 3+ surfaces. Use `assets/campaign-template.md`.
- **Content** — creating specific deliverable (post, thread, deck, newsletter). Use `assets/content-template.md`.
- **Optimization** — improving something that already exists (CRO, A/B, copy scoring). Use `assets/optimization-template.md`.
- **Research** — answering a question, no deliverables produced. Use `assets/research-template.md`.
- **Pipeline** — building or tuning sales motion (sequences, lead scoring). Use `assets/pipeline-template.md`.

## Steps

1. Read request; identify brief type.
2. Read matching template from `assets/`. Read `references/interview-checklist.md` for questions.
3. Identify which sections user already answered. Do not re-ask those.
4. **Round 1 questions.** Batch missing pieces into single AskUserQuestion call — 3–6 questions, load-bearing gaps first.
5. Resolve each remaining gap into one of three states:
   - **Answered** — fill it.
   - **Assumed** — fill with default, tag inline: `[Assumed: <value> — say if wrong]`.
   - **Deferred** — mark `<TBD — to investigate>`.
6. **Round 2 (only if needed).** 1–3 questions covering only unresolved load-bearing items. No round 3.
7. Output filled template in single fenced markdown block.

## Hard Rules

- Never guess silently — every gap must be Answered, Assumed (tagged), or Deferred.
- Load-bearing items must be answered — never assumed or deferred.
- Cap at two rounds of questions.
- Always ask about quality gates (expert panel scoring).
- Do not assign skills to subtasks — describe concern, not skill filename.
- Do not start work unless user says "go" / "execute" / "do it" after seeing brief.

## Load-Bearing Items

**Universal (any brief type):**
- Audience — who this is for (role, company size, industry, pain point)
- Success metric — one number that tells you it worked
- Quality gate — expert panel scoring or not

**Campaign:**
- Channels in scope
- Core message in one sentence

**Content:**
- Format (thread, post, deck, newsletter, etc.)
- Core angle / takeaway

**Optimization:**
- What specifically underperforms (URL, asset, sequence)
- Current metric + target

**Research:**
- Actual question (phrased as question with an answer)
- Decision the answer unblocks

**Pipeline:**
- Current state (new build vs. tuning existing)
- Bottleneck (lead volume, qualification, close rate, churn)

Everything else (timeline, budget, tools, prior knowledge) Assumable — fill with safe default, tag it.

## Output Shape

**Campaign or pipeline brief:**
> *"Here is your marketing brief. Decompose it by channel/deliverable next, then run each one as its own loop. Paste it into a fresh session, or say 'go' and I'll hand it off now."*

**Single-deliverable brief (content, optimization, research):**
> *"Here is your marketing brief. Paste it into a fresh session, or say 'go' and I'll execute it now."*

Then stop. No commentary after brief.
