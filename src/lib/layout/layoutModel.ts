/**
 * Единая модель раскладки — общий источник правды для предпросмотра (DOM)
 * и для экспорта (pdf-lib). Все позиции и размеры — в миллиметрах, начало
 * координат в верхнем левом углу листа A4 (ось Y вниз). См. units.ts.
 */

import { A4 } from "@/lib/units";

export type ParcelPreset = "S" | "M" | "L" | "custom";

export type LabelPreset = "100x150" | "58x40" | "40x30" | "custom";

/** Конфигурация термоэтикетки (размер рулона + выбранный пресет). */
export interface LabelConfig {
  preset: LabelPreset;
  widthMm: number;
  heightMm: number;
}

/** Прямоугольник на листе A4 (мм, верхний левый угол). */
export interface RectMm {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

/**
 * Область бланка, найденная в исходном PDF, в СОБСТВЕННЫХ координатах страницы
 * pdf-lib (pt, начало в нижнем левом углу). Используется в exportPdf для
 * обрезки и встраивания вектора (embedPage), а также для расчёта пропорций.
 */
export interface FormRegion {
  pageIndex: number;
  xPt: number;
  yPt: number;
  widthPt: number;
  heightPt: number;
}

/** Одна дополнительная копия штрих-кода. Высота берётся из пропорций. */
export interface BarcodeCopy {
  id: string;
  /** Целевая ширина копии на листе, мм. */
  widthMm: number;
  /** Подпись размера: "S" | "M" | "L" | произвольная. */
  label: string;
}

export interface PrintDateField {
  enabled: boolean;
  /** Текст даты печати, формат ДД.ММ.ГГГГ. Заполняется при экспорте/инициализации. */
  text: string;
}

export interface ShipDateField {
  enabled: boolean;
  /** Подпись перед линией для ручного заполнения. */
  label: string;
}

export interface ExtraBarcodes {
  enabled: boolean;
  copies: BarcodeCopy[];
}

/**
 * Пользовательские настройки раскладки (сохраняются в localStorage).
 * Не содержит исходного PDF и FormRegion — это runtime-вход для exportPdf.
 */
export interface LayoutModel {
  /** Целевая ширина всего бланка на листе, мм. Высота — пропорционально. */
  formWidthMm: number;
  /** Позиция верхнего левого угла бланка на A4, мм. */
  formXMm: number;
  formYMm: number;
  /** Выбранный пресет (для подсветки в UI). */
  preset: ParcelPreset;

  /** Трек-номер S10 (например "LS018350611RU"), извлечённый или введённый вручную. */
  trackingNumber: string;

  printDate: PrintDateField;
  shipDate: ShipDateField;
  extraBarcodes: ExtraBarcodes;
  /** Настройки печати штрих-кода на термоэтикетке. */
  label: LabelConfig;
}

/** Соотношение сторон бланка (высота / ширина) из найденной области. */
export function formAspect(region: FormRegion): number {
  return region.heightPt / region.widthPt;
}

/** Текущая высота бланка на листе по выбранной ширине и пропорциям области. */
export function formHeightMm(model: LayoutModel, region: FormRegion): number {
  return model.formWidthMm * formAspect(region);
}

let _idCounter = 0;
/** Детерминированный id (Math.random недоступен в части окружений сборки). */
export function nextBarcodeId(prefix = "bc"): string {
  _idCounter += 1;
  return `${prefix}-${_idCounter}`;
}

export interface CreateLayoutOptions {
  trackingNumber?: string;
  printDateText?: string;
  formWidthMm?: number;
}

/** Значения по умолчанию для свежезагруженного бланка. */
export function createDefaultLayout(opts: CreateLayoutOptions = {}): LayoutModel {
  const formWidthMm = opts.formWidthMm ?? 170;
  return {
    formWidthMm,
    formXMm: (A4.widthMm - formWidthMm) / 2, // по центру по горизонтали
    formYMm: 12, // отступ сверху
    preset: "L",
    trackingNumber: opts.trackingNumber ?? "",
    printDate: { enabled: true, text: opts.printDateText ?? "" },
    shipDate: { enabled: true, label: "Дата отправки:" },
    extraBarcodes: {
      enabled: true,
      copies: [
        { id: nextBarcodeId(), widthMm: 40, label: "S" },
        { id: nextBarcodeId(), widthMm: 60, label: "M" },
        { id: nextBarcodeId(), widthMm: 90, label: "L" },
      ],
    },
    label: { preset: "58x40", widthMm: 58, heightMm: 40 },
  };
}
