# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What it does

geo-darshan is a web-based geospatial visualization tool for Auroville land cover analysis. It lets users navigate cluster segmentation data at different k-values, label land use categories, run LLM-powered object detection on satellite imagery, and export GeoTIFF results. It sits atop alpha-bhu, which produces the underlying embeddings and cluster data.

## Tech stack

- **Frontend:** Svelte + Vite, Bun runtime, Leaflet (map), Turf.js (geospatial ops)
- **Backend/data pipeline:** Python + uv (rasterio, shapely, fiona, numpy, pyyaml), depends on alpha-bhu
- **LLM integration:** Gemini 2.5 Flash/Pro for object detection (API key required)
- **Output formats:** GeoTIFF, GeoJSON

## Architecture

Hybrid project with a Python data pipeline and a Svelte web frontend:

- `app/` - Svelte frontend (cluster viewer + object detection UI)
- `scripts/` - Python/JS scripts for tile downloading and stitching (ESRI imagery)
- `data/` - Geospatial data (rasters, vectors) — gitignored, ~3 GB, not on GitHub
  — **and it holds live operative code, not only data.** A run directory
  (`data/av-3.5K/intermediates/vlm_label_k88xk22/`) carries that run's
  `HANDOFF.md`, its generated review page, and `rejudge_workflow.js` — the
  workflow the re-judge swarm actually executes. So a repo-scoped search that
  excludes `data/` reports that a committed script is referenced *nowhere* when
  its only caller lives there. Confident, wrong, and it looks like a finding.
  Search `data/` explicitly before concluding anything is unused.
- `output/` - Generated GeoTIFFs and mapping files — gitignored
- `config.yaml` - Pipeline configuration (paths, parameters)
- `_notes/` - working notes, gitignored — see below

The frontend has two main views: cluster-viewer (segmentation navigation and labeling) and detection (LLM-based feature detection).

## Commands

```bash
# Frontend development
bun run cluster-viewer:dev   # Cluster viewer
bun run detection:dev        # Detection UI

# Production build
bun run build

# Tile management
bun run download-tiles        # Download ESRI satellite tiles
bun run stitch-tiles          # Stitch tiles into mosaic

# Code quality
bun run format
bun run lint
bun run type-check
```

## Working notes (gitignored)

Tracked separately in the private `working-notes` repo, symlinked at `_notes/`;
invisible to the `Grep`/`Glob` tools (global `CLAUDE.md` has the `rg` forms).

**Authority is split between two documents, and routing to the wrong one is how
the worklist stopped being a worklist.** Pending work goes in the first; accounts
of work done go in the second. Never the reverse.

- **`_notes/worklist.md` — start here. It is a TASK LIST, nothing else.** One
  line per pending task, each pointing at the document holding the detail, plus a
  START HERE block for a cold session. Read it at the start of any session with no
  other stated goal, and delete a task from it when that task lands. **If what you
  are writing is an account of work done, it is not a task and it does not belong
  here** — for seventeen sessions this file absorbed session records instead,
  reached 1,900 lines, and could no longer answer "what is left?".
- `_notes/session-log.md` — the session records that used to crowd it out
  (sessions 1–17), moved out 2026-08-21. **History only; no pending work.** Read
  it to find out *why* something was decided, never what to do next. Pendings were
  compiled out of it by hand — a reading, not a check — so it is still the place
  to look if something you expect to be pending is missing from the worklist.
- `_notes/cluster-relabeling_handoff.md` — how VLM-based cluster relabeling
  replaced the original hand-labeling. **Historical narrative only:** that
  workflow is now a skill, and
  `.claude/skills/cluster-labeling-auroville/SKILL.md` is canonical.

Other notes are speculative unless stated otherwise — do not implement from them
without asking.

## Activity

268 commits, 2025-08-23 to 2025-10-25 — active development through late 2025

## Status

Active (as of late 2025). Companion to alpha-bhu; together they form the Auroville land use analysis pipeline.
