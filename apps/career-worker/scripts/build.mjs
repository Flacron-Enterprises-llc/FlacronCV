import { build } from 'esbuild';

/**
 * Bundles `src/main.ts` into `dist/main.js`. Workspace packages
 * (`@flacroncv/*`) export TypeScript source and are bundled. Every other
 * package stays a runtime `require` and must be a dependency of this app.
 */
await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  plugins: [
    {
      name: 'external-non-workspace',
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (args) => {
          if (args.path.startsWith('@flacroncv/') || /^[A-Za-z]:[\\/]/.test(args.path)) return undefined;
          return { path: args.path, external: true };
        });
      },
    },
  ],
});
