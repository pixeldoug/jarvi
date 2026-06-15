import createMDX from '@next/mdx';

const withMDX = createMDX({});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx'],
  // Required so PostHog's reverse-proxy paths (with/without trailing slash) work.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    // Same-origin reverse proxy for PostHog ingestion, to dodge ad/privacy
    // blockers that block us.i.posthog.com. Mirrors the web app's vercel.json.
    return [
      {
        source: '/ingest/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://us.i.posthog.com/:path*',
      },
    ];
  },
};

export default withMDX(nextConfig);
