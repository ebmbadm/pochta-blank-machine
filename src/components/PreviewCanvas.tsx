"use client";

/**
 * PreviewCanvas — живой предпросмотр листа A4 в масштабе 1:1 по пропорциям.
 *
 * Лист рисуется как белая бумага на «столе»; внутри него абсолютно
 * позиционируются элементы раскладки (бланк, мета-строка, доп. штрих-коды).
 * Все координаты модели — в миллиметрах; здесь они переводятся в пиксели
 * через `pxPerMm = sheetWidthPx / 210`, где `sheetWidthPx` измеряется
 * ResizeObserver'ом. Благодаря этому всё корректно перемасштабируется
 * при изменении размеров контейнера: позиции выводятся из pxPerMm на
 * каждый рендер.
 *
 * Бланк можно перетаскивать (pointer events + setPointerCapture) и менять
 * его ширину за угловой маркер. Дельты в пикселях переводятся обратно в мм
 * и прокидываются в EditorApi с клампингом по границам листа.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditorApi } from "@/state/useEditorState";
import { barcodeToSvg } from "@/lib/barcode/generateBarcode";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MIN_FORM_WIDTH_MM = 50;
const MAX_FORM_WIDTH_MM = 200;

interface PreviewCanvasProps {
  api: EditorApi;
}

/** Текущее перетаскивание: что тащим и с каких значений начали. */
type DragKind = "move" | "resize";

interface DragState {
  kind: DragKind;
  /** Координаты указателя в момент начала, экранные px. */
  startClientX: number;
  startClientY: number;
  /** Значения модели в момент начала. */
  startXMm: number;
  startYMm: number;
  startWidthMm: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export default function PreviewCanvas({ api }: PreviewCanvasProps) {
  const { formImageUrl, formAspectRatio, model } = api;

  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [sheetWidthPx, setSheetWidthPx] = useState(0);
  const dragRef = useRef<DragState | null>(null);

  // Измеряем фактическую ширину листа в пикселях. Высота следует за
  // aspect-ratio в CSS, так что достаточно ширины.
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const update = () => setSheetWidthPx(el.getBoundingClientRect().width);
    update();
    // ResizeObserver отсутствует в некоторых окружениях (например, jsdom в
    // юнит-тестах) — тогда работаем без подписки на ресайз.
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pxPerMm = sheetWidthPx > 0 ? sheetWidthPx / A4_WIDTH_MM : 0;

  // Высота бланка определяется его шириной и пропорцией области (h/w).
  const formHeightMm = model.formWidthMm * formAspectRatio;

  const onFormPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || pxPerMm <= 0) return;

      const dxMm = (e.clientX - drag.startClientX) / pxPerMm;
      const dyMm = (e.clientY - drag.startClientY) / pxPerMm;

      if (drag.kind === "move") {
        const maxX = Math.max(0, A4_WIDTH_MM - drag.startWidthMm);
        const heightMm = drag.startWidthMm * formAspectRatio;
        const maxY = Math.max(0, A4_HEIGHT_MM - heightMm);
        const nextX = clamp(drag.startXMm + dxMm, 0, maxX);
        const nextY = clamp(drag.startYMm + dyMm, 0, maxY);
        api.setFormPosition(nextX, nextY);
      } else {
        const nextWidth = clamp(
          drag.startWidthMm + dxMm,
          MIN_FORM_WIDTH_MM,
          MAX_FORM_WIDTH_MM,
        );
        api.changeFormWidth(nextWidth);
      }
    },
    [api, formAspectRatio, pxPerMm],
  );

  const endDrag = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  const startMove = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = {
        kind: "move",
        startClientX: e.clientX,
        startClientY: e.clientY,
        startXMm: model.formXMm,
        startYMm: model.formYMm,
        startWidthMm: model.formWidthMm,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [model.formXMm, model.formYMm, model.formWidthMm],
  );

  const startResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = {
        kind: "resize",
        startClientX: e.clientX,
        startClientY: e.clientY,
        startXMm: model.formXMm,
        startYMm: model.formYMm,
        startWidthMm: model.formWidthMm,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [model.formXMm, model.formYMm, model.formWidthMm],
  );

  // Размер шрифта мета-строки масштабируем вместе с листом.
  const metaFontPx = Math.max(7, pxPerMm * 3);

  // Готовим SVG доп. штрих-кодов один раз на трек-номер. Невалидный
  // (например, кириллица) — пропускаем, чтобы не падать.
  const barcodeSvg = useMemo(() => {
    if (!model.extraBarcodes.enabled || !model.trackingNumber) return null;
    try {
      return barcodeToSvg(model.trackingNumber, { includeText: true });
    } catch {
      return null;
    }
  }, [model.extraBarcodes.enabled, model.trackingNumber]);

  const barcodeSrc = barcodeSvg
    ? "data:image/svg+xml;utf8," + encodeURIComponent(barcodeSvg)
    : null;

  return (
    <div className="flex h-full w-full items-center justify-center overflow-auto bg-[oklch(0.92_0.008_85)] p-6 dark:bg-[oklch(0.15_0.01_264)]">
      {/* Лист A4: пропорция 210/297, ширина тянется по контейнеру. */}
      <div
        ref={sheetRef}
        className="reg-marks relative w-full max-w-[640px] bg-white shadow-[0_18px_50px_-12px_rgba(20,30,60,0.35)] ring-1 ring-black/5"
        style={{ aspectRatio: `${A4_WIDTH_MM} / ${A4_HEIGHT_MM}` }}
      >
        {/* Подпись формата в углу. */}
        <span className="stamp-label pointer-events-none absolute right-2 top-1.5 z-10">
          A4 · 210 × 297 ММ
        </span>

        {pxPerMm > 0 && (
          <>
            {/* 1. БЛАНК — перетаскиваемый и масштабируемый. */}
            <div
              className="absolute touch-none select-none"
              style={{
                left: model.formXMm * pxPerMm,
                top: model.formYMm * pxPerMm,
                width: model.formWidthMm * pxPerMm,
              }}
              onPointerMove={onFormPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              {/* Перетаскиваемая область + пунктирная рамка выделения. */}
              <div
                className="relative cursor-move outline-2 outline-dashed outline-offset-2 outline-[var(--postal-blue)]"
                onPointerDown={startMove}
              >
                {formImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={formImageUrl}
                    alt="Бланк"
                    draggable={false}
                    className="block w-full select-none"
                    style={{ height: model.formWidthMm * formAspectRatio * pxPerMm }}
                  />
                ) : (
                  <div
                    className="flex items-center justify-center border-2 border-dashed border-[var(--postal-blue)]/40 bg-[var(--muted)]/40 text-muted-foreground"
                    style={{
                      height: model.formWidthMm * formAspectRatio * pxPerMm,
                      fontSize: metaFontPx,
                    }}
                  >
                    бланк
                  </div>
                )}

                {/* Маркер изменения ширины в правом нижнем углу. */}
                <div
                  className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-[2px] bg-[var(--postal-blue)] shadow ring-2 ring-white"
                  onPointerDown={startResize}
                  role="slider"
                  aria-label="Изменить ширину бланка"
                  aria-valuenow={Math.round(model.formWidthMm)}
                  aria-valuemin={MIN_FORM_WIDTH_MM}
                  aria-valuemax={MAX_FORM_WIDTH_MM}
                  tabIndex={0}
                />
              </div>

              {/* Плавающий моноширинный бейдж размера. */}
              <span
                className="pointer-events-none absolute -top-5 left-0 whitespace-nowrap rounded bg-[var(--postal-blue)] px-1.5 py-0.5 font-mono text-[10px] leading-none text-white"
              >
                {Math.round(model.formWidthMm)} мм
              </span>
            </div>

            {/* 2. МЕТА-СТРОКА — под бланком. */}
            {(model.printDate.enabled || model.shipDate.enabled) && (
              <div
                className="pointer-events-none absolute flex flex-wrap items-baseline gap-x-6 gap-y-1 font-mono text-ink"
                style={{
                  left: model.formXMm * pxPerMm,
                  top: (model.formYMm + formHeightMm + 4) * pxPerMm,
                  width: model.formWidthMm * pxPerMm,
                  fontSize: metaFontPx,
                }}
              >
                {model.printDate.enabled && (
                  <span>Дата печати: {model.printDate.text}</span>
                )}
                {model.shipDate.enabled && (
                  <span className="inline-flex items-baseline gap-1">
                    {model.shipDate.label}
                    <span
                      className="inline-block border-b border-ink"
                      style={{ width: Math.max(40, model.formWidthMm * pxPerMm * 0.3) }}
                    />
                  </span>
                )}
              </div>
            )}

            {/* 3. ДОП. ШТРИХ-КОДЫ — ряд под мета-строкой, с переносом. */}
            {barcodeSrc && model.extraBarcodes.copies.length > 0 && (
              <div
                className="pointer-events-none absolute flex flex-wrap content-start gap-2"
                style={{
                  left: model.formXMm * pxPerMm,
                  top: (model.formYMm + formHeightMm + 4 + metaFontPx / pxPerMm + 4) * pxPerMm,
                  width: model.formWidthMm * pxPerMm,
                }}
              >
                {model.extraBarcodes.copies.map((copy) => (
                  <div
                    key={copy.id}
                    className="flex flex-col items-center gap-0.5"
                    style={{ width: copy.widthMm * pxPerMm }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={barcodeSrc}
                      alt={`Штрих-код ${copy.label}`}
                      className="block w-full"
                    />
                    <span className="font-mono leading-none text-muted-foreground" style={{ fontSize: Math.max(6, metaFontPx * 0.75) }}>
                      {copy.label} · {Math.round(copy.widthMm)} мм
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
