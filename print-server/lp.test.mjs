import { describe, it, expect } from "vitest";
import {
  buildLpArgs,
  parsePrinters,
  parseJobId,
  normalizePrintOptions,
} from "./lp.mjs";

describe("buildLpArgs", () => {
  it("собирает argv с размером, поворотом, плотностью, скоростью и путём", () => {
    const args = buildLpArgs({
      printer: "LABEL__9X00",
      copies: 2,
      rotate: 1,
      density: 10,
      speed: 8,
      widthMm: 58,
      heightMm: 40,
      pdfPath: "/tmp/a.pdf",
    });
    expect(args).toEqual([
      "-d", "LABEL__9X00",
      "-n", "2",
      "-o", "PageSize=Custom.58x40mm",
      "-o", "OP_Rotate=1",
      "-o", "OP_PrintDensity=10",
      "-o", "OP_PrintSpeed=8",
      "/tmp/a.pdf",
    ]);
  });
});

describe("parsePrinters", () => {
  it("парсит имена и помечает дефолт", () => {
    const e = "Brother_MFC_L2700DW_series\nLABEL__9X00\n";
    const d = "system default destination: LABEL__9X00";
    expect(parsePrinters(e, d)).toEqual([
      { name: "Brother_MFC_L2700DW_series", isDefault: false },
      { name: "LABEL__9X00", isDefault: true },
    ]);
  });
  it("без дефолта — все isDefault:false", () => {
    expect(parsePrinters("P1\n", "no default destination")).toEqual([
      { name: "P1", isDefault: false },
    ]);
  });
});

describe("parseJobId", () => {
  it("вытаскивает id задания", () => {
    expect(parseJobId("request id is LABEL__9X00-42 (1 file(s))")).toBe("LABEL__9X00-42");
  });
  it("null если не найдено", () => {
    expect(parseJobId("ничего")).toBeNull();
  });
});

describe("normalizePrintOptions", () => {
  const allowed = ["LABEL__9X00", "Brother_MFC_L2700DW_series"];
  it("валидирует принтер и зажимает диапазоны", () => {
    const r = normalizePrintOptions(
      { printer: "LABEL__9X00", copies: 999, rotate: 7, density: 99, speed: 0, widthMm: 5, heightMm: 9999 },
      allowed,
    );
    expect(r.ok).toBe(true);
    expect(r.opts).toEqual({
      printer: "LABEL__9X00",
      copies: 99,
      rotate: 0,
      density: 15,
      speed: 1,
      widthMm: 20,
      heightMm: 200,
    });
  });
  it("отклоняет неизвестный принтер", () => {
    const r = normalizePrintOptions({ printer: "evil", widthMm: 58, heightMm: 40 }, allowed);
    expect(r.ok).toBe(false);
  });
  it("отклоняет нечисловой размер", () => {
    const r = normalizePrintOptions({ printer: "LABEL__9X00", widthMm: "x", heightMm: 40 }, allowed);
    expect(r.ok).toBe(false);
  });
});
