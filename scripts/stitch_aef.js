import { execSync } from "child_process";
import { existsSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import { loadConfig, getSourceConfig, resolveAoiPath } from "./lib/config.js";

async function main() {
  const projectRoot = join(import.meta.dirname, "..");
  const config = loadConfig(projectRoot);
  const aefConfig = getSourceConfig(config.aoiConfig, "aef");
  const AEF_DIR = resolveAoiPath(config.aoiPath, "inputs/aef");
  const ZIP_FILE = join(AEF_DIR, "aef_tiles.zip");
  const OUTPUT_FILE = resolveAoiPath(
    config.aoiPath,
    aefConfig.input_file || "intermediates/aef_stitched.tif"
  );
  console.log(`=== AEF Stitching - ${config.aoiName} ===`);
  if (!existsSync(ZIP_FILE)) {
    throw new Error(`ZIP file not found: ${ZIP_FILE}`);
  }
  console.log("Cleaning up existing tiles...");
  if (existsSync(AEF_DIR)) {
    const existingTiffs = readdirSync(AEF_DIR).filter((f) =>
      f.toLowerCase().match(/\.tiff?$/)
    );
    existingTiffs.forEach((file) => {
      unlinkSync(join(AEF_DIR, file));
    });
  }
  console.log("Extracting tiles from zip...");
  execSync(`unzip -o "${ZIP_FILE}" -d "${AEF_DIR}/" -x "__MACOSX/*"`, {
    stdio: "inherit",
    cwd: projectRoot,
  });
  const extractedTiffs = readdirSync(AEF_DIR).filter(
    (f) => f.toLowerCase().match(/\.tiff?$/) && f.includes("aef_")
  );
  if (extractedTiffs.length === 0) {
    throw new Error("No AEF tiles found after extraction");
  }
  console.log(`Found ${extractedTiffs.length} tiles to stitch`);
  console.log("Stitching tiles...");
  const tilePaths = extractedTiffs.map((f) => join(AEF_DIR, f));
  const mergeCmd = [
    "gdalwarp",
    "-co",
    "COMPRESS=ZSTD",
    "-co",
    "ZSTD_LEVEL=9",
    "-co",
    "INTERLEAVE=PIXEL",
    ...tilePaths.map((p) => `"${p}"`),
    `"${OUTPUT_FILE}"`,
  ].join(" ");
  const startTime = Date.now();
  execSync(mergeCmd, {
    stdio: "inherit",
    cwd: projectRoot,
  });
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  if (existsSync(OUTPUT_FILE)) {
    const stats = await Bun.file(OUTPUT_FILE).size;
    const sizeMB = (stats / 1024 / 1024).toFixed(1);
    console.log(`\n✅ Stitching complete!`);
    console.log(`Output: ${OUTPUT_FILE}`);
    console.log(`Size: ${sizeMB}MB (${duration}s)`);
  } else {
    throw new Error("Failed to create output file");
  }
  console.log("\nCleaning up extracted tiles...");
  extractedTiffs.forEach((file) => {
    unlinkSync(join(AEF_DIR, file));
  });
  console.log("Done!");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main();
  } catch (error) {
    console.error("Stitching failed:", error.message);
    process.exit(1);
  }
}

export { main as stitchAef };
