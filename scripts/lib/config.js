import { readFileSync } from "fs";
import { join, resolve } from "path";
import yaml from "js-yaml";

/**
 * Load global and AOI-specific configs.
 * @param {string} projectRoot - Path to project root
 * @returns {{aoiName: string, aoiPath: string, aoiConfig: object, globalConfig: object}}
 */
export function loadConfig(projectRoot) {
  const globalConfigPath = join(projectRoot, "config.yaml");
  const globalConfig = yaml.load(readFileSync(globalConfigPath, "utf8"));
  const aoiName = globalConfig.aoi.current;
  const aoiPath = resolve(projectRoot, globalConfig["aoi-paths"][aoiName]);
  const aoiConfigPath = join(aoiPath, "config.yaml");
  const aoiConfig = yaml.load(readFileSync(aoiConfigPath, "utf8"));
  return {
    aoiName,
    aoiPath,
    aoiConfig,
    globalConfig,
  };
}

/**
 * Get source configuration by name.
 * @param {object} aoiConfig - AOI config object
 * @param {string} sourceName - Name of source (e.g., 'aef', 'esri')
 * @returns {object} Source configuration
 */
export function getSourceConfig(aoiConfig, sourceName) {
  const source = aoiConfig.sources?.[sourceName];
  if (!source) {
    throw new Error(`Source '${sourceName}' not found in AOI config`);
  }
  return source;
}

/**
 * Get current segmentation configuration.
 * @param {object} aoiConfig - AOI config object
 * @returns {{name: string, config: object}} Segmentation name and config
 */
export function getCurrentSegmentation(aoiConfig) {
  const segName = aoiConfig.segmentation?.current;
  if (!segName) {
    throw new Error("No current segmentation specified in AOI config");
  }
  const segConfig = aoiConfig.segmentation.configs?.[segName];
  if (!segConfig) {
    throw new Error(`Segmentation '${segName}' not found in AOI config`);
  }
  return { name: segName, config: segConfig };
}

/**
 * Resolve path relative to AOI root.
 * @param {string} aoiPath - AOI root path
 * @param {string} relativePath - Path relative to AOI root
 * @returns {string} Absolute path
 */
export function resolveAoiPath(aoiPath, relativePath) {
  return resolve(aoiPath, relativePath);
}
