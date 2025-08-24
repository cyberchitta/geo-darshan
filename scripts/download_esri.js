import { mkdir, writeFile } from "fs/promises";
import SphericalMercator from "sphericalmercator";

const args = process.argv.slice(2);
const roiName = args[0];
const customRoi = args[1] ? JSON.parse(args[1]) : null;

const CONFIG = {
  rois: {
    test: [79.808, 12.0045, 79.8125, 12.009],
    full: [79.676, 11.872, 79.946, 12.142],
  },
  zoom: 18, // ~1m resolution
  batchSize: 10,
  batchDelayMs: 500,
  maxRetries: 3,
  baseRetryDelayMs: 1000,
};

const ROI = customRoi || CONFIG.rois[roiName];
if (!ROI) {
  console.error(
    `Unknown ROI: ${roiName}. Available: ${Object.keys(CONFIG.rois).join(", ")}`
  );
  process.exit(1);
}

const OUTPUT_DIR = `./data/esri_tiles_${roiName}`;
const ESRI_URL =
  "https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const merc = new SphericalMercator({ size: 256 });

function getTilesForBbox(west, south, east, north, zoom) {
  const tiles = [];
  const minTileX = Math.floor(((west + 180) / 360) * Math.pow(2, zoom));
  const maxTileX = Math.floor(((east + 180) / 360) * Math.pow(2, zoom));
  const minTileY = Math.floor(
    ((1 -
      Math.log(
        Math.tan((north * Math.PI) / 180) +
          1 / Math.cos((north * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
      Math.pow(2, zoom)
  );
  const maxTileY = Math.floor(
    ((1 -
      Math.log(
        Math.tan((south * Math.PI) / 180) +
          1 / Math.cos((south * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
      Math.pow(2, zoom)
  );
  for (let x = minTileX; x <= maxTileX; x++) {
    for (let y = minTileY; y <= maxTileY; y++) {
      tiles.push({ x, y, z: zoom });
    }
  }
  return tiles;
}

async function ensureOutputDir() {
  try {
    await mkdir(OUTPUT_DIR, { recursive: true });
  } catch (error) {
    console.error(`Failed to create directory ${OUTPUT_DIR}: ${error.message}`);
    process.exit(1);
  }
}

const tiles = getTilesForBbox(ROI[0], ROI[1], ROI[2], ROI[3], CONFIG.zoom);
console.log(
  `Fetching ${tiles.length} tiles for ROI '${roiName}' at zoom ${CONFIG.zoom}...`
);

async function fetchTileWithRetry(tile, attempt = 1) {
  const url = ESRI_URL.replace("{z}", tile.z)
    .replace("{y}", tile.y)
    .replace("{x}", tile.x);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 429 || response.status === 503) {
        if (attempt <= CONFIG.maxRetries) {
          const delay = CONFIG.baseRetryDelayMs * Math.pow(2, attempt - 1);
          console.warn(
            `Rate limit or server error for tile ${tile.x}/${tile.y}/${tile.z}. Retrying (${attempt}/${CONFIG.maxRetries}) after ${delay}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          return fetchTileWithRetry(tile, attempt + 1);
        }
        throw new Error(
          `Failed tile ${tile.x}/${tile.y}/${tile.z} after ${CONFIG.maxRetries} retries: ${response.status}`
        );
      }
      throw new Error(
        `HTTP ${response.status} for tile ${tile.x}/${tile.y}/${tile.z}`
      );
    }
    const buffer = await response.arrayBuffer();
    const filePath = `${OUTPUT_DIR}/tile_${tile.z}_${tile.x}_${tile.y}.png`;
    await writeFile(filePath, new Uint8Array(buffer));
    console.log(`Downloaded tile ${tile.x}/${tile.y}/${tile.z}`);
  } catch (error) {
    console.error(
      `Error fetching tile ${tile.x}/${tile.y}/${tile.z}: ${error.message}`
    );
    if (attempt <= CONFIG.maxRetries) {
      const delay = CONFIG.baseRetryDelayMs * Math.pow(2, attempt - 1);
      console.warn(
        `Retrying (${attempt}/${CONFIG.maxRetries}) after ${delay}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchTileWithRetry(tile, attempt + 1);
    }
    console.error(
      `Gave up on tile ${tile.x}/${tile.y}/${tile.z} after ${CONFIG.maxRetries} retries.`
    );
  }
}

async function fetchTilesInBatches(tiles) {
  for (let i = 0; i < tiles.length; i += CONFIG.batchSize) {
    const batch = tiles.slice(i, i + CONFIG.batchSize);
    console.log(
      `Processing batch ${Math.floor(i / CONFIG.batchSize) + 1} of ${Math.ceil(
        tiles.length / CONFIG.batchSize
      )}...`
    );
    await Promise.all(batch.map((tile) => fetchTileWithRetry(tile)));
    if (i + CONFIG.batchSize < tiles.length) {
      console.log(`Waiting ${CONFIG.batchDelayMs}ms before next batch...`);
      await new Promise((resolve) => setTimeout(resolve, CONFIG.batchDelayMs));
    }
  }
}

(async () => {
  console.log(`ROI: ${roiName} ${JSON.stringify(ROI)}`);
  await ensureOutputDir();
  await fetchTilesInBatches(tiles);
  console.log(
    `Tile download complete for '${roiName}'. Run 'bun run stitch-tiles${
      roiName !== "test" ? ":" + roiName : ""
    }' to create COG.`
  );
})();
