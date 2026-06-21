"use client";

/**
 * LabelSection — секция печати трек-кода на термоэтикетке. Потребляет EditorApi.
 * Пресеты размера + ручной ввод Ш×В, мини-предпросмотр (SVG-штрихкод в пропорции
 * этикетки), индикатор читаемости (X-dimension) и кнопки печати/скачивания.
 */
import { useId, useMemo } from "react";
import { Download, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";

import type { EditorApi } from "@/state/useEditorState";
import { LABEL_PRESETS, LABEL_MIN_MM, LABEL_MAX_MM } from "@/lib/layout/labelPresets";
import { barcodeToSvg, validateBarcodeValue } from "@/lib/barcode/generateBarcode";
import { captureBarcodeGeometry } from "@/lib/barcode/barcodeGeometry";
import {
  computeXDimensionMm,
  classifyReadability,
  type Readability,
} from "@/lib/render/exportLabelPdf";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const READABILITY_UI: Record<Readability, { text: string; className: string }> = {
  good: { text: "хорошо", className: "text-emerald-600" },
  marginal: { text: "на грани", className: "text-amber-600" },
  poor: { text: "мелко, может не сканироваться", className: "text-postal-red" },
};

interface LabelSectionProps {
  api: EditorApi;
}

export function LabelSection({ api }: LabelSectionProps) {
  const { model, exporting } = api;
  const widthId = useId();
  const heightId = useId();

  const tracking = model.trackingNumber;
  const valid = tracking.length > 0 && validateBarcodeValue(tracking).ok;

  const barcodeSvg = useMemo(() => {
    if (!valid) return null;
    try {
      return barcodeToSvg(tracking, { includeText: true });
    } catch {
      return null;
    }
  }, [tracking, valid]);

  const barcodeSrc = barcodeSvg
    ? "data:image/svg+xml;utf8," + encodeURIComponent(barcodeSvg)
    : null;

  const readability = useMemo(() => {
    if (!valid) return null;
    try {
      const geom = captureBarcodeGeometry(tracking);
      const xDim = computeXDimensionMm(model.label.widthMm, geom.moduleCount);
      return { xDim, level: classifyReadability(xDim) };
    } catch {
      return null;
    }
  }, [tracking, valid, model.label.widthMm]);

  const handlePrint = (action: "download" | "print") => {
    api.printLabel(action).catch(() => toast.error("Не удалось создать этикетку"));
  };

  return (
    <section>
      <h3 className="stamp-label mb-3">Этикетка (термопринтер)</h3>

      {/* Пресеты размера */}
      <div className="grid grid-cols-3 gap-1.5">
        {LABEL_PRESETS.map((p) => (
          <Button
            key={p.id}
            type="button"
            size="sm"
            variant={model.label.preset === p.id ? "default" : "outline"}
            onClick={() => api.setLabelPreset(p.id)}
            aria-pressed={model.label.preset === p.id}
            className="py-4 font-mono text-xs"
          >
            {p.title}
          </Button>
        ))}
      </div>

      {/* Ручной ввод Ш×В */}
      <div className="mt-3 flex items-center gap-2">
        <label htmlFor={widthId} className="text-xs text-muted-foreground">
          Ш
        </label>
        <Input
          id={widthId}
          type="number"
          inputMode="numeric"
          min={LABEL_MIN_MM}
          max={LABEL_MAX_MM}
          aria-label="Ширина этикетки в миллиметрах"
          value={model.label.widthMm}
          onChange={(e) => api.setLabelSize(Number(e.target.value), model.label.heightMm)}
          className="w-16 text-right font-mono tabular-nums"
        />
        <span className="text-xs text-muted-foreground">×</span>
        <label htmlFor={heightId} className="text-xs text-muted-foreground">
          В
        </label>
        <Input
          id={heightId}
          type="number"
          inputMode="numeric"
          min={LABEL_MIN_MM}
          max={LABEL_MAX_MM}
          aria-label="Высота этикетки в миллиметрах"
          value={model.label.heightMm}
          onChange={(e) => api.setLabelSize(model.label.widthMm, Number(e.target.value))}
          className="w-16 text-right font-mono tabular-nums"
        />
        <span className="font-mono text-xs text-muted-foreground">мм</span>
      </div>

      {/* Мини-предпросмотр в пропорции этикетки */}
      <div className="mt-3">
        <div
          className="mx-auto flex items-center justify-center overflow-hidden rounded-sm border border-foreground/15 bg-white p-[6%]"
          style={{
            aspectRatio: `${model.label.widthMm} / ${model.label.heightMm}`,
            maxWidth: "min(100%, 260px)",
          }}
        >
          {barcodeSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={barcodeSrc}
              alt={`Штрих-код ${tracking}`}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="text-xs text-muted-foreground">введите трек-номер</span>
          )}
        </div>
      </div>

      {/* Индикатор читаемости */}
      {readability && (
        <p className="mt-2 text-center text-xs">
          <Badge variant="outline" className="font-mono">
            X-dim ≈ {readability.xDim.toFixed(2)} мм
          </Badge>{" "}
          <span className={READABILITY_UI[readability.level].className}>
            {READABILITY_UI[readability.level].text}
          </span>
        </p>
      )}

      {/* Кнопки */}
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant="default"
          onClick={() => handlePrint("print")}
          disabled={!valid || exporting}
          className="grow"
        >
          {exporting ? <Loader2 className="animate-spin" /> : <Printer />}
          Печать этикетки
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => handlePrint("download")}
          disabled={!valid || exporting}
        >
          {exporting ? <Loader2 className="animate-spin" /> : <Download />}
          Скачать
        </Button>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        В диалоге печати выберите принтер LABEL-9X00 и масштаб 100% / реальный размер.
      </p>
    </section>
  );
}

export default LabelSection;
