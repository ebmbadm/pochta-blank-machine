/**
 * HTTP-обвязка print-моста (node:http, только loopback). Роутинг /api/* + статика.
 * Зависимости (listPrinters/runLp) инъектируются — для тестов без реального lp.
 */
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";

import { listPrinters as realListPrinters, runLp as realRunLp, normalizePrintOptions } from "./lp.mjs";
import { serveStatic } from "./static.mjs";

const MAX_BODY = 10 * 1024 * 1024; // 10 МБ

function allowedOrigin(origin) {
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || "");
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (allowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
}

function json(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function createServer({ rootDir, deps = {} }) {
  const listPrinters = deps.listPrinters || realListPrinters;
  const runLp = deps.runLp || realRunLp;

  return http.createServer(async (req, res) => {
    cors(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    const url = (req.url || "/").split("?")[0];

    if (req.method === "GET" && url === "/api/health") {
      json(res, 200, { ok: true });
      return;
    }
    if (req.method === "GET" && url === "/api/printers") {
      try {
        json(res, 200, await listPrinters());
      } catch {
        json(res, 500, { error: "lpstat failed" });
      }
      return;
    }
    if (req.method === "POST" && url === "/api/print") {
      let tmp;
      try {
        const body = await readBody(req);
        const raw = JSON.parse(body.toString("utf8"));
        const allowed = (await listPrinters()).map((p) => p.name);
        const norm = normalizePrintOptions(raw, allowed);
        if (!norm.ok) {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end(norm.error);
          return;
        }
        const pdf = Buffer.from(String(raw.pdfBase64 || ""), "base64");
        if (pdf.length === 0) {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Пустой PDF");
          return;
        }
        tmp = path.join(os.tmpdir(), `pochta-label-${randomUUID()}.pdf`);
        await writeFile(tmp, pdf);
        const { jobId } = await runLp(tmp, norm.opts);
        json(res, 200, { jobId });
      } catch (e) {
        json(res, 500, { error: e instanceof Error ? e.message : "print failed" });
      } finally {
        if (tmp) unlink(tmp).catch(() => {});
      }
      return;
    }

    if (req.method === "GET") {
      await serveStatic(req, res, rootDir);
      return;
    }
    res.writeHead(404).end("Not found");
  });
}
