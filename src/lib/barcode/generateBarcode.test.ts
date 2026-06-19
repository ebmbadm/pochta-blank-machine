import { describe, expect, it } from "vitest";

import { barcodeToSvg, validateBarcodeValue } from "./generateBarcode";

// Примечание: barcodeToPngDataUrl НЕ тестируется здесь — она работает только в
// браузере (требует реального canvas, которого нет в jsdom). Проверяется вручную.

describe("validateBarcodeValue", () => {
  it("отклоняет пустую строку", () => {
    expect(validateBarcodeValue("").ok).toBe(false);
  });

  it("принимает корректный S10-номер", () => {
    const result = validateBarcodeValue("LS018350611RU");
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("отклоняет не-ASCII (кириллицу)", () => {
    expect(validateBarcodeValue("Дата").ok).toBe(false);
  });
});

describe("barcodeToSvg", () => {
  it("возвращает SVG-строку разумной длины", () => {
    const svg = barcodeToSvg("LS018350611RU");
    expect(typeof svg).toBe("string");
    expect(svg).toContain("<svg");
    expect(svg.length).toBeGreaterThan(100);
  });

  it("бросает исключение для пустого значения", () => {
    expect(() => barcodeToSvg("")).toThrow();
  });
});
