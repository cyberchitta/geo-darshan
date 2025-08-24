import { execSync } from "child_process";
import { readdirSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import SphericalMercator from "sphericalmercator";

const args = process.argv.slice(2);
const roiName = args[0] || "test";

const TILE_DIR = `./data/esri_tiles_${roiName}`;
const OUTPUT_COG = `./data/esri_${roiName}_roi_cog.tif`;

const merc = new SphericalMercator({ size: 256 });

function getTileInfo(filename) {
  const parts = filename.replace(".png", "").split("_");
  if (parts.length !== 4) return null;
  return {
    zoom: parseInt(parts[1]),
    x: parseInt(parts[2]),
    y: parseInt(parts[3]),
    path: join(TILE_DIR, filename),
  };
}

function getTileBounds(x, y, zoom) {
  const bounds = merc.bbox(x, y, zoom);
  return {
    west: bounds[0],
    south: bounds[1],
    east: bounds[2],
    north: bounds[3],
  };
}

function georeferenceTile(tile) {
  const bounds = getTileBounds(tile.x, tile.y, tile.zoom);
  const tempPath = tile.path.replace(".png", "_temp.tif");
  const georefPath = tile.path.replace(".png", "_geo.tif");
  console.log(`Georeferencing tile ${tile.x}/${tile.y}/${tile.zoom}...`);
  try {
    const cmd1 = `gdal_translate -of GTiff -gcp 0 0 ${bounds.west} ${bounds.north} -gcp 256 0 ${bounds.east} ${bounds.north} -gcp 0 256 ${bounds.west} ${bounds.south} -gcp 256 256 ${bounds.east} ${bounds.south} -a_srs EPSG:4326 "${tile.path}" "${tempPath}"`;
    execSync(cmd1, { stdio: "pipe" });
    const cmd2 = `gdalwarp -of GTiff -t_srs EPSG:4326 "${tempPath}" "${georefPath}"`;
    execSync(cmd2, { stdio: "pipe" });
    return georefPath;
  } finally {
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    } catch (e) {
      console.warn(`Could not delete temp file ${tempPath}: ${e.message}`);
    }
  }
}

function stitchTiles() {
  if (!existsSync(TILE_DIR)) {
    console.error(
      `Tile directory ${TILE_DIR} not found. Run download script for '${roiName}' first.`
    );
    process.exit(1);
  }
  const files = readdirSync(TILE_DIR).filter((f) => f.endsWith(".png"));
  console.log(`Found ${files.length} tiles for ROI '${roiName}'`);
  const tiles = files.map(getTileInfo).filter(Boolean);
  const georefTiles = [];
  for (const tile of tiles) {
    try {
      const georefPath = georeferenceTile(tile);
      georefTiles.push(georefPath);
    } catch (error) {
      console.error(`Failed to georeference ${tile.path}: ${error.message}`);
    }
  }
  if (georefTiles.length === 0) {
    console.error("No tiles could be georeferenced");
    process.exit(1);
  }

  const vrtFile = `./data/esri_${roiName}_roi.vrt`;
  try {
    console.log("Creating VRT and COG...");
    execSync(
      `gdalbuildvrt "${vrtFile}" ${georefTiles.map((p) => `"${p}"`).join(" ")}`
    );
    execSync(
      `gdal_translate -of COG -co COMPRESS=DEFLATE "${vrtFile}" "${OUTPUT_COG}"`
    );
    console.log(`Created COG: ${OUTPUT_COG}`);
  } finally {
    console.log("Cleaning up intermediate files...");
    try {
      if (existsSync(vrtFile)) {
        unlinkSync(vrtFile);
      }
    } catch (e) {
      console.warn(`Could not delete VRT ${vrtFile}: ${e.message}`);
    }
    for (const georefTile of georefTiles) {
      try {
        if (existsSync(georefTile)) {
          unlinkSync(georefTile);
        }
      } catch (e) {
        console.warn(`Could not delete ${georefTile}: ${e.message}`);
      }
    }
    console.log("Cleanup complete");
  }
}

console.log(`Stitching tiles for ROI: ${roiName}`);
stitchTiles();
