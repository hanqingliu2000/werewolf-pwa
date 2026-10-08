import type { NextConfig } from "next";

const config: NextConfig = { poweredByHeader: false, outputFileTracingExcludes: {
  "/*": ["./.data/**/*", "./test-results/**/*", "**/.local-archive/**/*", "**/.local-generation/**/*"],
} };
export default config;
