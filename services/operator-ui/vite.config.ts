import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 8082,
    proxy: {
      "/api": {
        target: process.env.ANALYZER_URL ?? "http://localhost:8080",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "")
      }
    }
  }
})
