/**
 * Сборка PDF термоэтикетки со штрих-кодом трек-номера (pdf-lib).
 *
 * Штрихи рисуются вектором (геометрия из barcodeGeometry), вписанные в этикетку
 * НЕРАВНОМЕРНО: по ширине — на всю внутреннюю ширину (максимальный X-dimension
 * для сканируемости), по высоте — отдельной высотой штрихов. Номер — встроенным
 * DejaVu по центру под штрихами.
 *
 * Координаты: LayoutModel/раскладка — мм, верхний левый угол, ось Y вниз;
 * pdf-lib — pt, нижний левый угол, ось Y вверх. Перевод в composeLabelPdf.
 */
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { clamp, mmToPt } from "@/lib/units";
import { captureBarcodeGeometry, type BarcodeGeometry } from "@/lib/barcode/barcodeGeometry";

export type Readability = "good" | "marginal" | "poor";

/** Горизонтальное поле = зона тишины (≥2.5 мм с каждой стороны). */
export function labelMarginXmm(labelWidthMm: number): number {
  return clamp(labelWidthMm * 0.06, 2.5, 6);
}

/** Вертикальное поле сверху/снизу этикетки. */
export function labelMarginYmm(labelHeightMm: number): number {
  return clamp(labelHeightMm * 0.08, 1.5, 5);
}

/** X-dimension (ширина модуля, мм) для индикатора читаемости. */
export function computeXDimensionMm(labelWidthMm: number, moduleCount: number): number {
  if (moduleCount <= 0) return 0;
  const innerWmm = labelWidthMm - 2 * labelMarginXmm(labelWidthMm);
  return innerWmm / moduleCount;
}

export function classifyReadability(xDimMm: number): Readability {
  if (xDimMm >= 0.33) return "good";
  if (xDimMm >= 0.25) return "marginal";
  return "poor";
}

/** Полная раскладка элементов этикетки в мм (верхний левый угол). */
export interface LabelLayout {
  marginXmm: number;
  marginYmm: number;
  barcodeXmm: number;
  barcodeTopMm: number;
  barcodeWidthMm: number;
  barAreaHeightMm: number;
  /** Множители px→мм для штрихов (по X и Y независимо). */
  scaleXmmPerPx: number;
  scaleYmmPerPx: number;
  /** Область человекочитаемого номера. */
  numberMm: { topMm: number; heightMm: number };
  xDimMm: number;
}

export function computeLabelLayout(
  labelWidthMm: number,
  labelHeightMm: number,
  geom: BarcodeGeometry,
): LabelLayout {
  const marginXmm = labelMarginXmm(labelWidthMm);
  const marginYmm = labelMarginYmm(labelHeightMm);
  const innerWmm = labelWidthMm - 2 * marginXmm;
  const innerHmm = labelHeightMm - 2 * marginYmm;

  const numberHeightMm = clamp(innerHmm * 0.18, 2.5, 5);
  const gapMm = clamp(innerHmm * 0.04, 0.5, 2);
  const barAreaHeightMm = Math.max(2, innerHmm - numberHeightMm - gapMm);

  const scaleXmmPerPx = geom.widthPx > 0 ? innerWmm / geom.widthPx : 0;
  const scaleYmmPerPx = geom.heightPx > 0 ? barAreaHeightMm / geom.heightPx : 0;

  return {
    marginXmm,
    marginYmm,
    barcodeXmm: marginXmm,
    barcodeTopMm: marginYmm,
    barcodeWidthMm: innerWmm,
    barAreaHeightMm,
    scaleXmmPerPx,
    scaleYmmPerPx,
    numberMm: { topMm: marginYmm + barAreaHeightMm + gapMm, heightMm: numberHeightMm },
    xDimMm: geom.moduleCount > 0 ? innerWmm / geom.moduleCount : 0,
  };
}

export interface LabelComposeInput {
  trackingNumber: string;
  label: { widthMm: number; heightMm: number };
  fonts: { regular: Uint8Array; bold: Uint8Array };
}

/**
 * Собирает PDF одной этикетки: страница точно в размер этикетки, штрихи —
 * вектором (drawRectangle), номер — DejaVu по центру под штрихами.
 * Бросает Error, если трек-номер невалиден (через captureBarcodeGeometry).
 */
export async function composeLabelPdf(input: LabelComposeInput): Promise<Uint8Array> {
  const { trackingNumber, label, fonts } = input;
  const geom: BarcodeGeometry = captureBarcodeGeometry(trackingNumber);
  const layout = computeLabelLayout(label.widthMm, label.heightMm, geom);

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fonts.regular, { subset: true });

  const pageWPt = mmToPt(label.widthMm);
  const pageHPt = mmToPt(label.heightMm);
  const page = doc.addPage([pageWPt, pageHPt]);

  // Штрихи: px bwip-js (сверху-слева) → мм раскладки → pt pdf-lib (снизу-слева).
  for (const b of geom.bars) {
    const xMm = layout.barcodeXmm + b.x * layout.scaleXmmPerPx;
    const wMm = b.w * layout.scaleXmmPerPx;
    const topMm = layout.barcodeTopMm + b.y * layout.scaleYmmPerPx;
    const hMm = b.h * layout.scaleYmmPerPx;

    const xPt = mmToPt(xMm);
    const wPt = mmToPt(wMm);
    const hPt = mmToPt(hMm);
    const yPt = pageHPt - mmToPt(topMm) - hPt;

    page.drawRectangle({ x: xPt, y: yPt, width: wPt, height: hPt, color: rgb(0, 0, 0) });
  }

  // Человекочитаемый номер — по центру под штрихами.
  // Размер шрифта подбираем так, чтобы строка влезла и по высоте, и по ширине.
  const numberAreaHeightPt = mmToPt(layout.numberMm.heightMm);
  const maxByWidthPt = mmToPt(layout.barcodeWidthMm);
  let fontSize = numberAreaHeightPt * 0.85;
  const widthAtSize = font.widthOfTextAtSize(trackingNumber, fontSize);
  if (widthAtSize > maxByWidthPt) {
    fontSize = fontSize * (maxByWidthPt / widthAtSize);
  }
  const textWidthPt = font.widthOfTextAtSize(trackingNumber, fontSize);
  const centerXPt = pageWPt / 2;
  // Базовая линия: верх области номера (мм, сверху) → pt снизу, минус размер шрифта.
  const baselineYPt = pageHPt - mmToPt(layout.numberMm.topMm) - fontSize;

  page.drawText(trackingNumber, {
    x: centerXPt - textWidthPt / 2,
    y: baselineYPt,
    size: fontSize,
    font,
    color: rgb(0, 0, 0),
  });

  return doc.save();
}
