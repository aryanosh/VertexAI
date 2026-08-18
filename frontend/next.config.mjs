/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      // msw/browser is client-only — prevent server-side bundling
      config.resolve.alias["msw/browser"] = false;
    }
    return config;
  },
};

export default nextConfig;
