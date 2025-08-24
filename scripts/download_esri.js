import { mkdir, writeFile } from "fs/promises";
import SphericalMercator from "sphericalmercator";

const ROI = [79.808, 12.0045, 79.8125, 12.009]; // [minLng, minLat, maxLng, maxLat]
const ZOOM = 16; // ~1m resolution
const OUTPUT_DIR = "./data/esri_tiles";
const ESRI_URL =
  "https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 500;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;

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

const tiles = getTilesForBbox(ROI[0], ROI[1], ROI[2], ROI[3], ZOOM);
console.log(`Fetching ${tiles.length} tiles for zoom ${ZOOM}...`);

async function fetchTileWithRetry(tile, attempt = 1) {
  const url = ESRI_URL.replace("{z}", tile.z)
    .replace("{y}", tile.y)
    .replace("{x}", tile.x);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 429 || response.status === 503) {
        if (attempt <= MAX_RETRIES) {
          const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          console.warn(
            `Rate limit or server error for tile ${tile.x}/${tile.y}/${tile.z}. Retrying (${attempt}/${MAX_RETRIES}) after ${delay}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          return fetchTileWithRetry(tile, attempt + 1);
        }
        throw new Error(
          `Failed tile ${tile.x}/${tile.y}/${tile.z} after ${MAX_RETRIES} retries: ${response.status}`
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
    if (attempt <= MAX_RETRIES) {
      const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(`Retrying (${attempt}/${MAX_RETRIES}) after ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchTileWithRetry(tile, attempt + 1);
    }
    console.error(
      `Gave up on tile ${tile.x}/${tile.y}/${tile.z} after ${MAX_RETRIES} retries.`
    );
  }
}

async function fetchTilesInBatches(tiles) {
  for (let i = 0; i < tiles.length; i += BATCH_SIZE) {
    const batch = tiles.slice(i, i + BATCH_SIZE);
    console.log(
      `Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(
        tiles.length / BATCH_SIZE
      )}...`
    );
    await Promise.all(batch.map((tile) => fetchTileWithRetry(tile)));
    if (i + BATCH_SIZE < tiles.length) {
      console.log(`Waiting ${BATCH_DELAY_MS}ms before next batch...`);
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }
}

(async () => {
  await ensureOutputDir();
  await fetchTilesInBatches(tiles);
  console.log(
    "Tile download complete. Run `python scripts/stitch_esri.py` to create COG."
  );
})();
