/** Fixed-capacity object pool; objects are preallocated and reused. */
export class Pool<T extends { active: boolean; id: number }> {
  readonly items: T[] = [];
  private free: T[] = [];
  count = 0;

  constructor(readonly cap: number, make: () => T) {
    for (let i = 0; i < cap; i++) {
      const o = make();
      o.id = i + 1;
      o.active = false;
      this.items.push(o);
    }
    for (let i = cap - 1; i >= 0; i--) this.free.push(this.items[i]);
  }

  spawn(): T | null {
    const o = this.free.pop();
    if (!o) return null;
    o.active = true;
    this.count++;
    return o;
  }

  release(o: T): void {
    if (!o.active) return;
    o.active = false;
    this.count--;
    this.free.push(o);
  }

  each(fn: (o: T) => void): void {
    const it = this.items;
    for (let i = 0; i < it.length; i++) if (it[i].active) fn(it[i]);
  }
}
