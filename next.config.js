/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['img.clerk.com'],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    // Provide empty fallbacks for Node.js core modules that aren't available in the
    // Cloudflare Workers / Edge runtime. This prevents build-time "module not found"
    // errors when libraries like snoowrap try to require them.
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      stream: false,
      querystring: false,
      fs: false,
      path: false,
      os: false,
    };

    return config;
  },

};

module.exports = nextConfig;
