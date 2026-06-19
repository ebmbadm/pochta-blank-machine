"use client";

/**
 * ControlsPanel — вертикальная панель управления раскладкой бланка.
 * Потребляет EditorApi (см. @/state/useEditorState) и не держит своего
 * состояния, кроме самого api. Эстетика «почтовая точность»: моноширь для
 * всех чисел, почтовый синий — основной акцент, вермильон — только для
 * удаления/деструктивных действий.
 */

import { useId } from "react";
import {
  Crosshair,
  Download,
  Loader2,
  Plus,
  Printer,
  RotateCcw,
  X,
} from "lucide-react";
import { toast } from "sonner";

import type { EditorApi } from "@/state/useEditorState";
import {
  PARCEL_PRESETS,
  FORM_WIDTH_MIN_MM,
  FORM_WIDTH_MAX_MM,
  getPreset,
} from "@/lib/layout/presets";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

/** base-ui Slider отдаёт number | number[]; всегда приводим к одному числу. */
function coerceSlider(value: number | readonly number[]): number {
  return Array.isArray(value) ? value[0]! : (value as number);
}

interface ControlsPanelProps {
  api: EditorApi;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="stamp-label mb-3">{children}</h3>;
}

export function ControlsPanel({ api }: ControlsPanelProps) {
  const { model, exporting } = api;
  const widthInputId = useId();
  const trackingInputId = useId();

  const activePreset =
    model.preset === "custom" ? undefined : getPreset(model.preset);

  const handleExport = (action: "download" | "print") => {
    api.exportPdf(action).catch(() => toast.error("Не удалось создать PDF"));
  };

  return (
    <Card className="reg-marks animate-rise gap-0 py-0">
      <CardContent className="flex flex-col gap-5 px-4 py-5">
        {/* 1. РАЗМЕР ПОСЫЛКИ */}
        <section>
          <SectionHeading>Размер посылки</SectionHeading>
          <div className="grid grid-cols-3 gap-1.5">
            {PARCEL_PRESETS.map((p) => (
              <Button
                key={p.id}
                type="button"
                size="sm"
                variant={model.preset === p.id ? "default" : "outline"}
                onClick={() => api.selectPreset(p.id)}
                aria-pressed={model.preset === p.id}
                className="flex-col gap-0.5 py-5"
              >
                <span className="text-sm leading-tight">{p.title}</span>
                <span className="font-mono text-[0.65rem] opacity-70">
                  {p.formWidthMm} мм
                </span>
              </Button>
            ))}
          </div>
          <p className="mt-2 min-h-4 text-xs text-muted-foreground">
            {activePreset
              ? activePreset.hint
              : "своя ширина — настройте слайдером"}
          </p>
        </section>

        <Separator />

        {/* 2. ШИРИНА БЛАНКА */}
        <section>
          <SectionHeading>Ширина бланка</SectionHeading>
          <div className="flex items-center gap-3">
            <Slider
              className="grow"
              aria-label="Ширина бланка"
              min={FORM_WIDTH_MIN_MM}
              max={FORM_WIDTH_MAX_MM}
              step={1}
              value={model.formWidthMm}
              onValueChange={(v) => api.changeFormWidth(coerceSlider(v))}
            />
            <div className="flex shrink-0 items-center gap-1">
              <Input
                id={widthInputId}
                type="number"
                inputMode="numeric"
                min={FORM_WIDTH_MIN_MM}
                max={FORM_WIDTH_MAX_MM}
                aria-label="Ширина бланка в миллиметрах"
                value={model.formWidthMm}
                onChange={(e) => api.changeFormWidth(Number(e.target.value))}
                className="w-16 text-right font-mono tabular-nums"
              />
              <span className="font-mono text-xs text-muted-foreground">мм</span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => api.centerFormX()}
              className="shrink-0 text-postal-blue"
              title="Центрировать бланк по горизонтали"
            >
              <Crosshair />
              Центр
            </Button>
          </div>
        </section>

        <Separator />

        {/* 3. ТРЕК-НОМЕР */}
        <section>
          <SectionHeading>Трек-номер</SectionHeading>
          <Input
            id={trackingInputId}
            value={model.trackingNumber}
            onChange={(e) => api.setTrackingNumber(e.target.value)}
            placeholder="LS018350611RU"
            aria-label="Трек-номер"
            className="font-mono tracking-wider uppercase"
          />
          {model.trackingNumber.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              не найден в PDF — впишите вручную
            </p>
          )}
        </section>

        <Separator />

        {/* 4. ДОП. ШТРИХ-КОДЫ */}
        <section>
          <div className="flex items-center justify-between">
            <SectionHeading>Доп. штрих-коды</SectionHeading>
            <Switch
              checked={model.extraBarcodes.enabled}
              onCheckedChange={(checked) => api.toggleExtraBarcodes(checked)}
              aria-label="Дополнительные штрих-коды"
              className="mb-3"
            />
          </div>

          {model.extraBarcodes.enabled && (
            <div className="flex flex-col gap-3">
              {model.extraBarcodes.copies.map((copy) => (
                <div key={copy.id} className="flex items-center gap-2.5">
                  <Badge
                    variant="outline"
                    className="w-7 shrink-0 justify-center font-mono"
                  >
                    {copy.label}
                  </Badge>
                  <Slider
                    className="grow"
                    aria-label={`Ширина копии ${copy.label}`}
                    min={15}
                    max={190}
                    step={1}
                    value={copy.widthMm}
                    onValueChange={(v) =>
                      api.setBarcodeWidth(copy.id, coerceSlider(v))
                    }
                  />
                  <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {copy.widthMm} мм
                  </span>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => api.removeBarcodeCopy(copy.id)}
                    aria-label={`Удалить копию ${copy.label}`}
                    className="shrink-0 text-postal-red hover:bg-destructive/10 hover:text-postal-red"
                  >
                    <X />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => api.addBarcodeCopy()}
                className="self-start"
              >
                <Plus />
                Добавить размер
              </Button>
            </div>
          )}
        </section>

        <Separator />

        {/* 5. ДАТЫ */}
        <section>
          <SectionHeading>Даты</SectionHeading>
          <div className="flex flex-col gap-3">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-baseline gap-2">
                Дата печати
                {model.printDate.text && (
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {model.printDate.text}
                  </span>
                )}
              </span>
              <Switch
                checked={model.printDate.enabled}
                onCheckedChange={(checked) => api.togglePrintDate(checked)}
                aria-label="Дата печати"
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Поле для даты отправки</span>
              <Switch
                checked={model.shipDate.enabled}
                onCheckedChange={(checked) => api.toggleShipDate(checked)}
                aria-label="Поле для даты отправки"
              />
            </label>
          </div>
        </section>
      </CardContent>

      <CardFooter className="sticky bottom-0 flex flex-col gap-2 border-t bg-muted/70 backdrop-blur-sm">
        <div className="flex w-full gap-2">
          <Button
            type="button"
            variant="default"
            onClick={() => handleExport("download")}
            disabled={exporting}
            className="grow"
          >
            {exporting ? <Loader2 className="animate-spin" /> : <Download />}
            Скачать PDF
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleExport("print")}
            disabled={exporting}
            className="grow"
          >
            {exporting ? <Loader2 className="animate-spin" /> : <Printer />}
            Печать
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => api.reset()}
          disabled={exporting}
          className="self-start text-muted-foreground"
        >
          <RotateCcw />
          Другой бланк
        </Button>
      </CardFooter>
    </Card>
  );
}

export default ControlsPanel;
