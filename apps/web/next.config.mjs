import createNextIntlPlugin from 'next-intl/plugin';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
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
  transpilePackages: ['jspdf', 'html2canvas', 'docx', 'file-saver'],
  images: {
    domains: ['firebasestorage.googleapis.com', 'lh3.googleusercontent.com'],
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
