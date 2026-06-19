/**
 * Сборка итогового печатного A4-PDF из LayoutModel (pdf-lib).
 *
 * Ключевая идея: бланк переиспользуется как ВЕКТОР исходного PDF (embedPage с
 * обрезкой по найденной области), поэтому он остаётся «один в один» с оригиналом
 * и масштабируется без потери чёткости. Поверх рисуются добавляемые элементы
 * (даты, доп. штрих-коды) кириллическим шрифтом DejaVu.
 *
 * Модуль спроектирован под внедрение зависимостей: все входные байты (исходный
 * PDF, шрифты, изображения штрих-кодов) передаются через ComposeInput, благодаря
 * чему сборка полностью тестируется в Node без браузера.
 *
 * Координаты:
 *  - LayoutModel/FormRegion-mm — верхний левый угол, мм, ось Y вниз;
 *  - pdf-lib — нижний левый угол, pt, ось Y вверх.
 * Перевод выполняется здесь (см. computeFormPlacementPt и блок рисования).
 */

import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

import { A4, mmToPt } from "@/lib/units";
import type { FormRegion, LayoutModel, BarcodeCopy } from "@/lib/layout/layoutModel";

/** Изображение штрих-кода (PNG) с исходными размерами в пикселях. */
export interface BarcodeImage {
  png: Uint8Array;
  intrinsicWidthPx: number;
  intrinsicHeightPx: number;
}

/** Полный набор входных данных для сборки итогового PDF. */
export interface ComposeInput {
  /** Исходный PDF-бланк с pochta.ru. */
  sourcePdfBytes: Uint8Array;
  /** Область бланка для встраивания (pt, нижний левый угол, в координатах исходной страницы). */
  formRegion: FormRegion;
  /** Модель раскладки (мм, верхний левый угол). */
  model: LayoutModel;
  /** Шрифты для встраивания (DejaVu Sans regular + bold). */
  fonts: { regular: Uint8Array; bold: Uint8Array };
  /** Изображения доп. штрих-кодов, ключ — id копии из model.extraBarcodes.copies. */
  barcodeImages?: Record<string, BarcodeImage>;
}

/** Результат расчёта размещения бланка на листе A4 (pt, нижний левый угол). */
export interface FormPlacementPt {
  xPt: number;
  yPt: number;
  scale: number;
  widthPt: number;
  heightPt: number;
}

/**
 * Чистая функция: переводит позицию/ширину бланка из мм (верхний левый угол)
 * в координаты pdf-lib (pt, нижний левый угол) и считает масштаб встроенной
 * области относительно её исходных размеров.
 *
 * scale = mmToPt(formWidthMm) / region.widthPt — множитель для drawPage;
 * heightPt = region.heightPt * scale — высота, сохраняющая пропорции области.
 */
export function computeFormPlacementPt(
  model: LayoutModel,
  region: FormRegion,
): FormPlacementPt {
  const widthPt = mmToPt(model.formWidthMm);
  const scale = widthPt / region.widthPt;
  const heightPt = region.heightPt * scale;
  const xPt = mmToPt(model.formXMm);
  // Перевод верхнего левого угла (мм, ось Y вниз) в нижний левый (pt, ось Y вверх):
  // в pdf-lib y задаёт НИЖНЮЮ кромку, поэтому вычитаем ещё и высоту.
  const yPt = A4.heightPt - mmToPt(model.formYMm) - heightPt;
  return { xPt, yPt, scale, widthPt, heightPt };
}

/** Опции раскладки строки доп. штрих-кодов (всё в мм, верхний левый угол). */
export interface BarcodeRowOptions {
  /** Левая граница начала первой копии, мм. */
  startXMm: number;
  /** Верхняя граница строки, мм. */
  startYMm: number;
  /** Зазор между копиями (и между строками при переносе), мм. */
  gapMm: number;
  /** Правая граница, при превышении которой выполняется перенос на новую строку, мм. */
  maxRightMm: number;
  /** Представительное соотношение сторон (высота / ширина) для расчёта высоты. */
  aspect?: number;
}

/** Размещение одной копии штрих-кода на листе (мм, верхний левый угол). */
export interface BarcodePlacementMm {
  id: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

/**
 * Чистая функция: раскладывает копии штрих-кодов слева направо, начиная с
 * (startXMm, startYMm), с зазором gapMm. Когда правая кромка очередной копии
 * выходит за maxRightMm, выполняется перенос на новую строку. Высота строки
 * растёт на максимальную высоту в строке + зазор.
 *
 * Высота копии = widthMm * aspect (вызывающий передаёт представительный
 * aspect; по умолчанию 0.32).
 */
export function computeBarcodeRowLayout(
  copies: readonly BarcodeCopy[],
  opts: BarcodeRowOptions,
): BarcodePlacementMm[] {
  const aspect = opts.aspect ?? 0.32;
  const result: BarcodePlacementMm[] = [];

  let cursorXMm = opts.startXMm;
  let rowTopMm = opts.startYMm;
  let rowMaxHeightMm = 0;

  for (const copy of copies) {
    const widthMm = copy.widthMm;
    const heightMm = widthMm * aspect;

    // Перенос: копия не помещается до maxRightMm (но первую в строке не переносим).
    const wouldExceed = cursorXMm + widthMm > opts.maxRightMm;
    const isRowStart = cursorXMm === opts.startXMm;
    if (wouldExceed && !isRowStart) {
      rowTopMm += rowMaxHeightMm + opts.gapMm;
      cursorXMm = opts.startXMm;
      rowMaxHeightMm = 0;
    }

    result.push({ id: copy.id, xMm: cursorXMm, yMm: rowTopMm, widthMm, heightMm });

    cursorXMm += widthMm + opts.gapMm;
    if (heightMm > rowMaxHeightMm) rowMaxHeightMm = heightMm;
  }

  return result;
}

/**
 * Собирает итоговый печатный A4-PDF из LayoutModel.
 *
 * 1) создаёт новый документ и регистрирует fontkit;
 * 2) встраивает область бланка из исходного PDF как ВЕКТОР (embedPage с обрезкой);
 * 3) кладёт бланк на лист A4 с масштабом/позицией из модели;
 * 4) рисует дату печати и поле для даты отправки (кириллица — DejaVu);
 * 5) при наличии — раскладывает доп. штрих-коды (PNG).
 */
export async function composeA4Pdf(input: ComposeInput): Promise<Uint8Array> {
  const { sourcePdfBytes, formRegion, model, fonts, barcodeImages } = input;

  // 1. Новый документ + fontkit (нужен для встраивания кастомных TTF).
  const out = await PDFDocument.create();
  out.registerFontkit(fontkit);

  // 2. Загружаем исходный PDF и берём нужную страницу.
  const src = await PDFDocument.load(sourcePdfBytes);

  // 2a. ВАЖНО: данные бланка (отправитель, получатель, вложения, галочки) хранятся
  // в полях формы AcroForm, а embedPage копирует только контент страницы БЕЗ полей.
  // flatten запекает значения полей в контент страницы, сохраняя их оригинальный
  // внешний вид (updateFieldAppearances: false — без перегенерации, чтобы не терять
  // кириллицу и точное расположение). Без этого экспортированный бланк выходит пустым.
  try {
    const form = src.getForm();
    form.flatten({ updateFieldAppearances: false });
  } catch {
    // PDF без формы — просто пропускаем.
  }

  const srcPage = src.getPage(formRegion.pageIndex);

  // 3. Встраиваем область бланка как вектор (обрезка left/bottom/right/top, pt).
  const embedded = await out.embedPage(srcPage, {
    left: formRegion.xPt,
    bottom: formRegion.yPt,
    right: formRegion.xPt + formRegion.widthPt,
    top: formRegion.yPt + formRegion.heightPt,
  });

  // 4. Создаём лист A4.
  const page = out.addPage([A4.widthPt, A4.heightPt]);

  // 5. Рисуем бланк по рассчитанному размещению.
  const placement = computeFormPlacementPt(model, formRegion);
  page.drawPage(embedded, {
    x: placement.xPt,
    y: placement.yPt,
    xScale: placement.scale,
    yScale: placement.scale,
  });

  // 6. Встраиваем шрифты (кириллица). Стандартные шрифты pdf-lib кириллицу не поддерживают.
  const regularFont = await out.embedFont(fonts.regular, { subset: true });
  const boldFont = await out.embedFont(fonts.bold, { subset: true });

  // 7. Мета-строка (даты) рисуется под бланком. Координаты — pt, нижний левый угол.
  const metaFontSize = 10;
  const metaGapPt = mmToPt(6); // отступ от нижней кромки бланка до строки дат
  // Нижняя кромка бланка в pt; строка дат — ниже неё.
  const formBottomYPt = placement.yPt;
  const metaRowYPt = formBottomYPt - metaGapPt - metaFontSize;
  const metaLeftXPt = placement.xPt;

  if (model.printDate.enabled) {
    page.drawText(`Дата печати: ${model.printDate.text}`, {
      x: metaLeftXPt,
      y: metaRowYPt,
      size: metaFontSize,
      font: regularFont,
    });
  }

  if (model.shipDate.enabled) {
    // Подпись «Дата отправки:» рисуется второй строкой (или той же, со сдвигом),
    // далее — горизонтальная линия для заполнения ручкой.
    const shipRowYPt = model.printDate.enabled
      ? metaRowYPt - (metaFontSize + mmToPt(3))
      : metaRowYPt;
    const labelText = model.shipDate.label;
    page.drawText(labelText, {
      x: metaLeftXPt,
      y: shipRowYPt,
      size: metaFontSize,
      font: regularFont,
    });
    const labelWidthPt = regularFont.widthOfTextAtSize(labelText, metaFontSize);
    const lineStartXPt = metaLeftXPt + labelWidthPt + mmToPt(3);
    const lineEndXPt = lineStartXPt + mmToPt(50);
    // Линия по базовой линии текста (чуть ниже), чтобы было место для записи.
    const lineYPt = shipRowYPt;
    page.drawLine({
      start: { x: lineStartXPt, y: lineYPt },
      end: { x: lineEndXPt, y: lineYPt },
      thickness: 0.75,
    });
  }

  // 8. Доп. штрих-коды (PNG). Раскладываются строкой ниже мета-строки.
  if (model.extraBarcodes.enabled && barcodeImages) {
    const copiesWithImages = model.extraBarcodes.copies.filter(
      (c) => barcodeImages[c.id] !== undefined,
    );

    if (copiesWithImages.length > 0) {
      // Стартовая Y-координата строки штрих-кодов в мм (верхний левый угол),
      // ниже бланка и строки дат. Переводим положение бланка обратно в мм.
      const formBottomMm = model.formYMm + placement.heightPt / mmToPt(1);
      const startYMm = formBottomMm + 18; // запас под мета-строку
      const startXMm = model.formXMm;
      const maxRightMm = A4.widthMm - 10;

      // Представительный aspect — из первого доступного изображения.
      const firstImg = barcodeImages[copiesWithImages[0].id];
      const repAspect =
        firstImg.intrinsicWidthPx > 0
          ? firstImg.intrinsicHeightPx / firstImg.intrinsicWidthPx
          : 0.32;

      const layout = computeBarcodeRowLayout(copiesWithImages, {
        startXMm,
        startYMm,
        gapMm: 6,
        maxRightMm,
        aspect: repAspect,
      });

      for (const place of layout) {
        const img = barcodeImages[place.id];
        if (!img) continue;
        const pngImage = await out.embedPng(img.png);

        const widthPt = mmToPt(place.widthMm);
        // Высота сохраняет исходные пропорции изображения.
        const imgAspect =
          img.intrinsicWidthPx > 0
            ? img.intrinsicHeightPx / img.intrinsicWidthPx
            : 0.32;
        const heightPt = widthPt * imgAspect;

        // Перевод верхнего левого угла (мм) в нижний левый (pt).
        const xPt = mmToPt(place.xMm);
        const yPt = A4.heightPt - mmToPt(place.yMm) - heightPt;

        page.drawImage(pngImage, {
          x: xPt,
          y: yPt,
          width: widthPt,
          height: heightPt,
        });
      }
    }
  }

  // 9. Сериализация в байты.
  return await out.save();
}
