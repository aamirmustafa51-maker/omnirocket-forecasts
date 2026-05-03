/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.logo.dev" },
      { protocol: "https", hostname: "logo.clearbit.com" }
    ]
  },
  // Bundle the meta-ads-kb markdown files into the serverless function
  // (lib/kb.ts reads them with fs.readFileSync at runtime).
  experimental: {
    outputFileTracingIncludes: {
      '/api/webhook': ['./meta-ads-kb/**/*.md'],
    },
  },
}
module.exports = nextConfig
