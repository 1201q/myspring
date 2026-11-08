# Quiet Light

`quiet-light.json` is a local customization of OpenFreeMap's Positron style:
https://tiles.openfreemap.org/styles/positron

The base style is kept locally so label visibility, language, and colors are
reviewable without modifying a remote service. OpenFreeMap hosts the vector
tiles, fonts, and sprites. Attribution stays visible through the source metadata.

Changes: muted gray buildings and roads, pale parks and water, Korean/local
names preferred over bilingual labels, no minor-road names or road shields.
Major-road labels start at zoom 14 and neighborhood labels at zoom 13.

Provider and customization documentation: https://openfreemap.org/quick_start/
Upstream style repository: https://github.com/hyperknot/openfreemap-styles

Business points, count labels, and the selected-location overlay are styled in
`src/App.tsx`. Count label collisions are suppressed; groups below 10 omit labels.
All aggregate circles remain visible and clickable, so this is not a count filter.
