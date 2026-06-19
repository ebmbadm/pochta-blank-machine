import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

import { A4, mmToPt } from "@/lib/units";
import { createDefaultLayout } from "@/lib/layout/layoutModel";
import type { FormRegion, BarcodeCopy } from "@/lib/layout/layoutModel";
import {
  composeA4Pdf,
  computeBarcodeRowLayout,
  computeFormPlacementPt,
} from "./exportPdf";

describe("computeFormPlacementPt", () => {
  it("считает scale, размеры и переводит верхний левый угол (мм) в нижний левый (pt)", () => {
    const region: FormRegion = {
      pageIndex: 0,
      xPt: 10,
      yPt: 200,
      widthPt: 180,
      heightPt: 80,
    };
    const model = createDefaultLayout({ formWidthMm: 170 });
    model.formXMm = 20;
    model.formYMm = 12;

    const p = computeFormPlacementPt(model, region);

    const expectedWidthPt = mmToPt(170); // ≈ 481.89
    const expectedScale = expectedWidthPt / 180;
    const expectedHeightPt = 80 * expectedScale;

    expect(p.widthPt).toBeCloseTo(expectedWidthPt, 4);
    expect(p.scale).toBeCloseTo(expectedScale, 6);
    expect(p.heightPt).toBeCloseTo(expectedHeightPt, 4);
    expect(p.xPt).toBeCloseTo(mmToPt(20), 4);
    // yPt = A4.heightPt - mmToPt(formYMm) - heightPt
    expect(p.yPt).toBeCloseTo(A4.heightPt - mmToPt(12) - expectedHeightPt, 4);
  });
});

describe("computeBarcodeRowLayout", () => {
  it("переносит копии на вторую строку при превышении maxRightMm", () => {
    const copies: BarcodeCopy[] = [
      { id: "a", widthMm: 40, label: "S" },
      { id: "b", widthMm: 40, label: "S" },
      { id: "c", widthMm: 40, label: "S" },
    ];
    // startX=10, gap=5, maxRight=100.
    // a: 10..50; b: 55..95; c начнётся с 100 (>100 после b: 55+40+5=100), 100+40>100 → перенос.
    const layout = computeBarcodeRowLayout(copies, {
      startXMm: 10,
      startYMm: 50,
      gapMm: 5,
      maxRightMm: 100,
      aspect: 0.32,
    });

    expect(layout).toHaveLength(3);
    // a и b на первой строке.
    expect(layout[0].yMm).toBe(50);
    expect(layout[1].yMm).toBe(50);
    expect(layout[0].xMm).toBe(10);
    expect(layout[1].xMm).toBe(55);
    // c перенесена на новую строку.
    expect(layout[2].xMm).toBe(10);
    expect(layout[2].yMm).toBeGreaterThan(50);
    // высота = width * aspect.
    expect(layout[0].heightMm).toBeCloseTo(40 * 0.32, 6);
  });

  it("не переносит, если все копии помещаются в одну строку", () => {
    const copies: BarcodeCopy[] = [
      { id: "a", widthMm: 30, label: "S" },
      { id: "b", widthMm: 30, label: "S" },
    ];
    const layout = computeBarcodeRowLayout(copies, {
      startXMm: 0,
      startYMm: 0,
      gapMm: 5,
      maxRightMm: 210,
    });
    expect(layout[0].yMm).toBe(0);
    expect(layout[1].yMm).toBe(0);
  });
});

describe("composeA4Pdf (интеграция, Node)", () => {
  it("собирает один лист A4 из встроенного вектора и кириллических надписей", async () => {
    // Крошечный исходный PDF: страница 200x300 с прямоугольником.
    const s = await PDFDocument.create();
    const sp = s.addPage([200, 300]);
    sp.drawRectangle({ x: 10, y: 200, width: 180, height: 80 });
    const srcBytes = await s.save();

    const formRegion: FormRegion = {
      pageIndex: 0,
      xPt: 10,
      yPt: 200,
      widthPt: 180,
      heightPt: 80,
    };

    // Шрифты с диска (кириллица).
    const regular = new Uint8Array(
      fs.readFileSync(path.resolve("public/fonts/DejaVuSans.ttf")),
    );
    const bold = new Uint8Array(
      fs.readFileSync(path.resolve("public/fonts/DejaVuSans-Bold.ttf")),
    );

    const model = createDefaultLayout({
      trackingNumber: "LS018350611RU",
      printDateText: "19.06.2026",
    });
    model.extraBarcodes.enabled = false; // в этом тесте без изображений

    const result = await composeA4Pdf({
      sourcePdfBytes: srcBytes,
      formRegion,
      model,
      fonts: { regular, bold },
    });

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(1000);

    // Перезагружаем и проверяем геометрию листа.
    const reloaded = await PDFDocument.load(result);
    expect(reloaded.getPageCount()).toBe(1);
    const outPage = reloaded.getPage(0);
    const { width, height } = outPage.getSize();
    expect(width).toBeCloseTo(A4.widthPt, 1);
    expect(height).toBeCloseTo(A4.heightPt, 1);
  });
});
