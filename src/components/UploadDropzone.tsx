"use client";

/**
 * Стартовый экран: приём PDF-бланка Почты России.
 * Показывается, пока редактор не готов (status !== "ready"):
 * пустое состояние (drag&drop + выбор файла), загрузка и ошибка.
 */

import { useCallback, useRef, useState } from "react";
import {
  Stamp,
  Upload,
  Loader2,
  FileWarning,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

import type { EditorApi } from "@/state/useEditorState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface UploadDropzoneProps {
  api: EditorApi;
}

const FEATURE_CHIPS = [
  "Размер под посылку",
  "Доп. штрих-коды",
  "Дата печати + поле от руки",
] as const;

function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

export function UploadDropzone({ api }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  // счётчик dragenter/dragleave: вложенные элементы шлют события вверх,
  // поэтому считаем глубину, чтобы подсветка не мигала.
  const dragDepth = useRef(0);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!isPdf(file)) {
        toast.error("Нужен PDF-файл бланка Почты России");
        return;
      }
      await api.loadFile(file);
    },
    [api],
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      void handleFile(e.target.files?.[0]);
      // позволяем выбрать тот же файл повторно
      e.target.value = "";
    },
    [handleFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      void handleFile(e.dataTransfer.files?.[0]);
    },
    [handleFile],
  );

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const onDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }, []);

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  const isLoading = api.status === "loading";
  const isError = api.status === "error";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-10 sm:py-16">
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        role="button"
        tabIndex={0}
        aria-label="Загрузить PDF-бланк"
        aria-busy={isLoading}
        onClick={isLoading ? undefined : openPicker}
        onKeyDown={(e) => {
          if (isLoading) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        className={cn(
          "reg-marks animate-rise group relative w-full cursor-pointer overflow-hidden rounded-2xl bg-card p-8 text-center ring-1 ring-foreground/10 transition-colors sm:p-12",
          "border-2 border-dashed border-border outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring",
          dragging && "border-postal-blue bg-accent/40",
          isLoading && "cursor-wait",
        )}
      >
        {/* авиапочтовая акцентная полоса сверху */}
        <div className="airmail-border absolute inset-x-0 top-0 h-1" aria-hidden />

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={onInputChange}
        />

        {isLoading ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <span className="flex size-20 items-center justify-center rounded-full bg-postal-blue/10">
              <Loader2 className="size-9 animate-spin text-postal-blue" />
            </span>
            <p className="text-lg font-medium">Читаю бланк…</p>
            <p className="stamp-label">POCHTA.RU · CN 22 · ЛИСТ A4</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-5">
            <span
              className={cn(
                "flex size-20 items-center justify-center rounded-full bg-postal-blue/10 ring-1 ring-postal-blue/20 transition-transform",
                "group-hover:scale-105",
                dragging && "scale-110",
              )}
            >
              <Stamp className="size-9 text-postal-blue" />
            </span>

            <div className="space-y-1.5">
              <h2 className="text-2xl font-semibold tracking-tight">
                Перетащите PDF-бланк сюда
              </h2>
              <p className="stamp-label">POCHTA.RU · CN 22 · ЛИСТ A4</p>
            </div>

            <Button
              type="button"
              size="lg"
              onClick={(e) => {
                e.stopPropagation();
                openPicker();
              }}
            >
              <Upload />
              Выбрать файл
            </Button>

            <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
              {FEATURE_CHIPS.map((chip) => (
                <Badge key={chip} variant="secondary">
                  {chip}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {isError && (
        <div className="animate-rise mt-5 w-full space-y-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-left text-destructive">
          <div className="flex items-start gap-2.5">
            <FileWarning className="mt-0.5 size-5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Не удалось прочитать бланк</p>
              <p className="text-sm text-destructive/90">
                {api.error ?? "Неизвестная ошибка."}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (inputRef.current) inputRef.current.value = "";
              api.reset();
            }}
          >
            <RotateCcw />
            Попробовать снова
          </Button>
        </div>
      )}
    </div>
  );
}

export default UploadDropzone;
