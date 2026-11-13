import createNextIntlPlugin from 'next-intl/plugin';
import path from 'path';
import { fileURLToPath } from 'url';
import { legacyRedirects } from './legacy-redirects.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Local verification only: NEXT_DIST_DIR builds beside a running dev server
  // without touching its `.next`. Unset (every hosted build) keeps `.next`.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  output: 'standalone',
  // On Next 14 this key lives under `experimental` — at the top level it is
  // rejected ("Unrecognized key(s) in object: 'outputFileTracingRoot'") and
  // silently ignored, so standalone file tracing defaulted to apps/web instead
  // of the monorepo root. That is exactly the setting that decides whether the
  // hoisted node_modules and the @flacroncv/shared-types workspace package get
  // traced into .next/standalone, so the deployed server could be missing files
  // that exist at build time. (It moves back to the top level in Next 15.)
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../..'),
  },
  // The career packages export TypeScript source (former V2 workspace packages).
  transpilePackages: ['jspdf', 'html2canvas', 'docx', 'file-saver', '@flacroncv/career-api-client', '@flacroncv/career-shared'],
  images: {
    domains: ['firebasestorage.googleapis.com', 'lh3.googleusercontent.com'],
  },
  // Old V2 portfolio links (`/p/:slug`) → `/:locale/portfolio/:slug`, keeping `?token=`.
  async redirects() {
    return legacyRedirects;
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'unsafe-none',
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
