#!/usr/bin/env python3
"""ESRI World Imagery tile pipeline: download an AOI's XYZ tiles, stitch to a COG.

Replaces `download_esri.js` + `stitch_esri.js`. Both halves now live here for one
reason above all: **the Web Mercator tile arithmetic is defined once**. Split
across languages it was written twice — `sphericalmercator` on the JS download
side, hand-rolled on the Python stitch side — and two implementations of one
coordinate system drift silently. A drift here does not raise; it lands the
imagery on the wrong ground, and every label cut from it becomes a false claim
about a piece of land. `lonlat_to_tile`, `tile_resolution` and
`tile_origin_3857` below are the single source of that truth.

Why Python: the project already declares its data pipeline as Python + uv
(`CLAUDE.md`), and rasterio bundles libgdal, so nothing here needs the GDAL
command-line tools. The JS stitcher shelled out to `gdal_translate` + `gdalwarp`
**once per tile** — 17,856 subprocesses for a z19 pull of this AOI — and could
not run at all without a separate GDAL install.

Usage:
    UV="uv run --no-project --with rasterio,numpy,pillow,pyyaml python"
    $UV scripts/esri_tiles.py download            # AOI + zoom from config.yaml
    $UV scripts/esri_tiles.py stitch

Both read the same config chain as the JS did: root `config.yaml` -> `aoi.current`
-> `aoi-paths` -> the AOI's own `config.yaml` (`sources.esri.zoom`, and either
`bounds` or `shapefile_path`).
"""
import argparse
import math
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


TILE_URL = ("https://services.arcgisonline.com/arcgis/rest/services/"
            "World_Imagery/MapServer/tile/{z}/{y}/{x}")
TS = 256
WEB_MERC_HALF = 20037508.342789244
ROOT = Path(__file__).resolve().parent.parent

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.config import load_config as _load_config  # noqa: E402


# --- the tile grid: defined once, used by both download and stitch -----------

def lonlat_to_tile(lon: float, lat: float, z: int) -> tuple[int, int]:
    """(lon, lat) degrees -> XYZ tile indices at zoom z. y counts down from north."""
    n = 2 ** z
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n)
    return max(0, min(n - 1, x)), max(0, min(n - 1, y))


def tile_resolution(z: int) -> float:
    """Metres per pixel in EPSG:3857 at zoom z."""
    return 2 * WEB_MERC_HALF / (2 ** z) / TS


def tile_origin_3857(x: int, y: int, z: int) -> tuple[float, float]:
    """North-west corner of tile (x, y, z) in EPSG:3857 metres."""
    res = tile_resolution(z)
    return x * TS * res - WEB_MERC_HALF, WEB_MERC_HALF - y * TS * res


def tiles_for_bbox(west, south, east, north, z) -> list[tuple[int, int]]:
    x0, y0 = lonlat_to_tile(west, north, z)      # north edge -> smaller y
    x1, y1 = lonlat_to_tile(east, south, z)
    return [(x, y) for x in range(min(x0, x1), max(x0, x1) + 1)
            for y in range(min(y0, y1), max(y0, y1) + 1)]


# --- config ------------------------------------------------------------------

def load_config(aoi_name: str | None = None):
    """AOI comes from --aoi, else `aoi.current`; shared chain in `lib/config.py`.

    The JS entry points took a positional arg (`... download_esri.js 5k`) and
    **never read it** -- every invocation used `aoi.current` regardless, so
    `download-tiles:5k` would quietly fetch whichever AOI the config pointed at.
    """
    try:
        cfg = _load_config(ROOT, aoi_name)
    except KeyError as e:
        raise SystemExit(str(e).strip('"'))
    return cfg["aoi_name"], Path(cfg["aoi_path"]).resolve(), cfg["aoi_config"]


def aoi_bounds(aoi_path: Path, aoi_cfg: dict) -> tuple[float, float, float, float]:
    """(west, south, east, north) in degrees."""
    if aoi_cfg.get("shapefile_path"):
        import fiona  # only needed on the shapefile branch
        with fiona.open(aoi_path / aoi_cfg["shapefile_path"]) as src:
            w, s, e, n = src.bounds          # fiona gives (minx, miny, maxx, maxy)
        return w, s, e, n
        # NB: download_esri.js reordered turf's bbox to [S, W, N, E] and then fed
        # it to a (west, south, east, north) signature -- the shapefile branch
        # there requested a transposed box. Config `bounds` was unaffected.
    if aoi_cfg.get("bounds"):
        w, s, e, n = aoi_cfg["bounds"]
        return w, s, e, n
    raise SystemExit("AOI config has neither 'bounds' nor 'shapefile_path'")


def esri_zoom(aoi_cfg: dict) -> int:
    try:
        return aoi_cfg["sources"]["esri"]["zoom"]
    except (KeyError, TypeError):
        raise SystemExit("AOI config has no sources.esri.zoom")


# --- download ----------------------------------------------------------------

def fetch_one(x, y, z, out_dir: Path, retries=3):
    dest = out_dir / f"tile_{z}_{x}_{y}.jpg"
    # Skip what is already on disk. The JS refetched every tile on a re-run,
    # which made topping up a partial pull cost a full one.
    if dest.exists() and dest.stat().st_size > 0:
        return "skipped"
    url = TILE_URL.format(z=z, x=x, y=y)
    for attempt in range(1, retries + 2):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                data = r.read()
            if not data:
                raise OSError("empty body")
            dest.write_bytes(data)
            return "ok"
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and attempt <= retries:
                time.sleep(1.0 * 2 ** (attempt - 1))
                continue
            return f"http {e.code}"
        except Exception as e:  # noqa: BLE001 - report, do not abort the pull
            if attempt <= retries:
                time.sleep(1.0 * 2 ** (attempt - 1))
                continue
            return str(e)[:60]
    return "gave up"


def cmd_download(args):
    name, aoi_path, aoi_cfg = load_config(args.aoi)
    z = args.zoom or esri_zoom(aoi_cfg)
    w, s, e, n = aoi_bounds(aoi_path, aoi_cfg)
    out_dir = aoi_path / "inputs/esri"
    out_dir.mkdir(parents=True, exist_ok=True)
    tiles = tiles_for_bbox(w, s, e, n, z)
    print(f"AOI '{name}' z{z}: {len(tiles)} tiles -> {out_dir}")

    done = {"ok": 0, "skipped": 0}
    failed = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(fetch_one, x, y, z, out_dir): (x, y) for x, y in tiles}
        for f, (x, y) in futures.items():
            r = f.result()
            if r in done:
                done[r] += 1
            else:
                failed.append((x, y, r))
            total = done["ok"] + done["skipped"] + len(failed)
            if total % 1000 == 0:
                print(f"  {total}/{len(tiles)}")
    print(f"downloaded {done['ok']}, already present {done['skipped']}, failed {len(failed)}")
    for x, y, r in failed[:10]:
        print(f"  FAILED {x}/{y}/{z}: {r}")
    if failed:
        sys.exit(1)


# --- stitch ------------------------------------------------------------------

def cmd_stitch(args):
    import numpy as np
    import rasterio
    from PIL import Image
    from rasterio.crs import CRS
    from rasterio.transform import Affine
    from rasterio.warp import Resampling, calculate_default_transform, reproject
    from rasterio.windows import Window

    name, aoi_path, aoi_cfg = load_config(args.aoi)
    z = args.zoom or esri_zoom(aoi_cfg)
    tile_dir = aoi_path / "inputs/esri"
    # Zoom-stamped by default. The JS wrote a single `stitched-esri.tif` whatever
    # the zoom, so restitching at a new zoom silently replaced the old mosaic --
    # and crops already cut from it could no longer be reproduced.
    out = Path(args.out) if args.out else aoi_path / f"intermediates/esri_{name}_z{z}_cog.tif"
    out.parent.mkdir(parents=True, exist_ok=True)

    tiles = {}
    for ext in ("png", "jpg"):
        for p in tile_dir.glob(f"tile_{z}_*.{ext}"):
            _, _, x, y = p.stem.split("_")
            tiles[(int(x), int(y))] = p
    if not tiles:
        raise SystemExit(f"no z{z} tiles in {tile_dir} - run `download` first")

    xs = sorted({x for x, _ in tiles})
    ys = sorted({y for _, y in tiles})
    minx, miny = xs[0], ys[0]
    ncols, nrows = (xs[-1] - minx + 1) * TS, (ys[-1] - miny + 1) * TS
    res = tile_resolution(z)
    west, north = tile_origin_3857(minx, miny, z)
    print(f"{len(tiles)} tiles -> {ncols} x {nrows} px @ {res:.4f} m/px")

    merc = out.with_suffix(".merc.tif")
    bad = 0
    with rasterio.open(merc, "w", driver="GTiff", height=nrows, width=ncols,
                       count=3, dtype="uint8", crs=CRS.from_epsg(3857),
                       transform=Affine(res, 0, west, 0, -res, north), tiled=True,
                       blockxsize=512, blockysize=512, compress="DEFLATE",
                       BIGTIFF="YES") as dst:
        for i, ((tx, ty), path) in enumerate(sorted(tiles.items()), 1):
            arr = np.array(Image.open(path).convert("RGB"))
            if arr.shape[:2] != (TS, TS):
                bad += 1
                continue
            dst.write(np.transpose(arr, (2, 0, 1)),
                      window=Window((tx - minx) * TS, (ty - miny) * TS, TS, TS))
            if i % 2000 == 0:
                print(f"  placed {i}/{len(tiles)}")
    if bad:
        print(f"  {bad} tiles skipped (unexpected size)")

    target = CRS.from_epsg(args.epsg)
    with rasterio.open(merc) as src:
        dt, dw, dh = calculate_default_transform(src.crs, target, src.width,
                                                 src.height, *src.bounds)
        print(f"reprojecting -> EPSG:{args.epsg}  {dw} x {dh}")
        with rasterio.open(out, "w", driver="COG", height=dh, width=dw, count=3,
                           dtype="uint8", crs=target, transform=dt,
                           compress="DEFLATE", BIGTIFF="YES") as dst:
            for b in range(1, 4):
                reproject(source=rasterio.band(src, b),
                          destination=rasterio.band(dst, b),
                          src_transform=src.transform, src_crs=src.crs,
                          dst_transform=dt, dst_crs=target,
                          resampling=Resampling.bilinear)
                print(f"  band {b} done")
    merc.unlink()
    print(f"wrote {out}  ({out.stat().st_size / 1e9:.2f} GB)")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("download", help="fetch the AOI's ESRI tiles at the configured zoom")
    d.add_argument("--aoi", help="AOI key from config.yaml aoi-paths; default aoi.current")
    d.add_argument("--zoom", type=int, help="override sources.esri.zoom")
    d.add_argument("--workers", type=int, default=10)
    d.set_defaults(func=cmd_download)

    s = sub.add_parser("stitch", help="mosaic the downloaded tiles into a COG")
    s.add_argument("--aoi", help="AOI key from config.yaml aoi-paths; default aoi.current")
    s.add_argument("--zoom", type=int, help="override sources.esri.zoom")
    s.add_argument("--epsg", type=int, default=4326,
                   help="target CRS; 4326 matches what the crop generators window in")
    s.add_argument("--out", help="override the zoom-stamped default path")
    s.set_defaults(func=cmd_stitch)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
