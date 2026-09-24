import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (d: string): string[] => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

test.each(['src/sim', 'src/world', 'src/game'])('%s stays headless and deterministic', dir => {
  for (const f of walk(dir)) {
    const s = readFileSync(f, 'utf8');
    expect(s, f).not.toMatch(/from ['"](\.\.\/)+(render|audio|ui|save)\//);
    expect(s, f).not.toMatch(/\b(document|window|localStorage|requestAnimationFrame)\b/);
    expect(s, f).not.toMatch(/Math\.random/);
  }
});
