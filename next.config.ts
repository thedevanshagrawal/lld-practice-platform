import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * `mongodb` and `@google/generative-ai` are Node-only server libraries. Leaving them
   * external stops the bundler trying to trace their optional native dependencies
   * (kerberos, snappy, aws4) and failing the build over packages nobody installed.
   */
  serverExternalPackages: ['mongodb', '@google/generative-ai'],
};

export default nextConfig;
