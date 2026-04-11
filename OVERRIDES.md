# Dependency Overrides

Overrides in `package.json` force minimum versions for transitive dependencies
when parent packages have loose version ranges that allow vulnerable versions.

## Active Overrides

| Package | Floor | Added | Parent Package | Remove When |
|---------|-------|-------|---------------|-------------|
| `esbuild@<=0.24.2` | `>=0.25.0` | 2026-04-10 | `drizzle-kit` > `@esbuild-kit/esm-loader` > `@esbuild-kit/core-utils` > `esbuild` | `drizzle-kit` drops `@esbuild-kit` or pins `esbuild >= 0.25.0` |
| `serialize-javascript@<7.0.5` | `>=7.0.5` | 2026-04-10 | `@ducanh2912/next-pwa` > `workbox-build` > `@rollup/plugin-terser` > `serialize-javascript` | `workbox-build` or `@rollup/plugin-terser` pins `serialize-javascript >= 7.0.5` |

## Review Process

After merging Dependabot PRs, test whether overrides are still needed:

1. Remove an override from `package.json` `pnpm.overrides`
2. Run `pnpm install && pnpm audit --audit-level=high`
3. If audit passes, the override was stale — delete it
4. If audit fails, re-add the override
