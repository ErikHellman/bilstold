import { configDefaults, defineConfig } from 'vitest/config';
import { vakaVite } from '@hellsoft/vaka-bundler-plugin';

// Source maps go to Vaka only when VAKA_TOKEN is set (the Pages workflow passes the repo secret).
// Without it no maps are generated, so nothing extra is deployed and local builds just work.
const upload = !!process.env.VAKA_TOKEN;
const release = process.env.VAKA_RELEASE || `bilstold@${process.env.npm_package_version ?? 'dev'}`;

export default defineConfig({
  base: './',
  build: { target: 'es2022', assetsInlineLimit: 0, sourcemap: upload ? 'hidden' : false },
  define: { __VAKA_RELEASE__: JSON.stringify(release) },
  plugins: upload
    ? [vakaVite({ url: 'https://vaka.fly.dev', project: 'bilst-ld', release, urlPrefix: '/bilstold/', deleteAfterUpload: true, defineRelease: false })]
    : [],
  test: { globals: true, environment: 'node', exclude: [...configDefaults.exclude, '.claude/**', 'e2e/**'] },
});
