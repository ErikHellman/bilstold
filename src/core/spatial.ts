/** Uniform grid for proximity queries; rebuilt every tick. */
export class SpatialHash<T extends { x: number; y: number }> {
  private cells: T[][];
  private used: number[] = [];
  private n: number;

  constructor(private cellSize: number, worldSize: number) {
    this.n = Math.ceil(worldSize / cellSize);
    this.cells = Array.from({ length: this.n * this.n }, () => []);
  }

  private cellOf(v: number) {
    const c = Math.floor(v / this.cellSize);
    return c < 0 ? 0 : c >= this.n ? this.n - 1 : c;
  }

  clear(): void {
    for (const i of this.used) this.cells[i].length = 0;
    this.used.length = 0;
  }

  insert(o: T): void {
    const i = this.cellOf(o.y) * this.n + this.cellOf(o.x);
    const cell = this.cells[i];
    if (cell.length === 0) this.used.push(i);
    cell.push(o);
  }

  /** Clears `out`, then fills it with candidates from the cells overlapping the circle. */
  query(x: number, y: number, r: number, out: T[]): T[] {
    out.length = 0;
    const x0 = this.cellOf(x - r), x1 = this.cellOf(x + r), y0 = this.cellOf(y - r), y1 = this.cellOf(y + r);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const cell = this.cells[cy * this.n + cx];
        for (let k = 0; k < cell.length; k++) out.push(cell[k]);
      }
    return out;
  }
}
