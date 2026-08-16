#!/usr/bin/env python3
"""Stitch an Earth Engine AEF tile export into the AOI's single embedding raster.

Replaces `stitch_aef.js`. Same inputs (`inputs/aef/aef_tiles.zip`), same output
(the AOI config's `sources.aef.input_file`), same compression (ZSTD level 9,
pixel-interleaved) — but through rasterio's bundled libgdal, so the project no
longer needs the GDAL command-line tools installed anywhere.

Two behaviours deliberately differ from the JS, both about not destroying data:

1. **It does not delete before it succeeds.** `stitch_aef.js` unlinked *every*
   `.tif` in `inputs/aef/` before extracting — and the AOI config points
   `input_file` at `inputs/aef/aef_3.5k_roi.tif`, i.e. into that same directory.
   So a run wiped the embedding raster the whole segmentation is built from and
   only then tried to rebuild it; a failure after that point left nothing. Here
   the mosaic is written to a temporary file and moved into place only once it
   is complete, and pre-existing rasters are never touched.
2. **Extraction is sandboxed.** Tiles unzip into a temporary directory rather
   than into the AOI's input folder, so a partial or interrupted run cannot
   leave stray tiles behind for the next run to mistake for real input.

Usage:
    uv run --no-project --with rasterio,numpy,pyyaml python scripts/aef_tiles.py \
        [--aoi auroville-24-10] [--zip path/to/aef_tiles.zip]
"""
import argparse
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

import rasterio
from rasterio.merge import merge

sys.path.insert(0, str(Path(__file__).resolve().parent))
from esri_tiles import load_config  # noqa: E402  - shared config chain, one definition

CREATION = dict(compress="ZSTD", zstd_level=9, interleave="pixel")


def stitch(tile_paths, out_path: Path):
    """Mosaic same-CRS tiles into one raster, matching `gdalwarp <tiles> out`."""
    srcs = [rasterio.open(p) for p in tile_paths]
    try:
        mosaic, transform = merge(srcs)
        profile = srcs[0].profile.copy()
        profile.update(height=mosaic.shape[1], width=mosaic.shape[2],
                       transform=transform, count=mosaic.shape[0], **CREATION)
        profile.pop("tiled", None)
        # Write beside the destination, then move: a half-written mosaic must
        # never be able to occupy the path the pipeline reads from.
        tmp = out_path.with_suffix(".partial.tif")
        with rasterio.open(tmp, "w", **profile) as dst:
            dst.write(mosaic)
        tmp.replace(out_path)
    finally:
        for s in srcs:
            s.close()
    return out_path


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--aoi", help="AOI key from config.yaml; default aoi.current")
    ap.add_argument("--zip", dest="zip_path", help="override inputs/aef/aef_tiles.zip")
    ap.add_argument("--out", help="override the AOI config's sources.aef.input_file")
    args = ap.parse_args()

    name, aoi_path, aoi_cfg = load_config(args.aoi)
    zip_path = Path(args.zip_path) if args.zip_path else aoi_path / "inputs/aef/aef_tiles.zip"
    if not zip_path.exists():
        raise SystemExit(f"no AEF export at {zip_path}")
    rel_out = args.out or aoi_cfg.get("sources", {}).get("aef", {}).get(
        "input_file", "intermediates/aef_stitched.tif")
    out = Path(rel_out) if Path(rel_out).is_absolute() else aoi_path / rel_out
    out.parent.mkdir(parents=True, exist_ok=True)
    print(f"=== AEF stitch - {name} ===")

    with tempfile.TemporaryDirectory(prefix="aef_") as td:
        with zipfile.ZipFile(zip_path) as z:
            members = [m for m in z.namelist()
                       if m.lower().endswith((".tif", ".tiff"))
                       and "aef_" in Path(m).name
                       and not m.startswith("__MACOSX/")]
            if not members:
                raise SystemExit("no aef_*.tif tiles inside the zip")
            z.extractall(td, members=members)
        tiles = sorted(Path(td).rglob("*.tif")) + sorted(Path(td).rglob("*.tiff"))
        print(f"found {len(tiles)} tiles; stitching -> {out}")
        stitch(tiles, out)

    with rasterio.open(out) as ds:
        print(f"wrote {out}  {ds.width}x{ds.height}, {ds.count} bands, "
              f"{out.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
