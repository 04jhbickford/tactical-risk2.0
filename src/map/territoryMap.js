// Territory hit testing: determines which territory a world-coordinate point is inside.
// Uses bounding-box pre-filter + ray-casting point-in-polygon.

export class TerritoryMap {
  constructor(territories) {
    this.territories = territories;
    // Pre-compute bounding boxes
    this.bounds = [];
    for (const t of territories) {
      const b = this._computeBounds(t);
      this.bounds.push({ territory: t, ...b });
    }
    // Sort so land territories are checked first (higher priority for clicks)
    this.bounds.sort((a, b) => {
      if (a.territory.isWater !== b.territory.isWater) return a.territory.isWater ? 1 : -1;
      return 0;
    });
    // Cache last hit for mousemove perf
    this._lastHit = null;
  }

  /** Returns the territory at (worldX, worldY), or null. */
  hitTest(worldX, worldY) {
    // Quick re-check last hit — but skip for water territories so that
    // land (islands) overlapping the same area are always tested first.
    if (this._lastHit && !this._lastHit.isWater &&
        this._pointInTerritory(worldX, worldY, this._lastHit)) {
      return this._lastHit;
    }
    for (const entry of this.bounds) {
      // Bbox pre-filter
      if (worldX < entry.minX || worldX > entry.maxX ||
          worldY < entry.minY || worldY > entry.maxY) continue;
      if (this._pointInTerritory(worldX, worldY, entry.territory)) {
        this._lastHit = entry.territory;
        return entry.territory;
      }
    }
    this._lastHit = null;
    return null;
  }

  _pointInTerritory(px, py, territory) {
    for (const poly of territory.polygons) {
      if (this._pointInPolygon(px, py, poly)) return true;
    }
    return false;
  }

  /** Ray-casting algorithm for point-in-polygon */
  _pointInPolygon(px, py, points) {
    let inside = false;
    const n = points.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = points[i][0], yi = points[i][1];
      const xj = points[j][0], yj = points[j][1];
      if (((yi > py) !== (yj > py)) &&
          (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  _computeBounds(territory) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const poly of territory.polygons) {
      for (const [x, y] of poly) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    return { minX, minY, maxX, maxY };
  }
}
