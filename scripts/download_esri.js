import { mkdir, writeFile } from "fs/promises";
import { access } from "fs/promises";
import * as path from "node:path";
import shapefile from "shapefile";
import bbox from "@turf/bbox";
import SphericalMercator from "sphericalmercator";
import { loadConfig, getSourceConfig, resolveAoiPath } from "./lib/config.js";

async function main() {
  const projectRoot = path.join(import.meta.dirname, "..");
  const config = loadConfig(projectRoot);
  const aoiConfig = config.aoiConfig;
  const esriConfig = getSourceConfig(aoiConfig, "esri");
  let bounds;
  if (aoiConfig.shapefile_path) {
    const shpPath = resolveAoiPath(config.aoiPath, aoiConfig.shapefile_path);
    if (
      !(await access(shpPath)
        .then(() => true)
        .catch(() => false))
    ) {
      throw new Error(`Shapefile not found: ${shpPath}`);
    }
    const source = await shapefile.open(shpPath);
    const features = [];
    let result = await source.read();
    while (!result.done) {
      features.push(result.value);
      result = await source.read();
    }
    const featureCollection = { type: "FeatureCollection", features };
    const computedBbox = bbox(featureCollection);
    bounds = [
      computedBbox[1],
      computedBbox[0],
      computedBbox[3],
      computedBbox[2],
    ];
    console.log(`Computed bounds from shapefile: [${bounds.join(", ")}]`);
  } else if (aoiConfig.bounds) {
    bounds = aoiConfig.bounds;
  } else {
    throw new Error("No bounds or shapefile_path in AOI config");
  }
  const zoom = esriConfig.zoom;
  const OUTPUT_DIR = resolveAoiPath(config.aoiPath, "inputs/esri");
  const CONFIG = {
    zoom,
    batchSize: 10,
    batchDelayMs: 500,
    maxRetries: 3,
    baseRetryDelayMs: 1000,
  };
  const ROI = bounds;
  await ensureOutputDir(OUTPUT_DIR);
  const tiles = getTilesForBbox(ROI[0], ROI[1], ROI[2], ROI[3], CONFIG.zoom);
  console.log(
    `Fetching ${tiles.length} tiles for AOI '${config.aoiName}' at zoom ${CONFIG.zoom}...`
  );
  await fetchTilesInBatches(tiles, OUTPUT_DIR, CONFIG);
  console.log(
    `Tile download complete for '${config.aoiName}'. Run 'bun run stitch-tiles' to create COG.`
  );
}

function getTilesForBbox(west, south, east, north, zoom) {
  const merc = new SphericalMercator({ size: 256 });
  const tiles = [];
  const minTile = merc.xyz([west, south, east, north], zoom);
  for (let x = minTile.minX; x <= minTile.maxX; x++) {
    for (let y = minTile.minY; y <= minTile.maxY; y++) {
      tiles.push({ x, y, z: zoom });
    }
  }
  return tiles;
}

async function ensureOutputDir(outputDir) {
  try {
    await mkdir(outputDir, { recursive: true });
  } catch (error) {
    console.error(`Failed to create directory ${outputDir}: ${error.message}`);
    process.exit(1);
  }
}

async function fetchTileWithRetry(tile, outputDir, config, attempt = 1) {
  const ESRI_URL =
    "https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
  const url = ESRI_URL.replace("{z}", tile.z)
    .replace("{y}", tile.y)
    .replace("{x}", tile.x);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 429 || response.status === 503) {
        if (attempt <= config.maxRetries) {
          const delay = config.baseRetryDelayMs * Math.pow(2, attempt - 1);
          console.warn(
            `Rate limit or server error for tile ${tile.x}/${tile.y}/${tile.z}. Retrying (${attempt}/${config.maxRetries}) after ${delay}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          return fetchTileWithRetry(tile, outputDir, config, attempt + 1);
        }
        throw new Error(
          `Failed tile ${tile.x}/${tile.y}/${tile.z} after ${config.maxRetries} retries: ${response.status}`
        );
      }
      throw new Error(
        `HTTP ${response.status} for tile ${tile.x}/${tile.y}/${tile.z}`
      );
    }
    const buffer = await response.arrayBuffer();
    const filePath = `${outputDir}/tile_${tile.z}_${tile.x}_${tile.y}.jpg`;
    await writeFile(filePath, new Uint8Array(buffer));
    console.log(`Downloaded tile ${tile.x}/${tile.y}/${tile.z}`);
  } catch (error) {
    console.error(
      `Error fetching tile ${tile.x}/${tile.y}/${tile.z}: ${error.message}`
    );
    if (attempt <= config.maxRetries) {
      const delay = config.baseRetryDelayMs * Math.pow(2, attempt - 1);
      console.warn(
        `Retrying (${attempt}/${config.maxRetries}) after ${delay}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchTileWithRetry(tile, outputDir, config, attempt + 1);
    }
    console.error(
      `Gave up on tile ${tile.x}/${tile.y}/${tile.z} after ${config.maxRetries} retries.`
    );
  }
}

async function fetchTilesInBatches(tiles, outputDir, config) {
  for (let i = 0; i < tiles.length; i += config.batchSize) {
    const batch = tiles.slice(i, i + config.batchSize);
    console.log(
      `Processing batch ${Math.floor(i / config.batchSize) + 1} of ${Math.ceil(tiles.length / config.batchSize)}...`
    );
    await Promise.all(
      batch.map((tile) => fetchTileWithRetry(tile, outputDir, config))
    );
    if (i + config.batchSize < tiles.length) {
      console.log(`Waiting ${config.batchDelayMs}ms before next batch...`);
      await new Promise((resolve) => setTimeout(resolve, config.batchDelayMs));
    }
  }
}

main().catch(console.error);
