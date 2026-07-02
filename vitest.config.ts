import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules/**", ".cursor/**"],
    // Pin a non-Bangkok tz so timezone-sensitive formatters are actually
    // exercised (a Bangkok-local machine would hide tz bugs otherwise).
    env: { TZ: "UTC" },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
