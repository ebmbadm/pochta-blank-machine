import { describe, it, expect } from "vitest";
import { captureBarcodeGeometry } from "./barcodeGeometry";

describe("captureBarcodeGeometry", () => {
  it("возвращает непустые штрихи и вменяемый moduleCount для S10", () => {
    const g = captureBarcodeGeometry("LS018350611RU");
    expect(g.bars.length).toBeGreaterThan(20);
    expect(g.widthPx).toBeGreaterThan(0);
    expect(g.heightPx).toBeGreaterThan(0);
    // Code 128 для 13-символьного S10 — ~140–180 модулей.
    expect(g.moduleCount).toBeGreaterThan(120);
    expect(g.moduleCount).toBeLessThan(200);
  });
  it("все штрихи внутри захваченных границ", () => {
    const g = captureBarcodeGeometry("LS018350611RU");
    for (const b of g.bars) {
      expect(b.x).toBeGreaterThanOrEqual(-0.01);
      expect(b.x + b.w).toBeLessThanOrEqual(g.widthPx + 0.01);
      expect(b.h).toBeGreaterThan(0);
    }
  });
  it("бросает на невалидном (не-ASCII) значении", () => {
    expect(() => captureBarcodeGeometry("Дата")).toThrow();
  });
});
