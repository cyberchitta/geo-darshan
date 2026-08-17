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

- **`_notes/worklist.md` — start here.** Central "what's next to work on": the
  current task, what's queued, and which document holds the detail for each.
  Not speculative — it is the live index. Read it at the start of a session that
  has no other stated goal, and keep it current when the next action changes.
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
