/* Grid helpers (pure: the grid comes in, so they can be tested alone). */

/** The cells a token w×h cells big covers with its top-left at pixel (x, y). */
export function cellsAt(x, y, w, h, grid) {
  const s = grid.size;
  const base = grid.getOffset({ x: x + s / 2, y: y + s / 2 });
  const out = [];
  for (let di = 0; di < Math.max(1, Math.round(h)); di++) {
    for (let dj = 0; dj < Math.max(1, Math.round(w)); dj++) out.push({ i: base.i + di, j: base.j + dj });
  }
  return out;
}

/** The cells a token passes over going through these top-left points, in order (no repeats). */
export function cellsAlong(points, w, h, grid) {
  const s = grid.size;
  const seen = new Set();
  const out = [];
  const add = (x, y) => {
    for (const c of cellsAt(x, y, w, h, grid)) {
      const k = `${c.i},${c.j}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(c);
    }
  };
  for (let n = 0; n < points.length - 1; n++) {
    const a = points[n], b = points[n + 1];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(dist / (s / 4)));
    for (let k = 0; k <= steps; k++) add(a.x + ((b.x - a.x) * k) / steps, a.y + ((b.y - a.y) * k) / steps);
  }
  if (points.length === 1) add(points[0].x, points[0].y);
  return out;
}

/** The first trap on the path (cells under the start don't count: you don't step on where you stand). */
export function firstTrapOnPath(points, w, h, grid, traps) {
  if (points.length < 2) return null;
  const start = new Set(cellsAt(points[0].x, points[0].y, w, h, grid).map(c => `${c.i},${c.j}`));
  const at = new Map(traps.map(tp => [`${tp.i},${tp.j}`, tp]));
  for (const c of cellsAlong(points, w, h, grid)) {
    const k = `${c.i},${c.j}`;
    if (start.has(k)) continue;
    const tp = at.get(k);
    if (tp) return tp;
  }
  return null;
}
