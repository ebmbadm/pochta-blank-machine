import { describe, it, expect } from "vitest";
import { captureBarcodeGeometry } from "@/lib/barcode/barcodeGeometry";
import {
  computeLabelLayout,
  computeXDimensionMm,
  classifyReadability,
  labelMarginXmm,
} from "./exportLabelPdf";

describe("computeXDimensionMm + classifyReadability", () => {
  it("широкая этикетка → good", () => {
    const x = computeXDimensionMm(100, 156);
    expect(x).toBeGreaterThan(0.33);
    expect(classifyReadability(x)).toBe("good");
  });
  it("58 мм → marginal", () => {
    const x = computeXDimensionMm(58, 156);
    expect(classifyReadability(x)).toBe("marginal");
  });
  it("крошечная 40 мм → poor", () => {
    const x = computeXDimensionMm(40, 156);
    expect(classifyReadability(x)).toBe("poor");
  });
  it("moduleCount=0 → 0 без деления на ноль", () => {
    expect(computeXDimensionMm(58, 0)).toBe(0);
  });
});

describe("computeLabelLayout", () => {
  it("заполняет внутреннюю ширину и держит штрихи внутри этикетки", () => {
    const geom = captureBarcodeGeometry("LS018350611RU");
    const L = computeLabelLayout(58, 40, geom);
    expect(L.barcodeWidthMm).toBeGreaterThan(40);
    expect(L.barcodeXmm).toBeCloseTo(labelMarginXmm(58), 6);
    expect(L.barcodeXmm + L.barcodeWidthMm).toBeLessThanOrEqual(58 + 1e-9);
    expect(L.barcodeTopMm + L.barAreaHeightMm).toBeLessThan(40);
    expect(L.numberMm.topMm).toBeGreaterThanOrEqual(L.barcodeTopMm + L.barAreaHeightMm);
    expect(L.xDimMm).toBeCloseTo(L.barcodeWidthMm / geom.moduleCount, 6);
  });
});
