import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { populationValue, populationColor, validPopulationDataset } from "./population.ts";
import { MAP_PALETTE } from "../../lib/theme.ts";

const row = { population: 100, households: 60, ages: [5, 10, 20, 25, 10, 10, 8, 5, 4, 2, 1] };
test("age shares, zero population and missing previous months retain their distinct meaning", () => {
  assert.equal(populationValue(row, null, "young"), 45);
  assert.equal(populationValue(row, null, "senior"), 20);
  assert.equal(populationValue(row, null, "change"), null);
  assert.equal(populationValue(row, { ...row, population: 105 }, "change"), -5);
  assert.equal(populationValue(null, row, "population"), null);
  assert.equal(populationValue({ ...row, population: 0 }, null, "young"), null);
  assert.equal(populationValue({ ...row, population: 0 }, null, "population"), 0);
  assert.notDeepEqual(
    populationColor(null, 1, "population", MAP_PALETTE.dark),
    populationColor(0, 1, "population", MAP_PALETTE.dark),
  );
});
test("all published regions match boundaries, dimensions, population totals and source hashes", async () => {
  const source = JSON.parse(
    await readFile(new URL("../../../public/data/population/source.json", import.meta.url)),
  );
  assert.equal(source.assets.length, 16);
  for (const asset of source.assets) {
    const bytes = await readFile(
      new URL(`../../../public/data/population/${asset.filename}`, import.meta.url),
    );
    assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256);
    const dataset = JSON.parse(bytes);
    const boundaries = JSON.parse(
      await readFile(
        new URL(`../../../public/data/dongs/${asset.regionId}-20261001.geojson`, import.meta.url),
      ),
    );
    assert.ok(validPopulationDataset(dataset, asset.regionId, boundaries), asset.regionId);
    assert.deepEqual(dataset.months, source.months);
    source.coverage
      .filter((x) => x.regionId === asset.regionId)
      .forEach((coverage, i) => {
        const count = boundaries.features.filter(
          (f) => dataset.rows[f.properties.code][i] !== null,
        ).length;
        assert.equal(count, coverage.matched);
        assert.equal(count + coverage.missing.length, coverage.total);
      });
  }
});
test("latest month agrees with downloaded official Seoul example", async () => {
  const dataset = JSON.parse(
    await readFile(new URL("../../../public/data/population/seoul.json", import.meta.url)),
  );
  assert.equal(dataset.rows["1111051500"].at(-1).population, 10589);
  assert.equal(dataset.rows["1111051500"].at(-1).households, 4824);
});
