/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ["geoip-lite"],
  async rewrites() {
    return {
      beforeFiles: [
        // IP addresses end in digits (e.g. 1.2.3.4) which Next.js misidentifies
        // as file extensions and skips the dynamic route. Force-route them.
        {
          source: "/threats/:ip(\\d+\\.\\d+\\.\\d+\\.\\d+)",
          destination: "/threats/:ip",
        },
        {
          source: "/web-attacks/:ip(\\d+\\.\\d+\\.\\d+\\.\\d+)",
          destination: "/web-attacks/:ip",
        },
      ],
    }
  },
}

export default nextConfig
