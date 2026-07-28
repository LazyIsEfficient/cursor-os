---
name: telemetry
description: Internal utility for the skills library itself — opt-in, local-first, privacy-respecting usage telemetry and update checks. Provides version checking, usage logging, and usage reporting for the skills in this repo. Use only when asked to view skill usage stats, configure telemetry opt-in/out, wire a skill to log its own runs, or check for skill updates.
---

# Telemetry

Internal, opt-in, local-first telemetry for skills in this repository. Answers two questions: *which skills get used (and how reliably)?* and *is newer library version available?* Every run logged to local file regardless of opt-in; data leaves machine only if user explicitly opted in. No PII ever collected — see [readme.md](readme.md) for full field list and privacy commitment.

## Where data lives

All state under telemetry data directory — default `~/.ai-marketing-skills/`, upstream location, can differ per install:

| Path | Written by | Contents |
|------|-----------|----------|
| `telemetry-config.json` | `telemetry_init.py` | `opted_in` (bool), `device_id` (random UUID), `created` |
| `analytics/skill-usage.jsonl` | `telemetry_log.py` | one JSON object per skill run (append-only) |
| `version-cache.json` | `version_check.py` | last GitHub release seen + check timestamp (24h TTL) |

Each line in `skill-usage.jsonl` records only anonymous fields: skill name, duration (ms), success, version, OS, arch, Python version, UTC timestamp, random `device_id`. Never code, paths, repo names, or content.

## Tools

| Script | Purpose | Invocation |
|--------|---------|------------|
| `telemetry_init.py` | Configure opt-in/out (interactive on first run) | `python3 telemetry/scripts/telemetry_init.py` (or `--yes` / `--no`) |
| `telemetry_log.py` | Log one skill run (called by a skill's preamble) | see integration pattern below |
| `telemetry_report.py` | View local usage stats | `python3 telemetry/scripts/telemetry_report.py` (`--json`, `--skill <name>`) |
| `version_check.py` | Check for a newer library release | `python3 telemetry/scripts/version_check.py` |

## Logging a skill's runs

Skill opts into telemetry by calling `telemetry_log.py` once at end of run. Script always appends to local JSONL log, additionally POSTs to analytics endpoint only if user opted in. Fails silently, never blocks execution. All four flags required:

```bash
python3 telemetry/scripts/telemetry_log.py \
  --skill my-skill-name \
  --duration 4500 \
  --success true \
  --version 1.0.0
```

Capture start time before work, compute `--duration` in milliseconds after, pass `--success false` if run errored. Endpoint in `telemetry_log.py` is stub (`ANALYTICS_ENDPOINT`) — replace with real URL before remote send does anything.

## Reading the stats

```bash
python3 telemetry/scripts/telemetry_report.py            # human-readable summary
python3 telemetry/scripts/telemetry_report.py --json      # machine-readable
python3 telemetry/scripts/telemetry_report.py --skill seo-ops   # filter to one skill
```

Reports total runs, runs last 7/30 days, per-skill success rates and average durations, most-used skill. Reads only local log — same whether or not opted in.

## Checking for updates

```bash
python3 telemetry/scripts/version_check.py
```

Compares local `VERSION` file against latest GitHub release, caches result 24h, stays silent unless newer version exists. **Needs `VERSION` file at repo's skills root (`plugin/skills/VERSION`) containing current version** (e.g. `1.0.0`). Absent file → no baseline, stays silent rather than reporting false update — create file to enable update notices.

## Privacy

- **Opt-in only** — nothing sent without explicit consent.
- **Local-first** — usage always stored locally for own inspection.
- **No PII** — no names, emails, paths, repo names, or content.
- **Revocable** — delete `telemetry-config.json` from telemetry data directory (default `~/.ai-marketing-skills/`) and re-run `telemetry_init.py`.
