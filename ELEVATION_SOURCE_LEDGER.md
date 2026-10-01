# Elevation / Low-Lying Terrain Context — Source & Method Ledger

Status: APPROVED FOR CONTEXT USE ONLY

## Purpose
Show broad low-lying terrain patterns in Bangkok as supporting context for flood situational awareness.

## Boundary / Mask
- Source: Bangkok Metropolitan Administration (BMA) GIS
- Service: BMA/DISTRICT FeatureServer
- Coverage: union of 50 Bangkok districts
- CRS requested: EPSG:4326
- Role: official Bangkok land/administrative mask

## Elevation Source
- Source: AWS Open Data Terrain Tiles / Mapzen
- Type: bare-earth/global terrain tile service
- Bangkok source lineage includes SRTM-class global terrain data
- Attribution: Mapzen / Terrain Tiles; SRTM data courtesy of U.S. Geological Survey

## Processing
1. Decode Terrarium elevation tiles at z12.
2. Mosaic only tiles covering the official BMA boundary.
3. Apply 5x5 median filter to reduce isolated urban/building artifacts.
4. Apply ~300 m regional low-pass to avoid false parcel/street precision.
5. Mask raster by union of BMA's 50 district polygons.
6. Render only broad low-lying classes:
   - approximately <=1 m
   - approximately 1–2 m
   - approximately 2–4 m
   - >4 m transparent
7. Publish as static RGBA raster overlay; never convert DEM cells to flood polygons.

## Professional Review Gate
Reviewed using:
- OpenAI geospatial-and-cartographic-visualization skill
- GeoMaster geospatial/terrain-analysis skill

Gate outcome:
- Raster representation: PASS
- Official Bangkok boundary mask: PASS
- No sea/out-of-Bangkok artifact: PASS
- Broad class design: PASS
- Source lineage disclosed: PASS
- Survey-grade vertical accuracy: NOT ESTABLISHED

## Limitations
This layer is contextual only. It must not be used as:
- surveyed ground elevation,
- parcel or building elevation,
- sub-meter flood-depth prediction,
- evidence that a location is currently flooded,
- a substitute for BMA/RID/HII survey or LiDAR products.

## Official Higher-Accuracy Sources Investigated
- BMA City Planning Portal contains a public DEM Map Service, but its published item extent is limited and does not cover all Bangkok.
- HII public LiDAR/MMS Terrain dataset is high accuracy but current public directory checked did not provide Bangkok-wide coverage.

If a verified Bangkok-wide BMA/HII survey-grade elevation raster becomes publicly accessible, it should replace this context layer.
