/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['img.clerk.com'],
  },
};

module.exports = {
  eslint: {
    // Skip ESLint during builds (keeps local linting)
    ignoreDuringBuilds: true,
  },
};
