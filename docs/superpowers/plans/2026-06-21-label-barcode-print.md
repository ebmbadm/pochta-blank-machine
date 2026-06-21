# Печать трек-кода на термоэтикетке — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить печать штрих-кода Почты России (Code 128 трек-номера S10) на отдельной термоэтикетке точного размера под этикеточный принтер.

**Architecture:** Одностраничный PDF точно в размер этикетки (мм). Штрихи рисуются ВЕКТОРОМ: drawing-интерфейс bwip-js (`render` из node-сборки, `includetext:false`) собирает прямоугольники штрихов, которые `exportLabelPdf` неравномерно вписывает в этикетку (ширина = весь модуль для максимального X-dimension, высота штрихов — отдельно) и рисует как `drawRectangle` в pdf-lib. Человекочитаемый номер рисуется отдельно встроенным DejaVu по центру под штрихами. Печать/скачивание — тем же механизмом, что A4-экспорт (`window.open→print` / `<a download>`). Размер этикетки настраивается в UI (пресеты + ручной ввод) и сохраняется в localStorage-prefs.

**Tech Stack:** Next.js 16 (App Router, client-only), TypeScript, pdf-lib + @pdf-lib/fontkit, bwip-js (node-сборка), Tailwind v4 + shadcn/ui, vitest + @testing-library/react.

**Spec:** [`docs/superpowers/specs/2026-06-21-pochta-label-print-design.md`](../specs/2026-06-21-pochta-label-print-design.md)

**Проверенные факты API (эмпирически):**
- `bwip-js/node` экспортирует `render`, `fixupOptions`, `toSVG`, `toBuffer` и типы `DrawingContext<T>`, `RenderOptions`.
- `render(opts, ctx)` работает БЕЗ предварительного `fixupOptions`.
- Для `{ bcid:'code128', text:'LS018350611RU', scale:2, height:10, includetext:false }`: `init` даёт `widthPx≈312, heightPx≈57`, `line` вызывается для каждого чёрного штриха (>20). `moduleCount = round(widthPx/scale) ≈ 156`.
- Координаты bwip-js: начало сверху-слева, ось Y вниз (как LayoutModel). pdf-lib: снизу-слева, ось Y вверх — перевод в `composeLabelPdf`.

**Конвенции проекта:**
- Тесты лежат рядом с модулем (`*.test.ts(x)`). Запуск: `npm run test` (vitest run, jsdom).
- Импорты через алиас `@/…`. Комментарии и UI-тексты на русском.
- Каждая задача завершается коммитом. Trailer коммитов:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Task 1: Модель — `LabelConfig` в `LayoutModel`

**Files:**
- Modify: `src/lib/layout/layoutModel.ts`
- Test: `src/lib/layout/layoutModel.test.ts` (создать, если нет; иначе добавить блок)

- [ ] **Step 1: Тест — `createDefaultLayout` содержит дефолт этикетки**

Создать `src/lib/layout/layoutModel.test.ts` (если файла нет):

```ts
import { describe, it, expect } from "vitest";
import { createDefaultLayout } from "./layoutModel";

describe("createDefaultLayout label", () => {
  it("включает дефолтную конфигурацию этикетки 58×40", () => {
    const m = createDefaultLayout();
    expect(m.label).toEqual({ preset: "58x40", widthMm: 58, heightMm: 40 });
  });
});
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `npm run test -- src/lib/layout/layoutModel.test.ts`
Expected: FAIL (`m.label` is undefined / тип не содержит `label`).

- [ ] **Step 3: Реализация — типы + поле + дефолт**

В `src/lib/layout/layoutModel.ts` добавить ПОСЛЕ строки `export type ParcelPreset = ...`:

```ts
export type LabelPreset = "100x150" | "58x40" | "40x30" | "custom";

/** Конфигурация термоэтикетки (размер рулона + выбранный пресет). */
export interface LabelConfig {
  preset: LabelPreset;
  widthMm: number;
  heightMm: number;
}
```

В интерфейсе `LayoutModel` добавить поле (после `extraBarcodes: ExtraBarcodes;`):

```ts
  /** Настройки печати штрих-кода на термоэтикетке. */
  label: LabelConfig;
```

В `createDefaultLayout`, в возвращаемый объект (после блока `extraBarcodes: { ... }`), добавить:

```ts
    label: { preset: "58x40", widthMm: 58, heightMm: 40 },
```

- [ ] **Step 4: Запустить тесты — должны пройти (включая существующие)**

Run: `npm run test -- src/lib/layout/ && npm run typecheck`
Expected: PASS. Существующие тесты не ломаются — все моки модели используют `createDefaultLayout`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/layout/layoutModel.ts src/lib/layout/layoutModel.test.ts
git commit -m "$(printf 'Модель: добавить LabelConfig в LayoutModel\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: Пресеты этикеток — `labelPresets.ts`

**Files:**
- Create: `src/lib/layout/labelPresets.ts`
- Test: `src/lib/layout/labelPresets.test.ts`

- [ ] **Step 1: Тест**

```ts
import { describe, it, expect } from "vitest";
import { createDefaultLayout } from "@/lib/layout/layoutModel";
import {
  applyLabelPreset,
  setLabelSizeOnModel,
  matchLabelPreset,
  LABEL_PRESETS,
  LABEL_MIN_MM,
  LABEL_MAX_MM,
} from "./labelPresets";

describe("labelPresets", () => {
  it("LABEL_PRESETS содержит три размера", () => {
    expect(LABEL_PRESETS.map((p) => p.id)).toEqual(["100x150", "58x40", "40x30"]);
  });
  it("applyLabelPreset проставляет ширину/высоту из пресета", () => {
    const m = applyLabelPreset(createDefaultLayout(), "100x150");
    expect(m.label).toEqual({ preset: "100x150", widthMm: 100, heightMm: 150 });
  });
  it("setLabelSizeOnModel обрезает диапазон и переходит в custom", () => {
    const m = setLabelSizeOnModel(createDefaultLayout(), 5, 9999);
    expect(m.label.widthMm).toBe(LABEL_MIN_MM);
    expect(m.label.heightMm).toBe(LABEL_MAX_MM);
    expect(m.label.preset).toBe("custom");
  });
  it("setLabelSizeOnModel распознаёт совпадение с пресетом", () => {
    const m = setLabelSizeOnModel(createDefaultLayout(), 58, 40);
    expect(m.label.preset).toBe("58x40");
  });
  it("matchLabelPreset → custom для нестандартного размера", () => {
    expect(matchLabelPreset(57, 41)).toBe("custom");
  });
});
```

- [ ] **Step 2: Запустить — упадёт (модуль не существует)**

Run: `npm run test -- src/lib/layout/labelPresets.test.ts`
Expected: FAIL (cannot find module).

- [ ] **Step 3: Реализация**

```ts
/**
 * Пресеты размера термоэтикетки + ручной ввод (мм). По образцу presets.ts.
 * Работают над LayoutModel.label, возвращают НОВЫЙ объект (без мутаций).
 */
import type { LabelPreset, LayoutModel } from "@/lib/layout/layoutModel";

export interface LabelPresetDef {
  id: Exclude<LabelPreset, "custom">;
  title: string;
  widthMm: number;
  heightMm: number;
}

export const LABEL_PRESETS: LabelPresetDef[] = [
  { id: "100x150", title: "100 × 150", widthMm: 100, heightMm: 150 },
  { id: "58x40", title: "58 × 40", widthMm: 58, heightMm: 40 },
  { id: "40x30", title: "40 × 30", widthMm: 40, heightMm: 30 },
];

export const LABEL_MIN_MM = 20;
export const LABEL_MAX_MM = 200;

export function getLabelPreset(id: LabelPreset): LabelPresetDef | undefined {
  return LABEL_PRESETS.find((p) => p.id === id);
}

function clampMm(v: number): number {
  if (!Number.isFinite(v)) return LABEL_MIN_MM;
  return Math.min(LABEL_MAX_MM, Math.max(LABEL_MIN_MM, Math.round(v)));
}

/** Подобрать id пресета по точному совпадению размеров, иначе "custom". */
export function matchLabelPreset(widthMm: number, heightMm: number): LabelPreset {
  const m = LABEL_PRESETS.find(
    (p) => Math.abs(p.widthMm - widthMm) < 0.5 && Math.abs(p.heightMm - heightMm) < 0.5,
  );
  return m ? m.id : "custom";
}

export function applyLabelPreset(model: LayoutModel, id: LabelPreset): LayoutModel {
  const preset = getLabelPreset(id);
  if (!preset) return { ...model, label: { ...model.label, preset: "custom" } };
  return {
    ...model,
    label: { preset: id, widthMm: preset.widthMm, heightMm: preset.heightMm },
  };
}

export function setLabelSizeOnModel(
  model: LayoutModel,
  widthMm: number,
  heightMm: number,
): LayoutModel {
  const w = clampMm(widthMm);
  const h = clampMm(heightMm);
  return { ...model, label: { preset: matchLabelPreset(w, h), widthMm: w, heightMm: h } };
}
```

- [ ] **Step 4: Запустить — пройдёт**

Run: `npm run test -- src/lib/layout/labelPresets.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/layout/labelPresets.ts src/lib/layout/labelPresets.test.ts
git commit -m "$(printf 'Пресеты термоэтикеток (labelPresets)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: Векторная геометрия штрих-кода — `barcodeGeometry.ts`

**Files:**
- Create: `src/lib/barcode/barcodeGeometry.ts`
- Test: `src/lib/barcode/barcodeGeometry.test.ts`

- [ ] **Step 1: Тест**

```ts
import { describe, it, expect } from "vitest";
import { captureBarcodeGeometry } from "./barcodeGeometry";

describe("captureBarcodeGeometry", () => {
  it("возвращает непустые штрихи и вменяемый moduleCount для S10", () => {
    const g = captureBarcodeGeometry("LS018350611RU");
    expect(g.bars.length).toBeGreaterThan(20);
    expect(g.widthPx).toBeGreaterThan(0);
    expect(g.heightPx).toBeGreaterThan(0);
    // Code 128 для 13-символьного S10 — ~140–180 модулей.
    expect(g.moduleCount).toBeGreaterThan(120);
    expect(g.moduleCount).toBeLessThan(200);
  });
  it("все штрихи внутри захваченных границ", () => {
    const g = captureBarcodeGeometry("LS018350611RU");
    for (const b of g.bars) {
      expect(b.x).toBeGreaterThanOrEqual(-0.01);
      expect(b.x + b.w).toBeLessThanOrEqual(g.widthPx + 0.01);
      expect(b.h).toBeGreaterThan(0);
    }
  });
  it("бросает на невалидном (не-ASCII) значении", () => {
    expect(() => captureBarcodeGeometry("Дата")).toThrow();
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `npm run test -- src/lib/barcode/barcodeGeometry.test.ts`
Expected: FAIL (cannot find module).

- [ ] **Step 3: Реализация**

```ts
/**
 * Захват ВЕКТОРНОЙ геометрии Code 128 для отрисовки штрихов в pdf-lib.
 *
 * Использует drawing-интерфейс bwip-js (node-сборка — без canvas/DOM, как
 * barcodeToSvg): `render` вызывает `line()` для каждого штриха, мы собираем
 * прямоугольники в собственных px bwip-js (начало сверху-слева, ось Y вниз).
 * `includetext:false` — подпись номера рисуется отдельно (DejaVu) в exportLabelPdf.
 *
 * Чистая, работает в Node (тесты) и в браузере (для индикатора читаемости).
 */
import { render, type DrawingContext, type RenderOptions } from "bwip-js/node";
import { validateBarcodeValue } from "@/lib/barcode/generateBarcode";

/** Прямоугольник одного штриха (px bwip-js, начало сверху-слева). */
export interface BarRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BarcodeGeometry {
  /** Полная ширина символа, px bwip-js. */
  widthPx: number;
  /** Полная высота штрихов, px bwip-js (без подписи). */
  heightPx: number;
  /** Число модулей (widthPx / scale) — для расчёта X-dimension. */
  moduleCount: number;
  bars: BarRect[];
}

/** px на модуль при захвате. Геометрия относительная, абсолютное значение не важно. */
const CAPTURE_SCALE = 2;

export function captureBarcodeGeometry(value: string): BarcodeGeometry {
  const check = validateBarcodeValue(value);
  if (!check.ok) {
    throw new Error(`Невозможно сгенерировать штрих-код: ${check.error}`);
  }

  const bars: BarRect[] = [];
  let widthPx = 0;
  let heightPx = 0;

  const ctx: DrawingContext<BarcodeGeometry> = {
    scale: () => null,
    measure: (str, _font, fwidth, fheight) => ({
      width: str.length * fwidth * 0.6,
      ascent: fheight * 0.75,
      descent: fheight * 0.25,
    }),
    init: (w, h) => {
      widthPx = w;
      heightPx = h;
    },
    line: (x0, y0, x1, y1, lw) => {
      bars.push({
        x: Math.min(x0, x1) - lw / 2,
        y: Math.min(y0, y1),
        w: lw,
        h: Math.abs(y1 - y0),
      });
    },
    polygon: () => {},
    hexagon: () => {},
    ellipse: () => {},
    fill: () => {},
    text: () => {},
    end: () => ({
      widthPx,
      heightPx,
      moduleCount: Math.round(widthPx / CAPTURE_SCALE),
      bars,
    }),
  };

  const opts: RenderOptions = {
    bcid: "code128",
    text: value,
    scale: CAPTURE_SCALE,
    height: 10,
    includetext: false,
  };

  return render(opts, ctx);
}
```

- [ ] **Step 4: Запустить — пройдёт**

Run: `npm run test -- src/lib/barcode/barcodeGeometry.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/barcode/barcodeGeometry.ts src/lib/barcode/barcodeGeometry.test.ts
git commit -m "$(printf 'Векторная геометрия штрих-кода (barcodeGeometry)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 4: Раскладка этикетки и индикатор — чистые функции `exportLabelPdf.ts`

**Files:**
- Create: `src/lib/render/exportLabelPdf.ts` (в этой задаче — только чистые функции)
- Test: `src/lib/render/exportLabelPdf.test.ts`

- [ ] **Step 1: Тест (чистые функции)**

```ts
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
```

- [ ] **Step 2: Запустить — упадёт**

Run: `npm run test -- src/lib/render/exportLabelPdf.test.ts`
Expected: FAIL (cannot find module).

- [ ] **Step 3: Реализация (чистые функции + типы)**

Создать `src/lib/render/exportLabelPdf.ts` со следующим содержимым (функция `composeLabelPdf` добавится в Task 5):

```ts
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
import { clamp } from "@/lib/units";
import type { BarcodeGeometry } from "@/lib/barcode/barcodeGeometry";

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
```

- [ ] **Step 4: Запустить — пройдёт**

Run: `npm run test -- src/lib/render/exportLabelPdf.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/render/exportLabelPdf.ts src/lib/render/exportLabelPdf.test.ts
git commit -m "$(printf 'Раскладка этикетки и индикатор читаемости (чистые функции)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 5: Сборка PDF этикетки — `composeLabelPdf`

**Files:**
- Modify: `src/lib/render/exportLabelPdf.ts` (добавить `composeLabelPdf`)
- Test: `src/lib/render/exportLabelPdf.test.ts` (добавить integration-блок)

- [ ] **Step 1: Тест (интеграция, Node)**

Добавить в конец `src/lib/render/exportLabelPdf.test.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { mmToPt } from "@/lib/units";
import { composeLabelPdf } from "./exportLabelPdf";

describe("composeLabelPdf (интеграция, Node)", () => {
  const regular = new Uint8Array(fs.readFileSync(path.resolve("public/fonts/DejaVuSans.ttf")));
  const bold = new Uint8Array(fs.readFileSync(path.resolve("public/fonts/DejaVuSans-Bold.ttf")));

  it("делает одностраничный PDF точно в размер этикетки", async () => {
    const bytes = await composeLabelPdf({
      trackingNumber: "LS018350611RU",
      label: { widthMm: 58, heightMm: 40 },
      fonts: { regular, bold },
    });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(1000);

    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(1);
    const { width, height } = reloaded.getPage(0).getSize();
    expect(width).toBeCloseTo(mmToPt(58), 1);
    expect(height).toBeCloseTo(mmToPt(40), 1);
  });

  it("бросает на невалидном трек-номере", async () => {
    await expect(
      composeLabelPdf({
        trackingNumber: "Дата",
        label: { widthMm: 58, heightMm: 40 },
        fonts: { regular, bold },
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Запустить — упадёт (`composeLabelPdf` не экспортирован)**

Run: `npm run test -- src/lib/render/exportLabelPdf.test.ts`
Expected: FAIL.

- [ ] **Step 3: Реализация — добавить `composeLabelPdf` в `exportLabelPdf.ts`**

Дополнить импорты в начале файла:

```ts
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { clamp, mmToPt } from "@/lib/units";
import { captureBarcodeGeometry, type BarcodeGeometry } from "@/lib/barcode/barcodeGeometry";
```

(Заменяет прежнюю строку `import { clamp } from "@/lib/units";` и прежний `import type { BarcodeGeometry } ...` — теперь `captureBarcodeGeometry` и `BarcodeGeometry` берутся вместе.)

Добавить в конец файла:

```ts
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
```

Примечание: если линтер ругается на неиспользуемый `clamp` — он используется в `computeLabelLayout`; импорт оставить.

- [ ] **Step 4: Запустить — пройдёт**

Run: `npm run test -- src/lib/render/exportLabelPdf.test.ts && npm run typecheck`
Expected: PASS (оба блока — чистый и интеграционный).

- [ ] **Step 5: Commit**

```bash
git add src/lib/render/exportLabelPdf.ts src/lib/render/exportLabelPdf.test.ts
git commit -m "$(printf 'Сборка PDF этикетки composeLabelPdf (вектор + номер DejaVu)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 6: Состояние — prefs + методы `setLabelPreset` / `setLabelSize` / `printLabel`

**Files:**
- Modify: `src/state/useEditorState.ts`

- [ ] **Step 1: Импорты + расширить `EditorApi`**

В блоке импортов добавить:

```ts
import { applyLabelPreset, setLabelSizeOnModel } from "@/lib/layout/labelPresets";
import { composeLabelPdf } from "@/lib/render/exportLabelPdf";
import { validateBarcodeValue } from "@/lib/barcode/generateBarcode";
```

В импорте типов из `@/lib/layout/layoutModel` добавить `type LabelPreset` (к существующим `LayoutModel`, `FormRegion`, `ParcelPreset`).

В интерфейс `EditorApi` добавить (после `removeBarcodeCopy(id: string): void;`):

```ts
  setLabelPreset(id: LabelPreset): void;
  setLabelSize(widthMm: number, heightMm: number): void;
  printLabel(action: "download" | "print"): Promise<void>;
```

- [ ] **Step 2: Расширить `Prefs` + чтение/запись**

В `interface Prefs` добавить:

```ts
  labelPreset: LabelPreset;
  labelWidthMm: number;
  labelHeightMm: number;
```

В `writePrefs`, в объект `prefs`, добавить:

```ts
      labelPreset: model.label.preset,
      labelWidthMm: model.label.widthMm,
      labelHeightMm: model.label.heightMm,
```

В `buildInitialModel`, ВНУТРИ блока `if (prefs) { ... }` (после блока, где формируется `extraBarcodes`), добавить восстановление этикетки:

```ts
    if (prefs.labelPreset && prefs.labelPreset !== "custom") {
      model = applyLabelPreset(model, prefs.labelPreset);
    } else if (
      typeof prefs.labelWidthMm === "number" &&
      typeof prefs.labelHeightMm === "number"
    ) {
      model = setLabelSizeOnModel(model, prefs.labelWidthMm, prefs.labelHeightMm);
    }
```

- [ ] **Step 3: Методы + возврат**

Рядом с другими `useCallback` (перед `exportPdf`) добавить:

```ts
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
```

В возвращаемом объекте (рядом с `exportPdf,`) добавить:

```ts
    setLabelPreset,
    setLabelSize,
    printLabel,
```

- [ ] **Step 4: Проверка типов + существующих тестов**

Run: `npm run typecheck && npm run test`
Expected: typecheck PASS. Тест `ControlsPanel.test.tsx` пока МОЖЕТ упасть только если LabelSection уже подключён — он подключается в Task 8, поэтому сейчас всё зелёное. Если красный — смотреть сообщение.

- [ ] **Step 5: Commit**

```bash
git add src/state/useEditorState.ts
git commit -m "$(printf 'Состояние: prefs этикетки + setLabelPreset/setLabelSize/printLabel\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 7: UI — компонент `LabelSection`

**Files:**
- Create: `src/components/LabelSection.tsx`
- Test: `src/components/LabelSection.test.tsx`

- [ ] **Step 1: Тест**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LabelSection } from "@/components/LabelSection";
import { createDefaultLayout } from "@/lib/layout/layoutModel";
import type { EditorApi } from "@/state/useEditorState";

function makeApi(overrides: Partial<EditorApi> = {}): EditorApi {
  return {
    model: createDefaultLayout({ trackingNumber: "LS018350611RU" }),
    exporting: false,
    setLabelPreset: vi.fn(),
    setLabelSize: vi.fn(),
    printLabel: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as EditorApi;
}

describe("LabelSection", () => {
  it("рендерит пресеты размеров этикетки", () => {
    render(<LabelSection api={makeApi()} />);
    expect(screen.getByText("100 × 150")).toBeInTheDocument();
    expect(screen.getByText("58 × 40")).toBeInTheDocument();
    expect(screen.getByText("40 × 30")).toBeInTheDocument();
  });

  it("вызывает printLabel('print') по кнопке печати", () => {
    const api = makeApi();
    render(<LabelSection api={api} />);
    fireEvent.click(screen.getByRole("button", { name: /Печать этикетки/i }));
    expect(api.printLabel).toHaveBeenCalledWith("print");
  });

  it("блокирует кнопки без валидного трек-номера", () => {
    const api = makeApi({ model: createDefaultLayout({ trackingNumber: "" }) });
    render(<LabelSection api={api} />);
    expect(screen.getByRole("button", { name: /Печать этикетки/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `npm run test -- src/components/LabelSection.test.tsx`
Expected: FAIL (cannot find module).

- [ ] **Step 3: Реализация**

```tsx
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
```

- [ ] **Step 4: Запустить — пройдёт**

Run: `npm run test -- src/components/LabelSection.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/LabelSection.tsx src/components/LabelSection.test.tsx
git commit -m "$(printf 'UI: секция Этикетка (LabelSection) — пресеты, предпросмотр, печать\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 8: Встроить `LabelSection` в `ControlsPanel` + починить мок теста

**Files:**
- Modify: `src/components/ControlsPanel.tsx`
- Modify: `src/components/ControlsPanel.test.tsx`

- [ ] **Step 1: Обновить мок api в `ControlsPanel.test.tsx`**

В `makeApi` (в объект, после `removeBarcodeCopy: vi.fn(),`) добавить:

```ts
    setLabelPreset: vi.fn(),
    setLabelSize: vi.fn(),
    printLabel: vi.fn().mockResolvedValue(undefined),
```

Добавить тест, что секция этикетки отрисовалась:

```ts
  it("renders the label section", () => {
    render(<ControlsPanel api={makeApi()} />);
    expect(screen.getByText("Этикетка (термопринтер)")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Печать этикетки/i }),
    ).toBeInTheDocument();
  });
```

- [ ] **Step 2: Запустить — новый тест упадёт (секции ещё нет)**

Run: `npm run test -- src/components/ControlsPanel.test.tsx`
Expected: FAIL на новом тесте («Этикетка (термопринтер)» не найдено).

- [ ] **Step 3: Подключить `LabelSection` в `ControlsPanel.tsx`**

Добавить импорт рядом с другими компонентами:

```tsx
import { LabelSection } from "@/components/LabelSection";
```

В разметке, ПОСЛЕ закрывающего `</section>` секции «5. ДАТЫ» и ПЕРЕД закрывающим `</CardContent>`, добавить:

```tsx
        <Separator />

        {/* 6. ЭТИКЕТКА (ТЕРМОПРИНТЕР) */}
        <LabelSection api={api} />
```

(`Separator` уже импортирован в файле.)

- [ ] **Step 4: Запустить — пройдёт**

Run: `npm run test -- src/components/ControlsPanel.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ControlsPanel.tsx src/components/ControlsPanel.test.tsx
git commit -m "$(printf 'Встроить секцию Этикетка в ControlsPanel\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 9: Финальная проверка (типы, линт, тесты, сборка)

**Files:** —

- [ ] **Step 1: Полный прогон**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: всё зелёное. Если линт ругается на `<img>` в LabelSection — там уже стоит `eslint-disable-next-line @next/next/no-img-element` (как в PreviewCanvas).

- [ ] **Step 2: Продакшн-сборка**

Run: `npm run build`
Expected: успешная сборка (next build, статический экспорт).

- [ ] **Step 3: Ручная проверка в браузере (preview)**

Запустить dev-сервер, загрузить `samples/sample-blank.pdf`, в секции «Этикетка»:
- переключить пресеты 100×150 / 58×40 / 40×30 — предпросмотр меняет пропорции;
- ввести размеры вручную — пресет переходит в «custom», значения обрезаются в [20; 200];
- индикатор X-dim меняет цвет (100×150 → зелёный, 40×30 → красный);
- «Скачать» — скачивается `pochta-label-<номер>.pdf` размером строго в этикетку;
- «Печать этикетки» — открывается системный диалог печати.

- [ ] **Step 4: Финальный commit (если были правки на шаге 3)**

```bash
git add -A
git commit -m "$(printf 'Печать этикеток: финальная проверка и правки\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Самопроверка плана

**Покрытие спеки:**
- Размер настраивается (пресеты + ручной ввод) → Task 2, 7.
- Содержимое: штрих-код + номер → Task 3, 5 (вектор + DejaVu).
- UI-секция «Этикетка» → Task 7, 8.
- Подход A1 (вектор в PDF точно в размер) → Task 3, 5.
- Индикатор X-dimension/читаемости → Task 4, 7.
- Persist размера в prefs → Task 6.
- Печать/скачивание тем же механизмом, что A4 → Task 6 (`printLabel`).
- Тесты (чистые + интеграция + RTL) → Task 1–8.
- Краевые случаи (невалидный номер блокирует, мелкая этикетка предупреждает) → Task 5 (throw), 7 (disabled + индикатор).

**Согласованность типов:** `LabelConfig`/`LabelPreset` (Task 1) → используются в `labelPresets.ts` (Task 2), `useEditorState` (Task 6), `LabelSection` (Task 7). `BarcodeGeometry` (Task 3) → `computeLabelLayout`/`composeLabelPdf` (Task 4, 5). `captureBarcodeGeometry`, `computeXDimensionMm`, `classifyReadability` имена единообразны во всех вызовах. `printLabel(action)` сигнатура совпадает в `EditorApi`, реализации и UI.

**Заглушек нет:** весь код приведён целиком; API bwip-js проверены эмпирически.
