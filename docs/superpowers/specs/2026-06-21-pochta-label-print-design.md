# Печать трек-кода на термоэтикетке — дизайн

**Дата:** 2026-06-21
**Статус:** утверждён, готов к плану реализации
**Связано с:** [`2026-06-19-pochta-blank-editor-design.md`](2026-06-19-pochta-blank-editor-design.md)

## Цель

Добавить в «Бланк-машину» возможность печатать **штрих-код Почты России (Code 128
трек-номера S10)** на отдельной **термоэтикетке** под этикеточный принтер
пользователя (LABEL-9X00 и подобные). Это независимый от A4 вывод: маленький
PDF точно в размер этикетки, который пользователь печатает на термопринтере.

Вся обработка остаётся в браузере. Генератор штрих-кода и трек-номер
переиспользуются из существующего кода.

## Решения (зафиксированы при брейншторме)

1. **Размер этикетки** — настраивается в приложении: пресеты + ручной ввод мм
   (рулоны у термопринтеров разные).
2. **Содержимое** — минимализм: только штрих-код + читаемый номер `LS…RU` под ним.
   Без даты, адреса и прочего текста.
3. **UI** — отдельная секция «Этикетка» в существующей панели управления; экран
   A4 не меняется.
4. **Рендер/печать (подход A1)** — одностраничный PDF **точно в размер этикетки**;
   штрих-код рисуется **вектором** через drawing-интерфейс bwip-js → прямоугольники
   pdf-lib; печать/скачивание тем же механизмом, что A4-экспорт.

## Best practices печати штрих-кодов на термопринтере (обоснование подхода)

- **Печать в натуральную величину, без масштабирования.** Код генерируется сразу
  в целевом физическом размере и печатается «100% / Actual size». Масштабирование
  «на лету» на 203 dpi — главная причина несканируемых кодов.
- **Ширина модуля (X-dimension).** На 203 dpi 1 точка = 0.125 мм. Рекомендуемый
  минимум ~0.5 мм (≈4 точки); рабочий минимум ~0.25 мм. Тонкие модули ненадёжны.
- **Зоны тишины** ≥ 10× ширины модуля или 2.5 мм (что больше) слева и справа —
  обязательны.
- **Вектор предпочтительнее растра**: драйвер сам растрит вектор в native-dpi без
  ресэмплинга. Отсюда выбор A1 (вектор), а не PNG.

Источники: barcodefaq.com (print quality), createbarcodes.com (size requirements),
acctivate.com, mcauleylabels.com, printerjournal.com.

### Следствие для трек-кода S10

Code 128 для `LS018350611RU` — это ~160–180 модулей в ширину. Реальная арифметика
с учётом зон тишины:

| Ширина этикетки | Доступно под код | X-dimension | Вердикт |
|---|---|---|---|
| 100 мм | ~94 мм | ~0.52 мм (4 точки) | отлично |
| 58 мм | ~52 мм | ~0.29 мм (2–3 точки) | на грани, сканируется |
| 40 мм | ~34 мм | ~0.19 мм (1.5 точки) | рискованно |

Поэтому приложение **считает X-dimension и показывает индикатор читаемости**.

## Архитектура

### Новые файлы

| Файл | Ответственность |
|---|---|
| `src/lib/layout/labelPresets.ts` | `LABEL_PRESETS` (100×150 / 58×40 / 40×30), мин/макс мм, `getLabelPreset` / `applyLabelPreset` / `matchLabelPreset`. По образцу `presets.ts`. |
| `src/lib/barcode/barcodeVectorPdf.ts` | Ядро вектора. `captureBarcodeGeometry(value, opts)` — чистая (Node, тестируемая): прогоняет `bwipjs.render(opts, drawingContext)`, возвращает геометрию. `drawBarcodeGeometry(page, geom, placementPt, font, color)` — рисует в pdf-lib. |
| `src/lib/render/exportLabelPdf.ts` | `composeLabelPdf(input)` → `Uint8Array`. Чистые хелперы `computeLabelLayout(...)`, `computeXDimensionMm(...)`. |
| `src/components/LabelSection.tsx` | Секция UI: пресеты + ручной В×Ш, мини-предпросмотр, индикатор читаемости, кнопки печати/скачивания. |
| Тесты | `barcodeVectorPdf.test.ts`, `exportLabelPdf.test.ts`, `labelPresets.test.ts`, опц. `LabelSection.test.tsx`. |

### Правки существующих файлов

- `src/lib/layout/layoutModel.ts` — `LabelConfig` + поле `label` в `LayoutModel` + дефолт в `createDefaultLayout`.
- `src/state/useEditorState.ts` — чтение/запись `label` в prefs; методы `setLabelPreset`, `setLabelSize`, `printLabel`.
- `src/components/ControlsPanel.tsx` — рендер `<LabelSection api={api} />` (с `<Separator/>`), без другой переверстки.

## Модель данных и состояние

```ts
// layoutModel.ts
export type LabelPreset = "100x150" | "58x40" | "40x30" | "custom";

export interface LabelConfig {
  preset: LabelPreset;
  widthMm: number;
  heightMm: number;
}

export interface LayoutModel {
  // ...существующие поля...
  label: LabelConfig;
}
```

- Дефолт: `{ preset: "58x40", widthMm: 58, heightMm: 40 }` (частый компактный рулон;
  индикатор подскажет, если мелко).
- `label` **сохраняется в localStorage-prefs** рядом с `extraBarcodesEnabled` /
  `barcodeWidths`, поэтому выбранный размер рулона переживает перезагрузку и новый
  бланк (это свойство принтера, а не бланка).
- Флаг занятости — переиспользуем существующий `exporting` (одна операция печати
  за раз).

### Новые методы `EditorApi`

- `setLabelPreset(id: LabelPreset): void` — применить пресет (задать Ш/В).
- `setLabelSize(widthMm: number, heightMm: number): void` — ручной ввод; preset →
  `"custom"`, если не совпал; clamp по мин/макс.
- `printLabel(action: "download" | "print"): Promise<void>` — собрать label-PDF и
  отдать на печать/скачивание. Зеркалит `exportPdf`.

## Рендер этикетки

### Геометрия штрих-кода (вектор)

`captureBarcodeGeometry(value, opts)` реализует drawing-context для
`bwipjs.render` (node-сборка, как `barcodeToSvg`):

- `init(width, height)` → запоминаем `widthPx`, `heightPx`.
- `line(x0, y0, x1, y1, lw, rgb)` — для линейных кодов это вертикальный штрих:
  прямоугольник `{ x: x0 − lw/2, y: min(y0,y1), w: lw, h: |y1 − y0| }` (px,
  начало сверху-слева).
- `text(x, y, str, rgb, font)` — читаемый номер: запоминаем baseline и размер.
- `measure(...)` — оценка ширины текста (как в примере bwip-js).

Возврат: `{ widthPx, heightPx, moduleCount, bars: Rect[], text?: {...} }`, где
`moduleCount = widthPx / scale` (scale — px на модуль, передаётся в опциях).

`includetext: true` помещает номер внутрь геометрии, поэтому он масштабируется
вместе со штрихами и сидит под ними. Рисуем номер встроенным **DejaVu**
(уже грузится в `loadExportFonts`; покрывает ASCII).

### Сборка PDF

`composeLabelPdf({ trackingNumber, label, fonts })`:

1. Страница `mmToPt(label.widthMm) × mmToPt(label.heightMm)`.
2. Поля/зона тишины: горизонталь `clamp(width × 0.06, 2.5, 6)` мм с каждой
   стороны (≥ 2.5 мм — это и есть quiet zone), вертикаль
   `clamp(height × 0.08, 1.5, 5)` мм.
3. `captureBarcodeGeometry` → contain-fit во внутренний бокс:
   `scale = min(innerW/geomW, innerH/geomH)`, центрирование.
4. `drawBarcodeGeometry` рисует прямоугольники штрихов и номер, с учётом
   переворота оси Y (bwip px сверху-вниз → pdf-lib pt снизу-вверх; см. `units.ts`).

### Индикатор читаемости

`computeXDimensionMm(label.widthMm, moduleCount, quietMm)` →
`xDimMm = вписаннаяШиринаКода / moduleCount`. Классификация:

- `≥ 0.33 мм` — зелёный «хорошо»;
- `0.25–0.33 мм` — жёлтый «на грани»;
- `< 0.25 мм` — красный «мелко, может не сканироваться».

## UI — секция «Этикетка»

Отдельный блок в `ControlsPanel` (после секции «Даты»), экран A4 не трогаем:

- **Заголовок** «Этикетка (термопринтер)».
- **Пресеты** 100×150 / 58×40 / 40×30 (кнопки как у `PARCEL_PRESETS`) +
  два числовых поля **Ш × В, мм** (ручной ввод → preset `custom`, с clamp).
- **Мини-предпросмотр**: бокс в пропорции этикетки, внутри `barcodeToSvg(trackingNumber)`
  с `object-fit: contain` и внутренними полями = зоне тишины. Нет/невалидный
  номер → плейсхолдер «введите трек-номер».
- **Бейдж читаемости**: «X-dim ≈ 0.29 мм · на грани» (цвет по уровню).
- **Кнопки** «Печать этикетки» + «Скачать» (disabled при пустом/невалидном номере
  или `exporting`); ошибка → `toast`, как в `ControlsPanel.handleExport`.
- **Подсказка**: «В диалоге печати выберите принтер LABEL-9X00 и масштаб
  100% / Реальный размер».

## Краевые случаи

- Невалидный/пустой номер (`validateBarcodeValue`) → кнопки заблокированы, подсказка.
- Мелкая этикетка → печать разрешена, но красный индикатор предупреждает.
- Печать/скачивание: blob-URL, `window.open + print()` для печати, `<a download>`
  для скачивания. Имя файла `pochta-label-${trackingNumber}.pdf`.

## Не-цели (YAGNI)

- Несколько этикеток на лист / пакетная печать.
- Прямые ESC/POS или драйвер-специфичные команды.
- Поворот/ориентация (всегда горизонтально, fit по ширине).
- Адресный блок и произвольный текст (осознанный минимализм).
- Печать этикетки без загруженного бланка (трек-номер берётся из текущей модели).

## Тестирование (vitest, как в проекте)

- **Чистые (Node):** `captureBarcodeGeometry` (непустые бары, вменяемые
  `moduleCount`/аспект), contain-fit `computeLabelLayout`, `computeXDimensionMm`,
  пресеты (`applyLabelPreset`/`matchLabelPreset`/clamp).
- **Интеграция (Node):** `composeLabelPdf` отдаёт валидный PDF с размером страницы
  = этикетке (±ε), не падает на валидном входе.
- **Опционально (RTL):** рендер `LabelSection` — пресеты вызывают api, кнопки
  заблокированы без номера (по образцу `ControlsPanel.test.tsx`).
