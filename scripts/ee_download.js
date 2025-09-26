// --- Define your parameters ---
// The Asset ID of your uploaded shapefile.
var aoiAssetId = "projects/personal-461711/assets/Tamilnadu";

// The year for which you want to download the embeddings.
var targetYear = "2024";

// The name of the output GeoTIFF file in your Google Drive.
var exportFilename = "aef_TamilNadu_24";

// --- Load the Area of Interest (AOI) from your asset ---
var aoi = ee.FeatureCollection(aoiAssetId);

// --- Load the AlphaEarth dataset ---
var alphaearthCollection = ee.ImageCollection(
  "GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL"
);

// --- Filter the AlphaEarth collection by year ---
var alphaearthImage = alphaearthCollection
  .filterDate(targetYear + "-01-01", targetYear + "-12-31")
  .mosaic()
  .clip(aoi);

// --- Export the GeoTIFF to your Google Drive ---
Export.image.toDrive({
  image: alphaearthImage,
  description: exportFilename,
  folder: "geo_darshan", // The folder in your Google Drive
  fileNamePrefix: exportFilename,
  scale: 1000, // AlphaEarth embeddings are at 10m resolution
  region: aoi.geometry(),
  crs: "EPSG:4326",
  fileFormat: "GeoTIFF",
});

// --- Optional: Add the layers to the map for visualization ---
// Center the map on your AOI.
Map.centerObject(aoi, 10);

// Add the clipped image to the map.
Map.addLayer(alphaearthImage, {}, "Clipped AlphaEarth " + targetYear);

// Add your AOI geometry as a red outline.
var empty = ee.Image().byte();
var outline = empty.paint({
  featureCollection: aoi,
  color: 1,
  width: 3,
});
Map.addLayer(outline, { palette: "#FF0000" }, "AOI Boundary");
