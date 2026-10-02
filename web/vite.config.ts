import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the static build works from any path (e.g. a GitHub Pages project site).
// MapLibre starts its worker as a module worker, so bundle workers as ES modules.
export default defineConfig({ plugins: [react()], base: "./", worker: { format: "es" } });
