import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    // L'extension Chrome est du JavaScript simple, chargé tel quel par le
    // navigateur : ses tests le sont aussi, sans passe de compilation.
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts", "extension/**/*.test.mjs"],
  },
});
