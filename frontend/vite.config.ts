import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// The backend command bridge is owned by jojojen/aka_no_claw and runs locally
// (default http://127.0.0.1:8781). The dev server only proxies /api to it — it
// must never reimplement command routing (see docs/LOCAL_MOBILE_CONSOLE_MVP.md).
const BRIDGE_TARGET = process.env.OPENCLAW_BRIDGE_URL || "http://127.0.0.1:8781";
const HTTPS_KEY_PATH = process.env.OPENCLAW_HTTPS_KEY || resolve(process.cwd(), ".cert/key.pem");
const HTTPS_CERT_PATH = process.env.OPENCLAW_HTTPS_CERT || resolve(process.cwd(), ".cert/cert.pem");
// Auto-discover the gitignored mkcert files so the normal LAN command can use
// microphone-safe HTTPS without a second npm script.
const HTTPS_CONFIG = existsSync(HTTPS_KEY_PATH) && existsSync(HTTPS_CERT_PATH)
  ? {
      key: readFileSync(HTTPS_KEY_PATH),
      cert: readFileSync(HTTPS_CERT_PATH),
    }
  : undefined;

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
  server: {
    host: process.env.LAN === "1" ? "0.0.0.0" : "127.0.0.1",
    // A trusted HTTPS origin is required for microphone-only getUserMedia on
    // phones. When .cert/key.pem + cert.pem exist, LAN dev automatically uses
    // TLS; explicit env paths support certificates managed elsewhere.
    https: HTTPS_CONFIG,
    // Local-only single-user tool: phones reach it via mesh/LAN hostnames
    // (e.g. jen-mac-mini.nord). Client IPs are already restricted to
    // loopback / mesh CGNAT / private LAN by the bridge + dev-server guard,
    // so accept any Host header here rather than maintain a hostname list.
    allowedHosts: true,
    port: 5173,
    proxy: {
      "/api": {
        target: BRIDGE_TARGET,
        changeOrigin: true,
      },
    },
  },
});
