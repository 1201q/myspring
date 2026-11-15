import assert from "node:assert/strict";

// Source typography differs, but administrative codes must still match exactly.
export function canonicalAreaName(value) {
  return value
    .replace(/^세종특별자치시\s+세종시\s+/, "세종특별자치시 ")
    .replace(/[·ㆍ.,]/g, "")
    .replace(/\s+/g, "");
}

export function areaNamesMatch(source, boundary) {
  const a = canonicalAreaName(source),
    b = canonicalAreaName(boundary);
  return a === b || a.replace(/제(?=\d+동$)/, "") === b;
}

export function monthKeys(from, to) {
  const index = (value) => {
    assert.match(value, /^\d{4}-(0[1-9]|1[0-2])$/);
    const [year, month] = value.split("-").map(Number);
    return year * 12 + month - 1;
  };
  const start = index(from),
    end = index(to);
  assert.ok(start <= end && end - start < 120, "Invalid month range");
  return Array.from(
    { length: end - start + 1 },
    (_, i) =>
      `${Math.floor((start + i) / 12)}-${String(((start + i) % 12) + 1).padStart(2, "0")}`,
  );
}

export function parseCsv(text) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === "," || c === "\n")) {
      row.push(cell.replace(/\r$/, ""));
      cell = "";
      if (c === "\n") {
        if (row.some(Boolean)) rows.push(row);
        row = [];
      }
    } else cell += c;
  }
  assert.ok(!quoted, "Unclosed CSV quote");
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

export function sourceRows(table, month, kind) {
  const [header, ...rows] = table;
  const [year, mm] = month.split("-");
  const prefix = `${year}년${mm}월_`;
  const column = (name) => {
    const i = header.indexOf(prefix + name);
    assert.ok(i >= 0, `Missing column: ${prefix + name}`);
    return i;
  };
  const totalColumn = column(kind === "age" ? "계_총인구수" : "총인구수");
  const fields =
    kind === "age"
      ? Array.from({ length: 11 }, (_, i) =>
          column(i === 10 ? "계_100세 이상" : `계_${i * 10}~${i * 10 + 9}세`),
        )
      : [column("세대수")];
  const number = (raw) => {
    assert.ok(raw?.trim(), "Blank numeric value");
    const value = Number(raw.replaceAll(",", "").trim());
    assert.ok(
      Number.isSafeInteger(value) && value >= 0,
      `Invalid count: ${raw}`,
    );
    return value;
  };
  const result = new Map();
  for (const row of rows) {
    assert.equal(row.length, header.length, "CSV column count mismatch");
    const match = row[0].match(/^(.*?)\((\d{10})\)$/);
    assert.ok(match, `Invalid administrative area: ${row[0]}`);
    const [, rawName, code] = match;
    assert.ok(!result.has(code), `Duplicate code: ${code}`);
    const total = number(row[totalColumn]);
    const values = fields.map((i) => number(row[i]));
    if (kind === "age")
      assert.equal(
        values.reduce((a, b) => a + b, 0),
        total,
        `Age sum mismatch: ${code}`,
      );
    result.set(code, {
      name: rawName.trim().replace(/\s+/g, " "),
      total,
      ...(kind === "age" ? { ages: values } : { households: values[0] }),
    });
  }
  assert.ok(result.size > 0, "Empty source");
  return result;
}
