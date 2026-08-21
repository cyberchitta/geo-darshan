#!/usr/bin/env python3
"""Render the crop that is actually about the cell: window sized to the patch.

**Why this exists.** The judged crop is a fixed 200 m window, and the cell inside
it is a median **5.2%** of the frame (65% of exemplars under 10%, measured over
332 `_fill.png` layers of the k88xk22 run). The only view carrying the cell's
boundary is the burned-in `.jpg` at 339x339, against 677x677 for the untinted
`_raw.jpg` -- so a reader choosing texture over placement is choosing the blurry
half-resolution image, and a reader choosing placement is choosing the one whose
tint flattens crown detail. Neither view answers "what is THIS patch".

Readers noticed before anyone rendered this. Mining three reader transcripts
(2026-08-22): 25 resize/upscale calls, 21 crop-to-sub-region, 6 compositing
`_edge`/`_fill` over `_raw`, and one `np.nonzero` over a fill mask to find the
patch's bounding box. They were building this file by hand, per exemplar, at
their own token cost. Two consequences, and the second is worse: it inflated
transcripts to 22-24 MB (49% base64 imagery), and it meant **the readers were not
looking at the same images** -- one judged 53 self-made crops against 10 from the
run dir, another 15 against 55. Concurrence across readers is the measurement
that replaces gate criterion 4, and it cannot survive readers rendering their own
inputs.

So: render it once, identically, for everyone -- then take `Bash` off the reader
(worklist T68) so the inputs are fixed by construction rather than by request.

What this writes, per exemplar, to `crops/cNNN_eN_patch.jpg`:

  * window = the patch's own bounding box, padded, floored at --min-window-m so a
    one-pixel cell still gets something to sit in
  * basemap at native resolution, upscaled to --out-px when the window is small
  * the magenta boundary burned in, at a width that scales with the output
  * **no tint** -- the fill is what flattened crown texture and turned a coconut
    grove into "scrub"; the boundary alone answers "what am I labelling"
  * a caption carrying the window size and the patch's achieved share of the
    frame, so the reader can see how much of what it is looking at is the subject

This does NOT replace the existing crops. The 200 m marked view still answers
*where in the landscape*, and `_ctx` at 800 m still answers *what surrounds it* --
several classes cannot be decided without the matrix. This adds the missing third
view, the one about the cell itself.

Generic engine script (cluster-labeling skill). AOI-agnostic: all paths via args.

Usage:
  gen_patch_crops.py RUN_DIR --seg SEG.tif --base BASE.tif \
      [--results results.jsonl] [--clusters 3,7,9] [--out-px 768] \
      [--min-window-m 40] [--margin 0.35] [--force]
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image, ImageDraw
from rasterio.enums import Resampling
from rasterio.windows import from_bounds
from scipy import ndimage

M_PER_DEG = 111_320.0


def component_bounds(seg, center, cluster_id, search_m):
    """Geographic bounds of the patch the exemplar's centre sits in.

    Falls back to the largest component in the search window when the centre
    pixel is not the cluster's -- the seg raster is nearest-resampled onto the
    crop grid, so a centre can land a pixel off its own patch. Returns None when
    the cluster does not appear in the window at all.
    """
    lon, lat = center
    half = (search_m / M_PER_DEG) / 2.0
    box = (lon - half, lat - half, lon + half, lat + half)
    win = from_bounds(*box, transform=seg.transform)
    h, w = max(1, int(round(win.height))), max(1, int(round(win.width)))
    arr = seg.read(1, window=win, out_shape=(h, w),
                   resampling=Resampling.nearest, boundless=True, fill_value=-1)
    mask = arr == cluster_id
    if not mask.any():
        return None

    labeled, n = ndimage.label(mask)
    cid = labeled[h // 2, w // 2]
    if cid == 0:  # centre missed its own patch -- take the largest instead
        sizes = ndimage.sum(mask, labeled, index=range(1, n + 1))
        cid = int(np.argmax(sizes)) + 1
    ys, xs = np.nonzero(labeled == cid)

    # pixel indices -> geographic bounds, via the window's own upper-left origin
    lon0, lat0 = box[0], box[3]
    dlon = (box[2] - box[0]) / w
    dlat = (box[3] - box[1]) / h
    return (lon0 + xs.min() * dlon, lat0 - (ys.max() + 1) * dlat,
            lon0 + (xs.max() + 1) * dlon, lat0 - ys.min() * dlat)


def render(esri, seg, center, cluster_id, bounds, out_px, min_window_m, margin):
    """-> (image, window_m, patch share of frame)."""
    # The window follows the patch's aspect, it is not forced square. A square
    # frame around a linear feature is mostly not the feature: measured over 332
    # exemplars, the cells still under 10% of frame have median bbox aspect 2.73
    # against 1.33 for the rest, 73% of them elongated against 16%, and aspect
    # correlates -0.50 with share. Those are the ribbons -- tree lines, bunds,
    # road verges, tank margins -- and the corrections log already flags that
    # family as chronically misread as fallow. Capped at MAX_ASPECT so a 10:1
    # cell yields a readable frame rather than a letterbox sliver.
    MAX_ASPECT = 3.0
    bw = (bounds[2] - bounds[0]) * (1 + 2 * margin)
    bh = (bounds[3] - bounds[1]) * (1 + 2 * margin)
    win_w = max(bw * M_PER_DEG, min_window_m)
    win_h = max(bh * M_PER_DEG, min_window_m)
    if win_w / win_h > MAX_ASPECT:
        win_h = win_w / MAX_ASPECT
    elif win_h / win_w > MAX_ASPECT:
        win_w = win_h / MAX_ASPECT
    window_m = max(win_w, win_h)  # reported: the frame's long side

    # Centre on the patch, not on the exemplar point: for an elongated component
    # the recorded centre can sit near one end, and cropping around it would clip
    # the far half of the very thing being judged.
    clon = (bounds[0] + bounds[2]) / 2.0
    clat = (bounds[1] + bounds[3]) / 2.0
    hw = (win_w / M_PER_DEG) / 2.0
    hh = (win_h / M_PER_DEG) / 2.0
    box = (clon - hw, clat - hh, clon + hw, clat + hh)

    win = from_bounds(*box, transform=esri.transform)
    nat_h, nat_w = max(1, int(round(win.height))), max(1, int(round(win.width)))
    # Upscale a small window, downscale a large one -- either way the reader gets
    # a consistent output size instead of a 60 px thumbnail for a small cell.
    # The long side gets out_px; the short side keeps the window's proportions.
    if win_w >= win_h:
        out_w, out_h = out_px, max(1, int(round(out_px * win_h / win_w)))
    else:
        out_h, out_w = out_px, max(1, int(round(out_px * win_w / win_h)))
    rgb = esri.read([1, 2, 3], window=win, out_shape=(3, out_h, out_w),
                    resampling=Resampling.lanczos if nat_h < out_h else Resampling.bilinear,
                    boundless=True, fill_value=0)
    rgb = np.transpose(rgb, (1, 2, 0)).astype(np.uint8)

    swin = from_bounds(*box, transform=seg.transform)
    clusters = seg.read(1, window=swin, out_shape=(out_h, out_w),
                        resampling=Resampling.nearest, boundless=True, fill_value=-1)
    patch = clusters == cluster_id
    share = float(patch.mean())

    # Boundary width tracks the output size; `iterations=2` was tuned for a 339 px
    # frame and becomes a hairline once the window is upscaled.
    iters = max(2, out_px // 256)
    edge = ndimage.binary_dilation(patch, iterations=iters) & ~patch

    out = rgb.copy()
    out[edge] = [255, 0, 255]
    img = Image.fromarray(out)

    # State the upscale factor. A 40 m window blown up to 768 px is ~6x beyond
    # native and looks softer than it is informative; a reader that cannot see
    # that is one misread away from the failure this whole script addresses --
    # a view implying detail it does not carry.
    zoom = out_w / max(1, nat_w)
    zoom_txt = f" | x{zoom:.1f} upscale" if zoom > 1.2 else ""
    draw = ImageDraw.Draw(img)
    draw.text((4, 4), f"cluster {cluster_id} | PATCH {window_m:.0f}m | "
                      f"cell = {share:.0%} of frame{zoom_txt}", fill=(255, 255, 255))
    bar = int(out_w * 0.18)
    metres = win_w * 0.18
    y = out_h - 14
    draw.rectangle([8, y, 8 + bar, y + 3], fill=(255, 255, 255))
    draw.text((8, y - 12), f"{metres:.0f} m", fill=(255, 255, 255))
    return img, window_m, share


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("run_dir", type=Path)
    ap.add_argument("--seg", type=Path, required=True)
    ap.add_argument("--base", type=Path, required=True)
    ap.add_argument("--results", default="results.jsonl")
    ap.add_argument("--clusters", default="", help="comma-separated ids; default all")
    ap.add_argument("--out-px", type=int, default=768)
    ap.add_argument("--min-window-m", type=float, default=40.0)
    ap.add_argument("--margin", type=float, default=0.35,
                    help="padding around the patch bbox, as a fraction of its larger side")
    ap.add_argument("--search-window-m", type=float, default=200.0,
                    help="window searched for the patch; the judged crop's window")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()

    crops = a.run_dir / "crops"
    crops.mkdir(exist_ok=True)
    rows = [json.loads(l) for l in (a.run_dir / a.results).open()]
    want = {int(x) for x in a.clusters.split(",") if x.strip()}
    if want:
        rows = [r for r in rows if r["cluster"] in want]

    shares, misses, written = [], [], 0
    with rasterio.open(a.base) as esri, rasterio.open(a.seg) as seg:
        for r in rows:
            cid, ex = int(r["cluster"]), int(r["exemplar"])
            out = crops / f"c{cid:03d}_e{ex}_patch.jpg"
            if out.exists() and not a.force:
                continue
            bounds = component_bounds(seg, r["center"], cid, a.search_window_m)
            if bounds is None:
                misses.append(f"c{cid}e{ex}")
                continue
            img, window_m, share = render(esri, seg, r["center"], cid, bounds,
                                          a.out_px, a.min_window_m, a.margin)
            img.save(out, quality=92)
            shares.append(share)
            written += 1

    print(f"wrote {written} patch crops to {crops}")
    if shares:
        s = np.array(shares)
        print(f"cell share of frame: median {np.median(s):.1%}  "
              f"p10 {np.percentile(s, 10):.1%}  p90 {np.percentile(s, 90):.1%}")
        print(f"under 10% of frame: {(s < 0.10).mean():.0%} "
              f"(the fixed 200 m crop's figure is 65%)")
    if misses:
        # Reported, never silent: a missing patch crop would send the reader back
        # to the 200 m frame for exactly the cells this script exists to serve.
        print(f"NO PATCH FOUND for {len(misses)}: {', '.join(misses[:12])}"
              + (" ..." if len(misses) > 12 else ""))


if __name__ == "__main__":
    main()
