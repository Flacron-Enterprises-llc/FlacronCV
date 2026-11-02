/**
 * Workspace packages (`@flacroncv/*`) export TypeScript source, so they are
 * bundled into `dist/main.js`. Every other package stays a runtime
 * `require` and must be a dependency of this app (pnpm does not hoist).
 */
module.exports = (options) => ({
  ...options,
  externals: [
    ({ request }, callback) => {
      if (isBareSpecifier(request) && !request.startsWith('@flacroncv/')) {
        return callback(null, `commonjs ${request}`);
      }
      return callback();
    },
  ],
});

function isBareSpecifier(request) {
  return typeof request === 'string' && !request.startsWith('.') && !/^([a-zA-Z]:)?[\\/]/.test(request);
}
