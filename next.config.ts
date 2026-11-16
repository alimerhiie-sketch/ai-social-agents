import type { NextConfig } from "next";

// Local control-room app: every page reads live SQLite state, so Cache Components
// (static prerendering by default) is switched off and the root layout forces dynamic.
const nextConfig: NextConfig = {
  cacheComponents: false,
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
