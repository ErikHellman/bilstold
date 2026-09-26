/** Per-tile "have we been near this" grid, used to fog unexplored parts of the map screen. */
export class FogOfWar {
  private readonly revealed: Uint8Array;
  /** Bumped whenever reveal() actually uncovers a new tile, so renderers can cache cheaply. */
  version = 0;

  constructor(readonly size: number) {
    this.revealed = new Uint8Array(size * size);
  }

  isRevealed(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.size || ty >= this.size) return false;
    return this.revealed[ty * this.size + tx] === 1;
  }

  /** Marks every tile within `radius` of (cx, cy) as revealed. */
  reveal(cx: number, cy: number, radius: number): void {
    const { size, revealed } = this;
    const r2 = radius * radius;
    const x0 = Math.max(0, Math.ceil(cx - radius)), x1 = Math.min(size - 1, Math.floor(cx + radius));
    const y0 = Math.max(0, Math.ceil(cy - radius)), y1 = Math.min(size - 1, Math.floor(cy + radius));
    let changed = false;
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        if (dx * dx + dy * dy > r2) continue;
        const i = y * size + x;
        if (!revealed[i]) { revealed[i] = 1; changed = true; }
      }
    }
    if (changed) this.version++;
  }
}
