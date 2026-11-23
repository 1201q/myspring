import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCsv,
  monthKeys,
  areaNamesMatch,
  sourceRows,
} from "./population-source.mjs";

test("CSV keeps thousands separators, escaped quotes, CRLF and quoted newlines", () => {
  assert.deepEqual(parseCsv('"지역","인구"\r\n"가""나\n동","1,234"\r\n'), [
    ["지역", "인구"],
    ['가"나\n동', "1,234"],
  ]);
  assert.throws(() => parseCsv('"unclosed'));
});
test("month range includes endpoints across a year and rejects malformed ranges", () => {
  assert.deepEqual(monthKeys("2025-12", "2026-02"), [
    "2025-12",
    "2026-01",
    "2026-02",
  ]);
  assert.throws(() => monthKeys("2026-13", "2026-14"));
  assert.throws(() => monthKeys("2026-02", "2026-01"));
});
test("matching normalizes observed typography while preserving different area names", () => {
  for (const [boundary, source] of [
    ["홍제1동", "홍제제1동"],
    ["면목3·8동", "면목제3.8동"],
    ["두류1,2동", "두류1.2동"],
    ["경기도 수원시장안구 정자1동", "경기도 수원시 장안구 정자1동"],
    ["세종특별자치시 세종시 한솔동", "세종특별자치시 한솔동"],
  ])
    assert.ok(areaNamesMatch(source, boundary));
  assert.ok(!areaNamesMatch("고덕동", "고덕1동"));
  assert.ok(!areaNamesMatch("홍제1동", "홍제2동"));
});
test("household source preserves 10-digit codes and refuses blanks or duplicate codes", () => {
  const header = ["행정구역", "2026년10월_총인구수", "2026년10월_세대수"];
  const row = ["서울특별시 종로구 청운효자동(1111051500)", "10,589", "4,824"];
  assert.equal(
    sourceRows([header, row], "2026-10", "households").get("1111051500")
      .households,
    4824,
  );
  assert.throws(() => sourceRows([header, row, row], "2026-10", "households"));
  assert.throws(() =>
    sourceRows([header, [row[0], "", "1"]], "2026-10", "households"),
  );
  assert.throws(() => sourceRows([header, row], "2026-09", "households"));
});
