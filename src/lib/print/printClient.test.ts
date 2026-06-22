import { describe, it, expect, vi, afterEach } from "vitest";
import {
  resolveApiBase,
  bytesToBase64,
  checkPrintService,
  sendPrintJob,
} from "./printClient";

afterEach(() => vi.restoreAllMocks());

describe("resolveApiBase", () => {
  it("dev (:3000) → абсолютный localhost:8787", () => {
    expect(resolveApiBase("3000")).toBe("http://localhost:8787");
  });
  it("served (:8787 или иной) → относительный путь", () => {
    expect(resolveApiBase("8787")).toBe("");
    expect(resolveApiBase("")).toBe("");
  });
});

describe("bytesToBase64", () => {
  it("кодирует байты", () => {
    expect(bytesToBase64(new Uint8Array([72, 105]))).toBe("SGk=");
  });
});

describe("checkPrintService", () => {
  it("true при ok:true", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ));
    expect(await checkPrintService()).toBe(true);
  });
  it("false при сетевой ошибке", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await checkPrintService()).toBe(false);
  });
});

describe("sendPrintJob", () => {
  it("POST'ит base64 PDF и опции, возвращает jobId", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jobId: "X-1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await sendPrintJob(new Uint8Array([1, 2, 3]), {
      printerName: "LABEL__9X00", copies: 2, rotate: 1, density: 10, speed: 8,
      widthMm: 58, heightMm: 40,
    });
    expect(res).toEqual({ jobId: "X-1" });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.printer).toBe("LABEL__9X00");
    expect(body.copies).toBe(2);
    expect(typeof body.pdfBase64).toBe("string");
  });
  it("бросает при не-ok ответе", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("нет", { status: 400 })));
    await expect(
      sendPrintJob(new Uint8Array([1]), {
        printerName: "P", copies: 1, rotate: 0, density: 8, speed: 8, widthMm: 58, heightMm: 40,
      }),
    ).rejects.toThrow();
  });
});
