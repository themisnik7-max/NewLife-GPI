import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/**",
        ".next/**",
        "vitest.config.ts",
        "postcss.config.js",
        "tailwind.config.ts",
        "src/__tests__/**",
        "next.config.js",
        "next-env.d.ts",
        // Narrowed from a blanket "src/app/**" (see LOGS.md): that pattern
        // was swallowing Route Handlers along with actual thin pages/layouts,
        // making src/app/api/webhooks/clerk/route.ts's real test suite
        // invisible in coverage despite it having genuine branching logic.
        "src/app/**/page.tsx",
        "src/app/**/layout.tsx",
        "src/middleware.ts",
        "**/*.test.ts",
        "**/*.test.tsx",
        "generated/prisma/**",
        "prisma.config.ts",
        "src/lib/prisma.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@/generated": path.resolve(__dirname, "./generated"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
