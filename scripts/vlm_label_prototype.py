#!/usr/bin/env python3
"""Prototype: label embedding clusters by showing a VLM the satellite imagery.

Instead of a human naming each k-means cluster blind, this:
  1. picks a few spatially-distinct patches (connected components) of a cluster,
  2. crops a context window around each from the ESRI mosaic with the patch
     outlined,
  3. asks Gemini to classify the outlined region against the land-cover
     hierarchy, allowing it to fall back to an interior node when unsure,
  4. aggregates the per-exemplar votes into one label per cluster.

Run with --dry-run (no API key) to just generate the crops + prompt for
inspection, then re-run with GEMINI_API_KEY set to actually classify.
"""

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.windows import from_bounds
from scipy import ndimage
from PIL import Image, ImageDraw

PROJECT_ROOT = Path(__file__).parent.parent
DEFAULT_AOI = PROJECT_ROOT / "data" / "av-3.5K"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
GEMINI_LIST_URL = "https://generativelanguage.googleapis.com/v1beta/models"

# Latest vision-understanding models (image-IN / text-OUT). The configs'
# gemini-2.5-* are generations behind. Pro for the subtle species/geometry
# calls; ~88 clusters x few exemplars keeps cost trivial. For a cheap full-image
# sweep, swap --model gemini-3.5-flash. Do NOT use the *-image generation models
# (gemini-3-pro-image, gemini-3.1-flash-image) — they output images, not labels.
DEFAULT_MODEL = "gemini-3.1-pro-preview"


@dataclass(frozen=True)
class Config:
    cluster_raster: Path
    esri_raster: Path
    hierarchy_file: Path
    out_dir: Path
    n_clusters: int
    cluster_ids: Optional[List[int]]
    n_exemplars: int
    window_m: float
    min_patch_px: int
    max_img_px: int
    model: str
    api_key: Optional[str]
    dry_run: bool


# ----------------------------------------------------------------------------
# Hierarchy / field guide
# ----------------------------------------------------------------------------

# Diagnostic cues for the classes a generic labeler is most likely to confuse.
# These ride along with the auto-generated label list to give the model the
# land-use knowledge the original human labeler lacked.
FIELD_GUIDE = {
    "forest.natural_forest": "Irregular canopy heights, NO planting rows/grid, mixed crown sizes.",
    "forest.planted_forest": "Even-aged canopy, sometimes faint rows; more uniform than natural forest.",
    "forest.bamboo_groves": "Very fine bright-green feathery texture, dense clumps.",
    "agriculture.orchards.mango": "Large dense rounded dark-green crowns, wide regular spacing, blocky orchards.",
    "agriculture.orchards.coconut": "Tall palms: small star-burst crowns + long thin shadows, regular grid.",
    "agriculture.orchards.cashew": "Lower spreading crowns, moderate spacing, often on red/laterite soil.",
    "agriculture.orchards.casuarina": "Fine feathery grey-green texture, tall thin trees in dense plantation rows.",
    "agriculture.field_crops.rice_paddies": "Flat rectangular bunded fields, often wet/reflective or bright green flush.",
    "agriculture.field_crops.dryland_crops": "Bare-to-sparse rectangular fields, brown/tan, low texture.",
    "agriculture.field_crops.sugarcane": "Tall dense uniform bright-green grass-like fields, sharp field edges.",
    "agriculture.agroforestry.permaculture": "Mixed trees+beds, irregular but managed, paths and swales (Auroville systems).",
    "agriculture.fallow": "Bare or weedy rectangular fields with no active crop.",
    "built_environment.dense_built": "Many adjacent roofs, little vegetation, hard geometric edges.",
    "built_environment.sparse_built": "Scattered roofs amid open ground/vegetation.",
    "built_environment.forest_built": "Roofs embedded within tree canopy (buildings under/among trees).",
    "infrastructure.roads": "Linear grey/red strips, consistent width, connecting features.",
    "water": "Smooth dark or turquoise areas, no internal texture.",
    "grassland.maintained_grass": "Smooth uniform low green, mown look (lawns, maidans).",
    "degraded_barren": "Bare red laterite / eroded soil, little to no vegetation.",
}


def flatten_hierarchy(node: Dict[str, Any], prefix: str = "") -> List[Tuple[str, str]]:
    """Walk the land-cover tree into (dotted_path, description) pairs.

    Both interior nodes and leaves are returned so the model can answer at
    whatever level the imagery supports (e.g. 'agriculture.orchards' when the
    species is ambiguous).
    """
    out: List[Tuple[str, str]] = []
    for key, value in node.items():
        if key.startswith("_"):
            continue
        path = f"{prefix}.{key}" if prefix else key
        desc = ""
        children = {}
        if isinstance(value, dict):
            desc = value.get("_description", "")
            children = {k: v for k, v in value.items() if not k.startswith("_")}
        out.append((path, desc))
        if children:
            out.extend(flatten_hierarchy(children, path))
    return out


def build_prompt(labels: List[Tuple[str, str]]) -> str:
    lines = ["LAND-COVER CLASSES (dotted hierarchy; you may answer at any level):"]
    for path, desc in labels:
        cue = FIELD_GUIDE.get(path, "")
        suffix = f" — {desc}" if desc else ""
        if cue:
            suffix += f" [LOOKS LIKE: {cue}]"
        lines.append(f"  - {path}{suffix}")
    guide = "\n".join(lines)
    return f"""You are an expert remote-sensing land-use analyst for the Auroville region (Tamil Nadu, India). \
The image is a ~high-resolution satellite crop. A single contiguous land patch is OUTLINED IN MAGENTA and tinted yellow. \
Classify ONLY that outlined patch (use the rest of the image as context).

{guide}

RULES:
- The imagery is ~1m. Individual tree crowns ARE resolvable when they stand alone or are well-spaced: read crown shape, \
size, colour and shadow to identify species (coconut = small star-burst crown + long thin shadow; mango = broad dense \
rounded dark dome; casuarina = fine feathery grey-green; cashew = lower spreading crown). Where crowns merge into closed \
canopy you cannot separate individuals — judge by overall texture and pattern instead.
- Combine crown appearance with PLANTING GEOMETRY (row spacing, grid regularity), field boundaries and adjacency.
- Judge the OUTLINED patch, using surrounding context to disambiguate (e.g. adjacency to roads/water).
- Pick the MOST SPECIFIC class the evidence supports. Name the species when crowns are individually legible; fall back to \
the parent node (e.g. 'agriculture.orchards') only when canopy is closed/merged and species is genuinely ambiguous. \
Better a correct general label than a wrong specific one.
- If the patch is genuinely mixed, give the dominant class and note it.
- If you cannot tell at all, use label "uncertain".

Respond with ONLY a JSON object, no markdown:
{{"label": "<dotted.path or uncertain>", "level": "<leaf|interior>", "confidence": <0-1>, \
"alternative": "<second-best dotted.path or null>", "reasoning": "<one sentence on the visual evidence>"}}"""


# ----------------------------------------------------------------------------
# Patch selection + crop rendering
# ----------------------------------------------------------------------------

@dataclass
class Exemplar:
    cluster_id: int
    index: int
    size_px: int
    center_lonlat: Tuple[float, float]
    bounds: Tuple[float, float, float, float]  # context window geo bounds
    crop_path: Path
    result: Dict[str, Any] = field(default_factory=dict)


def pick_clusters(cluster_arr: np.ndarray, cfg: Config) -> List[int]:
    if cfg.cluster_ids:
        return cfg.cluster_ids
    ids, counts = np.unique(cluster_arr[cluster_arr >= 0], return_counts=True)
    order = np.argsort(-counts)  # largest first
    return [int(ids[i]) for i in order[: cfg.n_clusters]]


def patch_exemplars(
    mask: np.ndarray, n: int, min_px: int
) -> List[Tuple[int, Tuple[float, float]]]:
    """Largest connected components of a cluster mask -> (size, (row, col))."""
    labeled, n_comp = ndimage.label(mask)
    if n_comp == 0:
        return []
    sizes = ndimage.sum(np.ones_like(labeled), labeled, index=range(1, n_comp + 1))
    centroids = ndimage.center_of_mass(mask, labeled, index=range(1, n_comp + 1))
    comps = [
        (int(sizes[i]), centroids[i])
        for i in range(n_comp)
        if sizes[i] >= min_px
    ]
    comps.sort(key=lambda c: -c[0])
    return comps[:n]


def render_crop(
    esri: rasterio.DatasetReader,
    cluster_src: rasterio.DatasetReader,
    cluster_id: int,
    center_lonlat: Tuple[float, float],
    cfg: Config,
) -> Tuple[Image.Image, Tuple[float, float, float, float]]:
    """Read a context window from ESRI, overlay the cluster's local footprint."""
    lon, lat = center_lonlat
    half_deg = (cfg.window_m / 111_320.0) / 2.0  # ~m per degree at equator
    box = (lon - half_deg, lat - half_deg, lon + half_deg, lat + half_deg)

    win = from_bounds(*box, transform=esri.transform)
    h = int(round(win.height))
    w = int(round(win.width))
    scale = min(1.0, cfg.max_img_px / max(h, w))
    out_h, out_w = max(1, int(h * scale)), max(1, int(w * scale))

    rgb = esri.read(
        [1, 2, 3], window=win, out_shape=(3, out_h, out_w),
        resampling=Resampling.bilinear, boundless=True, fill_value=0,
    )
    rgb = np.transpose(rgb, (1, 2, 0)).astype(float)

    # Read the cluster raster onto the SAME geo window/grid (nearest), so the
    # overlay lines up with the imagery pixel-for-pixel.
    cwin = from_bounds(*box, transform=cluster_src.transform)
    clusters = cluster_src.read(
        1, window=cwin, out_shape=(out_h, out_w),
        resampling=Resampling.nearest, boundless=True, fill_value=-1,
    )
    patch = clusters == cluster_id
    edge = ndimage.binary_dilation(patch, iterations=2) & ~patch

    # Light tint only: a heavy fill flattens crown/canopy texture (it caused a
    # coconut->scrub misread). Lean on the magenta outline to mark the patch.
    rgb[patch] = rgb[patch] * 0.88 + np.array([255, 255, 0]) * 0.12
    rgb[edge] = np.array([255, 0, 255])
    img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))

    draw = ImageDraw.Draw(img)
    draw.text((4, 4), f"cluster {cluster_id} | {cfg.window_m:.0f}m", fill=(255, 255, 255))
    return img, box


# ----------------------------------------------------------------------------
# Gemini call
# ----------------------------------------------------------------------------

def list_models(api_key: str) -> None:
    """Print vision-capable generateContent models available on this account."""
    req = urllib.request.Request(f"{GEMINI_LIST_URL}?key={api_key}&pageSize=200")
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    print("Available generateContent models:")
    for m in data.get("models", []):
        if "generateContent" in m.get("supportedGenerationMethods", []):
            name = m["name"].removeprefix("models/")
            print(f"  {name:<32} {m.get('displayName', '')}")


def call_gemini(img: Image.Image, prompt: str, cfg: Config) -> Dict[str, Any]:
    import io

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    b64 = base64.b64encode(buf.getvalue()).decode()
    body = {
        "contents": [{"parts": [
            {"text": prompt},
            {"inline_data": {"mime_type": "image/jpeg", "data": b64}},
        ]}],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 512,
            "responseMimeType": "application/json",
        },
    }
    url = GEMINI_URL.format(model=cfg.model) + f"?key={cfg.api_key}"
    req = urllib.request.Request(
        url, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read())
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            return json.loads(text)
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:200]
            if e.code in (429, 500, 503) and attempt < 2:
                time.sleep(2 * (attempt + 1))
                continue
            return {"label": "error", "confidence": 0.0, "reasoning": f"HTTP {e.code}: {msg}"}
        except (json.JSONDecodeError, KeyError, urllib.error.URLError) as e:
            return {"label": "error", "confidence": 0.0, "reasoning": str(e)[:200]}
    return {"label": "error", "confidence": 0.0, "reasoning": "retries exhausted"}


# ----------------------------------------------------------------------------
# Aggregation
# ----------------------------------------------------------------------------

def aggregate(exemplars: List[Exemplar]) -> Dict[str, Any]:
    """Confidence-weighted vote across a cluster's exemplars."""
    scores: Dict[str, float] = {}
    valid = [e for e in exemplars if e.result.get("label") not in (None, "error")]
    for e in valid:
        lbl = e.result.get("label", "uncertain")
        scores[lbl] = scores.get(lbl, 0.0) + float(e.result.get("confidence", 0.0))
    if not scores:
        return {"label": "uncertain", "confidence": 0.0, "agreement": 0.0, "n": len(exemplars)}
    best = max(scores, key=scores.get)
    agree = sum(1 for e in valid if e.result.get("label") == best) / len(valid)
    mean_conf = np.mean([
        float(e.result.get("confidence", 0.0))
        for e in valid if e.result.get("label") == best
    ])
    return {
        "label": best,
        "confidence": round(float(mean_conf), 3),
        "agreement": round(agree, 3),
        "n": len(valid),
        "votes": scores,
    }


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------

def run(cfg: Config) -> None:
    cfg.out_dir.mkdir(parents=True, exist_ok=True)
    crops_dir = cfg.out_dir / "crops"
    crops_dir.mkdir(exist_ok=True)

    labels = flatten_hierarchy(json.loads(cfg.hierarchy_file.read_text()))
    prompt = build_prompt(labels)
    (cfg.out_dir / "prompt.txt").write_text(prompt)
    print(f"📝 {len(labels)} hierarchy nodes; prompt -> {cfg.out_dir / 'prompt.txt'}")

    esri = rasterio.open(cfg.esri_raster)
    cluster_src = rasterio.open(cfg.cluster_raster)
    cluster_arr = cluster_src.read(1)

    target_clusters = pick_clusters(cluster_arr, cfg)
    print(f"🎯 clusters: {target_clusters}  ({cfg.n_exemplars} exemplars each)")
    mode = "DRY RUN (no API calls)" if cfg.dry_run else f"model={cfg.model}"
    print(f"⚙️  {mode}\n")

    all_exemplars: List[Exemplar] = []
    cluster_labels: Dict[str, Any] = {}
    results_log = (cfg.out_dir / "results.jsonl").open("w")

    for cid in target_clusters:
        mask = cluster_arr == cid
        comps = patch_exemplars(mask, cfg.n_exemplars, cfg.min_patch_px)
        if not comps:
            print(f"  cluster {cid}: no patch >= {cfg.min_patch_px}px, skipping")
            continue
        ex_list: List[Exemplar] = []
        for i, (size_px, (row, col)) in enumerate(comps):
            lon, lat = cluster_src.xy(row, col)
            img, box = render_crop(esri, cluster_src, cid, (lon, lat), cfg)
            crop_path = crops_dir / f"c{cid:03d}_e{i}.jpg"
            img.save(crop_path, quality=85)
            ex = Exemplar(cid, i, size_px, (lon, lat), box, crop_path)
            if not cfg.dry_run:
                ex.result = call_gemini(img, prompt, cfg)
            ex_list.append(ex)
            all_exemplars.append(ex)
            r = ex.result
            tag = "" if cfg.dry_run else f" -> {r.get('label')} ({r.get('confidence')})"
            print(f"  cluster {cid} ex{i}: {size_px:>5}px {crop_path.name}{tag}")
            results_log.write(json.dumps({
                "cluster": cid, "exemplar": i, "size_px": size_px,
                "center": [lon, lat], "crop": str(crop_path), "result": r,
            }) + "\n")
        if not cfg.dry_run:
            agg = aggregate(ex_list)
            cluster_labels[str(cid)] = agg
            print(f"  => cluster {cid}: {agg['label']} "
                  f"(conf {agg['confidence']}, agree {agg['agreement']})\n")

    results_log.close()
    if cluster_labels:
        out = cfg.out_dir / "cluster_to_label.json"
        out.write_text(json.dumps(cluster_labels, indent=2))
        print(f"\n💾 cluster labels -> {out}")
    print(f"🖼️  {len(all_exemplars)} crops -> {crops_dir}")
    if cfg.dry_run:
        print("\nDry run complete. Inspect the crops + prompt, then set "
              "GEMINI_API_KEY and re-run without --dry-run.")


def parse_args() -> Config:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--aoi", type=Path, default=DEFAULT_AOI, help="AOI data dir")
    p.add_argument("--seg-key", default="k88_s42", help="segmentation raster stem")
    p.add_argument("--esri", type=Path, default=None, help="override ESRI mosaic path")
    p.add_argument("--clusters", type=int, default=4, help="how many (largest) clusters")
    p.add_argument("--cluster-ids", type=int, nargs="+", help="explicit cluster ids")
    p.add_argument("--exemplars", type=int, default=3, help="patches per cluster")
    p.add_argument("--window-m", type=float, default=200.0, help="context window (m)")
    p.add_argument("--min-patch-px", type=int, default=4, help="skip patches smaller than this")
    p.add_argument("--max-img-px", type=int, default=768, help="max crop dimension")
    p.add_argument("--model", default=DEFAULT_MODEL)
    p.add_argument("--api-key", default=os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"))
    p.add_argument("--out", type=Path, default=None, help="output dir")
    p.add_argument("--dry-run", action="store_true", help="render crops only, no API")
    p.add_argument("--list-models", action="store_true", help="list available models and exit")
    a = p.parse_args()

    if a.list_models:
        if not a.api_key:
            print("Set GEMINI_API_KEY/GOOGLE_API_KEY or pass --api-key to list models.")
            sys.exit(1)
        list_models(a.api_key)
        sys.exit(0)

    aoi = a.aoi
    cfg = Config(
        cluster_raster=aoi / "intermediates" / "clusters" / f"{a.seg_key}.tif",
        esri_raster=a.esri or (aoi / "intermediates" / "esri_3.5k_roi_cog.tif"),
        hierarchy_file=aoi / "land-cover.json",
        out_dir=a.out or (aoi / "intermediates" / "vlm_label"),
        n_clusters=a.clusters,
        cluster_ids=a.cluster_ids,
        n_exemplars=a.exemplars,
        window_m=a.window_m,
        min_patch_px=a.min_patch_px,
        max_img_px=a.max_img_px,
        model=a.model,
        api_key=a.api_key,
        dry_run=a.dry_run or not (a.api_key),
    )
    if not a.dry_run and not a.api_key:
        print("⚠️  No GEMINI_API_KEY/GOOGLE_API_KEY found — forcing --dry-run.\n")
    return cfg


if __name__ == "__main__":
    try:
        run(parse_args())
    except FileNotFoundError as e:
        print(f"❌ {e}")
        sys.exit(1)
