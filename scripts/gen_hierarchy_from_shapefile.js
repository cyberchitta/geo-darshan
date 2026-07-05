#!/usr/bin/env node

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import shp from "shpjs";

async function loadShapefile(shapefilePath) {
  const buffer = readFileSync(shapefilePath);
  return await shp(buffer);
}

function analyzeShapefileFields(geojson) {
  if (!geojson.features || geojson.features.length === 0) {
    console.log("No features found in shapefile");
    return;
  }

  const sampleFeature = geojson.features[0];
  const fields = Object.keys(sampleFeature.properties || {});

  console.log("\n📋 Available fields in shapefile:");
  console.log("=".repeat(50));

  fields.forEach((field) => {
    const allValues = geojson.features
      .map((f) => f.properties[field])
      .filter((v) => v != null);

    const uniqueValues = new Set(allValues);
    const sampleValues = Array.from(uniqueValues).slice(0, 5);

    console.log(`\n${field}:`);
    console.log(`  Sample values: ${sampleValues.join(", ")}`);
    console.log(`  Total unique: ${uniqueValues.size}`);
    console.log(`  Total features: ${allValues.length}`);
  });

  console.log("\n" + "=".repeat(50));
}

function toKebabCase(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildTwoLevelHierarchy(geojson, parentField, childField) {
  const hierarchy = {};

  geojson.features.forEach((feature) => {
    const parentLabel = feature.properties?.[parentField];
    const childLabel = feature.properties?.[childField];

    if (parentLabel != null && childLabel != null) {
      const parentOriginal = parentLabel.toString().trim();
      const childOriginal = childLabel.toString().trim();
      const parentKey = toKebabCase(parentOriginal);
      const childKey = toKebabCase(childOriginal);

      if (!hierarchy[parentKey]) {
        hierarchy[parentKey] = {
          _name: parentOriginal,
        };
      }

      if (!hierarchy[parentKey][childKey]) {
        hierarchy[parentKey][childKey] = {
          _name: childOriginal,
        };
      }
    }
  });

  return hierarchy;
}

function buildFlatHierarchy(geojson, fieldName) {
  const hierarchy = {};
  const valuesMap = new Map(); // Map kebab-case key to original label

  geojson.features.forEach((feature) => {
    const value = feature.properties?.[fieldName];
    if (value != null) {
      const original = value.toString().trim();
      const key = toKebabCase(original);
      valuesMap.set(key, original);
    }
  });

  Array.from(valuesMap.entries())
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .forEach(([key, original]) => {
      hierarchy[key] = {
        _name: original,
      };
    });

  return hierarchy;
}

function generateFilename(field1, field2) {
  if (field2) {
    return `${toKebabCase(field1)}-${toKebabCase(field2)}.json`;
  } else {
    return `${toKebabCase(field1)}.json`;
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("\n💡 Usage:");
    console.log(
      "  Analyze fields:       node gen_hierarchy_from_shapefile.js <shapefile.zip>"
    );
    console.log(
      "  Flat hierarchy:       node gen_hierarchy_from_shapefile.js <shapefile.zip> <field_name>"
    );
    console.log(
      "  2-level hierarchy:    node gen_hierarchy_from_shapefile.js <shapefile.zip> <parent_field> <child_field>"
    );
    console.log("\nExample:");
    console.log("  node gen_hierarchy_from_shapefile.js inputs/labels.zip");
    console.log(
      "  node gen_hierarchy_from_shapefile.js inputs/labels.zip ECO_NAME"
    );
    console.log(
      "  node gen_hierarchy_from_shapefile.js inputs/labels.zip BIOME_NAME ECO_NAME"
    );
    process.exit(0);
  }

  const shapefilePath = resolve(args[0]);
  const field1 = args[1];
  const field2 = args[2];

  try {
    console.log(`📂 Loading shapefile: ${shapefilePath}`);
    const geojson = await loadShapefile(shapefilePath);
    console.log(`✅ Loaded ${geojson.features.length} features`);

    if (!field1) {
      analyzeShapefileFields(geojson);
      console.log("\n💡 To generate hierarchy, run with field name(s):");
      console.log(
        `   Flat:     node gen_hierarchy_from_shapefile.js ${args[0]} <field_name>`
      );
      console.log(
        `   2-level:  node gen_hierarchy_from_shapefile.js ${args[0]} <parent_field> <child_field>`
      );
      return;
    }

    const sampleFeature = geojson.features[0];
    const availableFields = Object.keys(sampleFeature.properties || {});

    if (!availableFields.includes(field1)) {
      console.error(`\n❌ Field '${field1}' not found in shapefile`);
      console.log("\nAvailable fields:", availableFields.join(", "));
      process.exit(1);
    }

    let hierarchy;
    let outputPath;

    if (field2) {
      if (!availableFields.includes(field2)) {
        console.error(`\n❌ Field '${field2}' not found in shapefile`);
        console.log("\nAvailable fields:", availableFields.join(", "));
        process.exit(1);
      }

      console.log(`\n🏗️  Building 2-level hierarchy: ${field1} → ${field2}`);
      hierarchy = buildTwoLevelHierarchy(geojson, field1, field2);

      const parentCount = Object.keys(hierarchy).length;
      const childCount = Object.values(hierarchy).reduce(
        (sum, children) =>
          sum + Object.keys(children).filter((k) => k !== "_name").length,
        0
      );

      console.log(
        `📊 Generated ${parentCount} parent categories with ${childCount} child categories`
      );
      outputPath = resolve(generateFilename(field1, field2));
    } else {
      console.log(`\n🏗️  Building flat hierarchy from '${field1}'`);
      hierarchy = buildFlatHierarchy(geojson, field1);

      console.log(`📊 Generated ${Object.keys(hierarchy).length} categories`);
      outputPath = resolve(generateFilename(field1, null));
    }

    writeFileSync(outputPath, JSON.stringify(hierarchy, null, 2));
    console.log(`\n✅ Hierarchy saved to: ${outputPath}`);

    console.log("\n🌳 Generated hierarchy structure (sample):");
    const hierarchyStr = JSON.stringify(hierarchy, null, 2);
    if (hierarchyStr.length > 2000) {
      console.log(hierarchyStr.substring(0, 2000) + "\n... (truncated)");
    } else {
      console.log(hierarchyStr);
    }
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    if (error.code === "ENOENT") {
      console.error(`File not found: ${shapefilePath}`);
    }
    process.exit(1);
  }
}

main();
