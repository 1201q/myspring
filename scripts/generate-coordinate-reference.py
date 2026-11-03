"""Independent offline fixture generation; needs pyproj==3.7.2, not used by the app."""

import json
from pathlib import Path

import pyproj
from pyproj import Transformer

root = Path(__file__).resolve().parents[1]
rows = json.loads((root / "docs/data-samples/guro-restaurants.sample.json").read_text(encoding="utf-8"))
transform = Transformer.from_crs(5174, 4326, always_xy=True, allow_ballpark=False)
points = []
for row in rows:
    if not row["X"] or not row["Y"]:
        continue
    longitude, latitude = transform.transform(float(row["X"]), float(row["Y"]), errcheck=True)
    points.append(dict(id=row["MGTNO"], x=row["X"], y=row["Y"], longitude=longitude, latitude=latitude))
longitude, latitude = transform.transform(200000, 500000, errcheck=True)
points.append(dict(id="projection-origin-synthetic", x="200000", y="500000",
                   longitude=longitude, latitude=latitude))
fixture = dict(engine="pyproj", engineVersion=pyproj.__version__, projVersion=pyproj.proj_version_str,
               operation=transform.description, axisOrder="source=easting,northing; target=longitude,latitude",
               points=points)
output = root / "docs/data-samples/coordinate-reference.json"
output.write_text(json.dumps(fixture, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Generated {len(points)} independent PROJ reference points")
