import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    // The `server-only` package's `package.json` exposes:
    //   { "exports": { "react-server": "./empty.js", "default": "./index.js" } }
    // The `index.js` entry throws at runtime to enforce that the importer
    // is a Server Component. Next.js's server bundler selects the
    // `react-server` condition and gets the empty stub.
    //
    // Vitest/Vite does NOT honor `customConditions` for `package.json`
    // `exports` in the way Node does, so we alias `server-only` directly
    // to its empty stub. This lets unit tests import server-only-tagged
    // modules (db.ts, personal-experiments.ts, etc.) without crashing,
    // while the build-time boundary remains enforced by Next.js.
    alias: {
      "server-only": path.resolve(__dirname, "node_modules/server-only/empty.js"),
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**/*", "src/i18n/**/*"],
    },
  },
});
