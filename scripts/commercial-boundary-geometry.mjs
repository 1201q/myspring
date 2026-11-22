// Preserve quoted commas, embedded line breaks and escaped quotes in long coordinate cells.
export function parseCsv(text) {
  const rows = []; let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (c === ',' || c === '\n')) {
      row.push(value.replace(/\r$/, '')); value = '';
      if (c === '\n') { if (row.some(Boolean)) rows.push(row); row = []; }
    } else value += c;
  }
  if (quoted) throw Error('Unclosed CSV quote');
  if (value || row.length) { row.push(value.replace(/\r$/, '')); rows.push(row); }
  return rows;
}


// Coordinates contain multiple closed rings separated by ")|(". Containment,
// rather than separators alone, distinguishes holes from disconnected islands.
function inside(point, ring) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i], [a, b] = ring[j];
    if ((y > point[1]) !== (b > point[1]) && point[0] < (a - x) * (point[1] - y) / (b - y) + x) result = !result;
  }
  return result;
}
function area(ring) {
  return ring.slice(1).reduce((sum, p, i) => sum + ring[i][0] * p[1] - p[0] * ring[i][1], 0) / 2;
}
export function geometryFromCoordinates(text, expected) {
  const rings = text.trim().split(/\)\s*\|\s*\(/).map(part => part.replace(/[()\s]/g, '').split('|').filter(Boolean).map(pair => {
    const p = pair.split(',').map(Number);
    if (p.length !== 2 || !p.every(Number.isFinite) || p[0] < 124 || p[0] > 132 || p[1] < 32 || p[1] > 40) throw Error('Invalid Korea longitude/latitude');
    return p;
  }));
  if (rings.flat().length !== expected) throw Error(`Coordinate count mismatch: ${rings.flat().length} != ${expected}`);
  for (const ring of rings) {
    if (ring.length < 4 || ring[0].some((v, i) => v !== ring.at(-1)[i]) || area(ring) === 0) throw Error('Invalid or unclosed boundary ring');
  }
  const order = rings.map((ring, i) => ({ ring, i, area: Math.abs(area(ring)), parent: -1, depth: 0 })).sort((a, b) => b.area - a.area);
  for (let i = 0; i < order.length; i++) {
    for (let j = i - 1; j >= 0; j--) {
      if (inside(order[i].ring[0], order[j].ring)) { order[i].parent = j; order[i].depth = order[j].depth + 1; break; }
    }
  }
  const polygons = []; const byIndex = new Map();
  order.forEach((entry, i) => {
    const outer = entry.depth % 2 === 0;
    const ring = (area(entry.ring) > 0) === outer ? entry.ring : [...entry.ring].reverse();
    if (outer) { byIndex.set(i, polygons.length); polygons.push([ring]); }
    else polygons[byIndex.get(entry.parent)].push(ring);
  });
  return polygons.length === 1 ? { type: 'Polygon', coordinates: polygons[0] } : { type: 'MultiPolygon', coordinates: polygons };
}

