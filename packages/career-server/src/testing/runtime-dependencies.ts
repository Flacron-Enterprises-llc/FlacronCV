import { readdirSync, readFileSync, statSync } from 'fs';
import { builtinModules } from 'module';
import { join } from 'path';

/**
 * The packages an app's bundle loads at run time. Workspace packages
 * (`@flacroncv/*`) are bundled from source; every other import stays a
 * `require` that must resolve from the app's own dependencies (pnpm does not
 * hoist). Scans non-test source under `dirs`, except `skip` (files outside the
 * bundle, such as the separate migration entry). `require(...)` inside a
 * function is lazy and reported separately.
 */
export function runtimePackages(dirs: string[], skip: string[] = []): { eager: Set<string>; lazy: Set<string> } {
  const eager = new Set<string>();
  const lazy = new Set<string>();
  const builtins = new Set(builtinModules);
  const name = (spec: string) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!);
  const keep = (spec: string) => !spec.startsWith('.') && !spec.startsWith('@flacroncv/') && !spec.startsWith('node:') && !builtins.has(name(spec));
  const slash = (file: string) => file.replace(/\\/g, '/');
  const skipped = new Set(skip.map(slash));
  for (const file of dirs.flatMap(sourceFiles).filter((f) => !skipped.has(slash(f)))) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?'([^']+)'/gm)) {
      if (keep(match[1]!)) eager.add(name(match[1]!));
    }
    for (const match of text.matchAll(/\brequire\('([^']+)'\)/g)) {
      if (!keep(match[1]!)) continue;
      // A require at the top level of a module is eager; inside a function body it runs on first use.
      const line = text.slice(text.lastIndexOf('\n', match.index) + 1, match.index);
      (/^\s*(const|let|var)\s/.test(line) && !/=>|\?\?=/.test(line) ? eager : lazy).add(name(match[1]!));
    }
  }
  for (const pkg of eager) lazy.delete(pkg);
  return { eager, lazy };
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== 'testing' && entry !== 'node_modules') out.push(...sourceFiles(path));
    } else if (/\.ts$/.test(entry) && !/\.(spec|test|e2e-spec)\.ts$/.test(entry) && !/\.d\.ts$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}
