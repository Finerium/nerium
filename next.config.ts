import type { NextConfig } from 'next';

//
// NERIUM Next.js 15 configuration.
//
// The phaser3spectorjs alias is load-bearing: Phaser 3 ships an internal import
// of phaser3spectorjs (a WebGL debugger) that Next.js resolves during server-side
// compilation. The module does not exist in npm as a runtime dependency (it is a
// dev-only helper) so the alias neutralizes the reference for both bundlers.
//
// - Turbopack (Next 15 default for dev/build): alias resolves to lib/empty.ts, an
//   intentionally empty module that satisfies the resolver without pulling
//   Phaser's GPU debugger into the bundle.
// - Webpack (fallback path, also used by some Next.js build targets): alias
//   value `false` tells webpack to skip the module entirely.
//
// Reference: docs/phase_rv/RV_MANAGED_AGENTS_RESEARCH_v2.md Section 5.1 and
// https://github.com/phaserjs/phaser/discussions/6659
//
const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      phaser3spectorjs: { browser: './lib/empty.ts' },
    },
  },
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      phaser3spectorjs: false,
    };
    return config;
  },
};

export default nextConfig;
