/**
 * Браузерный клиент print-моста. В served-режиме (страницу отдаёт сам сервис)
 * используются относительные пути; в dev (next dev на :3000) — абсолютный
 * localhost:8787.
 */

export interface PrinterInfo {
  name: string;
  isDefault: boolean;
}

export interface PrintJobOptions {
  printerName: string;
  copies: number;
  rotate: 0 | 1 | 2 | 3;
  density: number;
  speed: number;
  widthMm: number;
  heightMm: number;
}

/** Чистая: базовый URL API по текущему порту страницы. */
export function resolveApiBase(port: string): string {
  return port === "3000" ? "http://localhost:8787" : "";
}

function apiBase(): string {
  if (typeof window === "undefined") return "";
  return resolveApiBase(window.location.port);
}

/** Чистая: Uint8Array → base64 (для небольших PDF этикеток). */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export async function checkPrintService(): Promise<boolean> {
  try {
    const r = await fetch(`${apiBase()}/api/health`);
    if (!r.ok) return false;
    const j = await r.json();
    return j?.ok === true;
  } catch {
    return false;
  }
}

export async function fetchPrinters(): Promise<PrinterInfo[]> {
  const r = await fetch(`${apiBase()}/api/printers`);
  if (!r.ok) throw new Error("Не удалось получить список принтеров");
  return (await r.json()) as PrinterInfo[];
}

export async function sendPrintJob(
  pdf: Uint8Array,
  opts: PrintJobOptions,
): Promise<{ jobId: string }> {
  const r = await fetch(`${apiBase()}/api/print`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pdfBase64: bytesToBase64(pdf),
      printer: opts.printerName,
      copies: opts.copies,
      rotate: opts.rotate,
      density: opts.density,
      speed: opts.speed,
      widthMm: opts.widthMm,
      heightMm: opts.heightMm,
    }),
  });
  if (!r.ok) {
    const msg = await r.text().catch(() => "");
    throw new Error(msg || "Печать не удалась");
  }
  return (await r.json()) as { jobId: string };
}
