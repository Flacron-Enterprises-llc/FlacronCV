/**
 * ESLint configuration for the Expo app.
 *
 * `eslint-config-expo` was already a devDependency and the package has always
 * had a `lint` script, but no config file existed — so `eslint .` aborted with
 * "couldn't find a configuration file". Because the root `pnpm lint` fans out
 * to every workspace through turbo, that single missing file failed the whole
 * repo's lint task, which is the FIRST step of CI. Nothing after it — build,
 * Docker, and now the test suite — ever ran.
 *
 * Uses the legacy `.eslintrc` format to match eslint 8.57 and the sibling
 * configs in apps/api (.eslintrc.js) and apps/web (.eslintrc.json).
 */
module.exports = {
  root: true,
  extends: ['expo'],
  ignorePatterns: ['/dist/*', '/.expo/*', '/node_modules/*'],
};
