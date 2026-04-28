/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.logo.dev" },
      { protocol: "https", hostname: "logo.clearbit.com" }
    ]
  }
}
module.exports = nextConfig
