import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev-only Next.js badge sits bottom-left, exactly where the meeting toolbar's
  // Mute button is, so it's turned off.
  devIndicators: false,
};

export default nextConfig;
