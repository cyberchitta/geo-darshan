from osgeo import gdal
import os
import glob
import mercantile
import rasterio
from rasterio.transform import from_bounds
from rasterio.crs import CRS
import warnings

gdal.UseExceptions()
warnings.filterwarnings("ignore", category=rasterio.errors.NotGeoreferencedWarning)

TILE_DIR = "data/esri_tiles"
OUTPUT_COG = "data/esri_test_roi_cog.tif"


def georeference_tile_with_rasterio(tile_path, x, y, zoom):
    tile = mercantile.Tile(x, y, zoom)
    bounds = mercantile.bounds(tile)  # Returns LngLatBbox(west, south, east, north)
    georef_path = tile_path.replace(".png", "_geo.tif")
    with rasterio.open(tile_path) as src:
        transform = from_bounds(
            bounds.west, bounds.south, bounds.east, bounds.north, src.width, src.height
        )
        profile = src.profile.copy()
        profile.update(
            {"driver": "GTiff", "crs": CRS.from_epsg(4326), "transform": transform}
        )
        with rasterio.open(georef_path, "w", **profile) as dst:
            for i in range(1, src.count + 1):
                dst.write(src.read(i), i)
    return georef_path


def create_cog_from_tiles():
    tiles = glob.glob(f"{TILE_DIR}/tile_*.png")
    if not tiles:
        print(f"No tiles found in {TILE_DIR}")
        return False
    print(f"Found {len(tiles)} tiles")
    georef_tiles = []
    for tile_path in tiles:
        basename = os.path.basename(tile_path)
        parts = basename.replace(".png", "").split("_")
        if len(parts) != 4:
            continue
        zoom = int(parts[1])
        x = int(parts[2])
        y = int(parts[3])
        print(f"Georeferencing tile {x}/{y}/{zoom}...")
        try:
            georef_path = georeference_tile_with_rasterio(tile_path, x, y, zoom)
            georef_tiles.append(georef_path)
        except Exception as e:
            print(f"Failed to georeference {tile_path}: {e}")
    if not georef_tiles:
        print("No tiles could be georeferenced")
        return False
    vrt_file = "data/esri_test_roi.vrt"
    try:
        print("Creating VRT...")
        gdal.BuildVRT(vrt_file, georef_tiles)
        print("Creating COG...")
        gdal.Translate(
            OUTPUT_COG, vrt_file, format="COG", creationOptions=["COMPRESS=DEFLATE"]
        )
        print(f"Created COG: {OUTPUT_COG}")
        return True
    finally:
        if os.path.exists(vrt_file):
            os.remove(vrt_file)
        for georef_tile in georef_tiles:
            if os.path.exists(georef_tile):
                os.remove(georef_tile)


if __name__ == "__main__":
    create_cog_from_tiles()
