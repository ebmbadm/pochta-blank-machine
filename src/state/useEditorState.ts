"use client";

/**
 * Центральное состояние редактора: связывает загрузку PDF, поиск области
 * бланка, извлечение трек-номера, модель раскладки и экспорт PDF.
 * Это контракт, который потребляют UI-компоненты (UploadDropzone,
 * ControlsPanel, PreviewCanvas, page).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadSource,
  renderPageToCanvas,
  getPageText,
} from "@/lib/pdf/loadPdf";
import {
  detectFormRegionFromCanvas,
  pxBBoxToFormRegion,
  type PxBBox,
} from "@/lib/pdf/detectFormRegion";
import { extractTrackingNumber } from "@/lib/pdf/extractTracking";
import {
  createDefaultLayout,
  nextBarcodeId,
  type LayoutModel,
  type FormRegion,
  type ParcelPreset,
  type LabelPreset,
} from "@/lib/layout/layoutModel";
import { applyPreset, setFormWidth } from "@/lib/layout/presets";
import { applyLabelPreset, setLabelSizeOnModel } from "@/lib/layout/labelPresets";
import { loadExportFonts } from "@/lib/fonts";
import { BASE_PATH } from "@/lib/basePath";
import { composeA4Pdf, composeFormToLabelPdf, type BarcodeImage } from "@/lib/render/exportPdf";
import { barcodeToPngDataUrl, validateBarcodeValue } from "@/lib/barcode/generateBarcode";
import { composeLabelPdf } from "@/lib/render/exportLabelPdf";

export type EditorStatus = "empty" | "loading" | "ready" | "error";

export interface EditorApi {
  status: EditorStatus;
  error: string | null;
  fileName: string | null;
  /** Обрезанная область бланка (dataURL) для предпросмотра в DOM. */
  formImageUrl: string | null;
  /** Соотношение сторон бланка (высота/ширина) для предпросмотра. */
  formAspectRatio: number;
  formRegion: FormRegion | null;
  model: LayoutModel;
  exporting: boolean;

  loadFile(file: File): Promise<void>;
  reset(): void;
  selectPreset(preset: ParcelPreset): void;
  changeFormWidth(mm: number): void;
  setFormPosition(xMm: number, yMm: number): void;
  centerFormX(): void;
  setTrackingNumber(value: string): void;
  togglePrintDate(enabled: boolean): void;
  toggleShipDate(enabled: boolean): void;
  toggleExtraBarcodes(enabled: boolean): void;
  setBarcodeWidth(id: string, mm: number): void;
  addBarcodeCopy(): void;
  removeBarcodeCopy(id: string): void;
  exportPdf(action: "download" | "print"): Promise<void>;
  setLabelPreset(id: LabelPreset): void;
  setLabelSize(widthMm: number, heightMm: number): void;
  printLabel(action: "download" | "print"): Promise<void>;
  exportBlankLabel(action: "download" | "print"): Promise<void>;
}

const PREFS_KEY = "pochtacodder.prefs.v1";
const PREVIEW_SCALE = 2; // масштаб рендера страницы для предпросмотра/детекции

function formatToday(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Сохраняемые между сессиями предпочтения (без данных конкретного бланка). */
interface Prefs {
  preset: ParcelPreset;
  formWidthMm: number;
  printDate: boolean;
  shipDate: boolean;
  extraBarcodesEnabled: boolean;
  barcodeWidths: number[];
  labelPreset: LabelPreset;
  labelWidthMm: number;
  labelHeightMm: number;
}

function readPrefs(): Partial<Prefs> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    return raw ? (JSON.parse(raw) as Partial<Prefs>) : null;
  } catch {
    return null;
  }
}

function writePrefs(model: LayoutModel): void {
  if (typeof window === "undefined") return;
  try {
    const prefs: Prefs = {
      preset: model.preset,
      formWidthMm: model.formWidthMm,
      printDate: model.printDate.enabled,
      shipDate: model.shipDate.enabled,
      extraBarcodesEnabled: model.extraBarcodes.enabled,
      barcodeWidths: model.extraBarcodes.copies.map((c) => c.widthMm),
      labelPreset: model.label.preset,
      labelWidthMm: model.label.widthMm,
      labelHeightMm: model.label.heightMm,
    };
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* localStorage недоступен — игнорируем */
  }
}

function buildInitialModel(trackingNumber: string): LayoutModel {
  const prefs = readPrefs();
  let model = createDefaultLayout({
    trackingNumber,
    printDateText: formatToday(),
  });
  if (prefs) {
    model = applyPreset(model, prefs.preset ?? "L");
    if (typeof prefs.formWidthMm === "number") {
      model = setFormWidth(model, prefs.formWidthMm);
    }
    model = {
      ...model,
      printDate: { ...model.printDate, enabled: prefs.printDate ?? true },
      shipDate: { ...model.shipDate, enabled: prefs.shipDate ?? true },
      extraBarcodes: {
        ...model.extraBarcodes,
        enabled: prefs.extraBarcodesEnabled ?? true,
        copies:
          prefs.barcodeWidths && prefs.barcodeWidths.length > 0
            ? prefs.barcodeWidths.map((w, i) => ({
                id: nextBarcodeId(),
                widthMm: w,
                label: ["S", "M", "L"][i] ?? `${i + 1}`,
              }))
            : model.extraBarcodes.copies,
      },
    };
    if (prefs.labelPreset && prefs.labelPreset !== "custom") {
      model = applyLabelPreset(model, prefs.labelPreset);
    } else if (
      typeof prefs.labelWidthMm === "number" &&
      typeof prefs.labelHeightMm === "number"
    ) {
      model = setLabelSizeOnModel(model, prefs.labelWidthMm, prefs.labelHeightMm);
    }
  } else {
    model = applyPreset(model, "L");
  }
  return model;
}

function cropCanvas(
  src: HTMLCanvasElement,
  bbox: PxBBox,
): { url: string; aspect: number } {
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(bbox.width));
  out.height = Math.max(1, Math.round(bbox.height));
  const ctx = out.getContext("2d");
  if (ctx) {
    ctx.drawImage(
      src,
      bbox.x,
      bbox.y,
      bbox.width,
      bbox.height,
      0,
      0,
      out.width,
      out.height,
    );
  }
  return { url: out.toDataURL("image/png"), aspect: out.height / out.width };
}

export function useEditorState(): EditorApi {
  const [status, setStatus] = useState<EditorStatus>("empty");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [formImageUrl, setFormImageUrl] = useState<string | null>(null);
  const [formAspectRatio, setFormAspectRatio] = useState<number>(0.3);
  const [formRegion, setFormRegion] = useState<FormRegion | null>(null);
  const [model, setModel] = useState<LayoutModel>(() =>
    createDefaultLayout({ printDateText: formatToday() }),
  );
  const [exporting, setExporting] = useState(false);

  const sourceBytesRef = useRef<Uint8Array | null>(null);

  // сохраняем предпочтения при изменениях модели (только в состоянии ready)
  useEffect(() => {
    if (status === "ready") writePrefs(model);
  }, [model, status]);

  const updateModel = useCallback(
    (updater: (m: LayoutModel) => LayoutModel) => setModel((m) => updater(m)),
    [],
  );

  const loadFile = useCallback(async (file: File) => {
    setStatus("loading");
    setError(null);
    setFileName(file.name);
    try {
      const source = await loadSource(file);
      sourceBytesRef.current = source.bytes;

      const rendered = await renderPageToCanvas(source.pdfjsDoc, 0, PREVIEW_SCALE);
      let bbox = detectFormRegionFromCanvas(rendered.canvas, {
        threshold: 245,
        paddingPx: Math.round(6 * PREVIEW_SCALE),
      });
      if (!bbox) {
        // запасная рамка: верхняя треть страницы
        const pad = Math.round(6 * PREVIEW_SCALE);
        bbox = {
          x: pad,
          y: pad,
          width: rendered.canvas.width - pad * 2,
          height: Math.round(rendered.canvas.height * 0.32),
        };
      }

      const region = pxBBoxToFormRegion(bbox, {
        pageIndex: 0,
        canvasWidthPx: rendered.canvas.width,
        canvasHeightPx: rendered.canvas.height,
        pageWidthPt: rendered.pageWidthPt,
        pageHeightPt: rendered.pageHeightPt,
      });

      const { url, aspect } = cropCanvas(rendered.canvas, bbox);

      const text = await getPageText(source.pdfjsDoc, 0);
      const tracking = extractTrackingNumber(text) ?? "";

      setFormRegion(region);
      setFormImageUrl(url);
      setFormAspectRatio(aspect);
      setModel(buildInitialModel(tracking));
      setStatus("ready");
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error
          ? e.message
          : "Не удалось обработать PDF. Убедитесь, что это бланк с pochta.ru.",
      );
      setStatus("error");
    }
  }, []);

  const reset = useCallback(() => {
    sourceBytesRef.current = null;
    setFormImageUrl(null);
    setFormRegion(null);
    setFileName(null);
    setError(null);
    setStatus("empty");
  }, []);

  const selectPreset = useCallback(
    (preset: ParcelPreset) => updateModel((m) => applyPreset(m, preset)),
    [updateModel],
  );
  const changeFormWidth = useCallback(
    (mm: number) => updateModel((m) => setFormWidth(m, mm)),
    [updateModel],
  );
  const setFormPosition = useCallback(
    (xMm: number, yMm: number) =>
      updateModel((m) => ({ ...m, formXMm: xMm, formYMm: yMm })),
    [updateModel],
  );
  const centerFormX = useCallback(
    () =>
      updateModel((m) => ({ ...m, formXMm: (210 - m.formWidthMm) / 2 })),
    [updateModel],
  );
  const setTrackingNumber = useCallback(
    (value: string) =>
      updateModel((m) => ({ ...m, trackingNumber: value.toUpperCase().trim() })),
    [updateModel],
  );
  const togglePrintDate = useCallback(
    (enabled: boolean) =>
      updateModel((m) => ({ ...m, printDate: { ...m.printDate, enabled } })),
    [updateModel],
  );
  const toggleShipDate = useCallback(
    (enabled: boolean) =>
      updateModel((m) => ({ ...m, shipDate: { ...m.shipDate, enabled } })),
    [updateModel],
  );
  const toggleExtraBarcodes = useCallback(
    (enabled: boolean) =>
      updateModel((m) => ({
        ...m,
        extraBarcodes: { ...m.extraBarcodes, enabled },
      })),
    [updateModel],
  );
  const setBarcodeWidth = useCallback(
    (id: string, mm: number) =>
      updateModel((m) => ({
        ...m,
        extraBarcodes: {
          ...m.extraBarcodes,
          copies: m.extraBarcodes.copies.map((c) =>
            c.id === id ? { ...c, widthMm: Math.max(15, Math.min(190, mm)) } : c,
          ),
        },
      })),
    [updateModel],
  );
  const addBarcodeCopy = useCallback(
    () =>
      updateModel((m) => ({
        ...m,
        extraBarcodes: {
          ...m.extraBarcodes,
          copies: [
            ...m.extraBarcodes.copies,
            {
              id: nextBarcodeId(),
              widthMm: 50,
              label: `${m.extraBarcodes.copies.length + 1}`,
            },
          ],
        },
      })),
    [updateModel],
  );
  const removeBarcodeCopy = useCallback(
    (id: string) =>
      updateModel((m) => ({
        ...m,
        extraBarcodes: {
          ...m.extraBarcodes,
          copies: m.extraBarcodes.copies.filter((c) => c.id !== id),
        },
      })),
    [updateModel],
  );

  const setLabelPreset = useCallback(
    (id: LabelPreset) => updateModel((m) => applyLabelPreset(m, id)),
    [updateModel],
  );

  const setLabelSize = useCallback(
    (widthMm: number, heightMm: number) =>
      updateModel((m) => setLabelSizeOnModel(m, widthMm, heightMm)),
    [updateModel],
  );

  const printLabel = useCallback(
    async (action: "download" | "print") => {
      if (!model.trackingNumber || !validateBarcodeValue(model.trackingNumber).ok) {
        return;
      }
      setExporting(true);
      try {
        const fonts = await loadExportFonts(BASE_PATH);
        const pdfBytes = await composeLabelPdf({
          trackingNumber: model.trackingNumber,
          label: { widthMm: model.label.widthMm, heightMm: model.label.heightMm },
          fonts,
        });
        const blob = new Blob([pdfBytes as BlobPart], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        if (action === "download") {
          const a = document.createElement("a");
          a.href = url;
          a.download = `pochta-label-${model.trackingNumber}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
        } else {
          const w = window.open(url, "_blank");
          if (w) w.addEventListener("load", () => w.print());
        }
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch (e) {
        console.error(e);
        throw e instanceof Error ? e : new Error("Ошибка при создании этикетки");
      } finally {
        setExporting(false);
      }
    },
    [model],
  );

  const exportBlankLabel = useCallback(
    async (action: "download" | "print") => {
      const bytes = sourceBytesRef.current;
      if (!bytes || !formRegion) return;
      setExporting(true);
      try {
        const pdfBytes = await composeFormToLabelPdf({
          sourcePdfBytes: bytes,
          formRegion,
          labelWidthMm: model.label.widthMm,
          labelHeightMm: model.label.heightMm,
        });
        const blob = new Blob([pdfBytes as BlobPart], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        if (action === "download") {
          const a = document.createElement("a");
          a.href = url;
          a.download = `pochta-blank-${model.trackingNumber || "label"}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
        } else {
          const w = window.open(url, "_blank");
          if (w) w.addEventListener("load", () => w.print());
        }
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch (e) {
        console.error(e);
        throw e instanceof Error ? e : new Error("Ошибка при создании бланка для этикетки");
      } finally {
        setExporting(false);
      }
    },
    [formRegion, model],
  );

  const exportPdf = useCallback(
    async (action: "download" | "print") => {
      const bytes = sourceBytesRef.current;
      if (!bytes || !formRegion) return;
      setExporting(true);
      try {
        const fonts = await loadExportFonts(BASE_PATH);

        const barcodeImages: Record<string, BarcodeImage> = {};
        if (model.extraBarcodes.enabled && model.trackingNumber) {
          for (const copy of model.extraBarcodes.copies) {
            const png = await barcodeToPngDataUrl(model.trackingNumber, {
              scale: 3,
              includeText: true,
            });
            barcodeImages[copy.id] = {
              png: dataUrlToUint8Array(png.dataUrl),
              intrinsicWidthPx: png.widthPx,
              intrinsicHeightPx: png.heightPx,
            };
          }
        }

        const pdfBytes = await composeA4Pdf({
          sourcePdfBytes: bytes,
          formRegion,
          model,
          fonts,
          barcodeImages,
        });

        const blob = new Blob([pdfBytes as BlobPart], {
          type: "application/pdf",
        });
        const url = URL.createObjectURL(blob);
        if (action === "download") {
          const a = document.createElement("a");
          a.href = url;
          a.download = `pochta-${model.trackingNumber || "blank"}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
        } else {
          const w = window.open(url, "_blank");
          if (w) w.addEventListener("load", () => w.print());
        }
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch (e) {
        console.error(e);
        throw e instanceof Error ? e : new Error("Ошибка при создании PDF");
      } finally {
        setExporting(false);
      }
    },
    [formRegion, model],
  );

  return {
    status,
    error,
    fileName,
    formImageUrl,
    formAspectRatio,
    formRegion,
    model,
    exporting,
    loadFile,
    reset,
    selectPreset,
    changeFormWidth,
    setFormPosition,
    centerFormX,
    setTrackingNumber,
    togglePrintDate,
    toggleShipDate,
    toggleExtraBarcodes,
    setBarcodeWidth,
    addBarcodeCopy,
    removeBarcodeCopy,
    exportPdf,
    setLabelPreset,
    setLabelSize,
    printLabel,
    exportBlankLabel,
  };
}
