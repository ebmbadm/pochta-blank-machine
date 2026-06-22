// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { createServer, allowedHost } from "./server.mjs";

let server;
async function boot(deps) {
  server = createServer({ rootDir: "/nonexistent", deps });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}
afterEach(() => server && server.close());

const fakeDeps = {
  listPrinters: async () => [{ name: "LABEL__9X00", isDefault: true }],
  runLp: async () => ({ jobId: "LABEL__9X00-1" }),
};

describe("print-server", () => {
  it("GET /api/health → ok", async () => {
    const base = await boot(fakeDeps);
    const r = await fetch(`${base}/api/health`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });

  it("GET /api/printers → список", async () => {
    const base = await boot(fakeDeps);
    const r = await fetch(`${base}/api/printers`);
    expect(await r.json()).toEqual([{ name: "LABEL__9X00", isDefault: true }]);
  });

  it("POST /api/print с валидными опциями → jobId", async () => {
    const base = await boot(fakeDeps);
    const r = await fetch(`${base}/api/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pdfBase64: Buffer.from("%PDF-1.4 test").toString("base64"),
        printer: "LABEL__9X00", copies: 1, rotate: 0, density: 8, speed: 8,
        widthMm: 58, heightMm: 40,
      }),
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ jobId: "LABEL__9X00-1" });
  });

  it("POST /api/print с чужим принтером → 400", async () => {
    const base = await boot(fakeDeps);
    const r = await fetch(`${base}/api/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdfBase64: "AA==", printer: "evil", widthMm: 58, heightMm: 40 }),
    });
    expect(r.status).toBe(400);
  });

  it("CORS preflight для localhost → разрешён", async () => {
    const base = await boot(fakeDeps);
    const r = await fetch(`${base}/api/print`, {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:3000", "Access-Control-Request-Method": "POST" },
    });
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
  });
});
