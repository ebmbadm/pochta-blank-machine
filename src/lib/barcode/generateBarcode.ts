/**
 * Генерация штрих-кода Code 128 для трек-номера S10 (например, `LS018350611RU`).
 *
 * Два пути вывода:
 *  - `barcodeToSvg` — чистый SVG через bwip-js (node-сборка). Работает в Node,
 *    используется в предпросмотре и в юнит-тестах (canvas не требуется).
 *  - `barcodeToPngDataUrl` — PNG data URL через canvas (только браузер),
 *    для встраивания в экспортируемый PDF (pdf-lib).
 *
 * Координатных соглашений из units.ts здесь не требуется: bwip-js работает
 * в собственных единицах. `heightMm` маппится в опцию `height` bwip-js,
 * которая измеряется в миллиметрах (до применения `scale`).
 */

// Чистый SVG-рендер берём из node-сборки: она не тянет canvas/document и
// безопасна для импорта в jsdom-окружении vitest.
import { toSVG } from "bwip-js/node";

export interface BarcodeOptions {
  /** Множитель разрешения. Чем больше — тем чётче (для PNG в PDF). По умолчанию 3. */
  scale?: number;
  /** Высота штрихов в миллиметрах (опция bwip-js `height`). По умолчанию 12. */
  heightMm?: number;
  /** Показывать человекочитаемый текст под штрихами (LS…RU). По умолчанию true. */
  includeText?: boolean;
  /** Размер шрифта подписи (опция bwip-js `textsize`). По умолчанию 8. */
  textSize?: number;
}

const DEFAULT_SCALE = 3;
const DEFAULT_HEIGHT_MM = 12;
const DEFAULT_TEXT_SIZE = 8;

/**
 * Проверка значения для Code 128: непустое и только печатаемый ASCII.
 *
 * Code 128 кодирует только ASCII 0–127, поэтому кириллица и прочие не-ASCII
 * символы недопустимы (иначе bwip-js бросит исключение). Функция чистая.
 */
export function validateBarcodeValue(value: string): { ok: boolean; error?: string } {
  if (typeof value !== "string" || value.length === 0) {
    return { ok: false, error: "Значение штрих-кода не может быть пустым" };
  }
  // Code 128 покрывает ASCII 0–127. Любой код-пойнт вне диапазона недопустим.
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code > 0x7f) {
      return {
        ok: false,
        error: `Недопустимый символ для Code 128 (только ASCII): «${value[i]}»`,
      };
    }
  }
  return { ok: true };
}

interface BwipRenderOptions {
  bcid: string;
  text: string;
  scale: number;
  height: number;
  includetext: boolean;
  textxalign: "center";
  textsize: number;
}

function buildBwipOptions(value: string, opts?: BarcodeOptions): BwipRenderOptions {
  return {
    bcid: "code128",
    text: value,
    scale: opts?.scale ?? DEFAULT_SCALE,
    height: opts?.heightMm ?? DEFAULT_HEIGHT_MM,
    includetext: opts?.includeText ?? true,
    textxalign: "center",
    textsize: opts?.textSize ?? DEFAULT_TEXT_SIZE,
  };
}

/**
 * Возвращает строку SVG штрих-кода Code 128. Чистая, работает в Node.
 * Бросает Error с понятным сообщением, если значение не проходит валидацию.
 */
export function barcodeToSvg(value: string, opts?: BarcodeOptions): string {
  const check = validateBarcodeValue(value);
  if (!check.ok) {
    throw new Error(`Невозможно сгенерировать штрих-код: ${check.error}`);
  }
  return toSVG(buildBwipOptions(value, opts));
}

/**
 * ТОЛЬКО ДЛЯ БРАУЗЕРА. Рендерит штрих-код на canvas и возвращает PNG data URL
 * вместе с собственными размерами в пикселях — для чёткого встраивания в PDF.
 *
 * Не покрыт юнит-тестами: требует реального canvas (в jsdom canvas недоступен).
 * Проверяется вручную в браузере. Если вызвать вне браузера — бросает Error.
 */
export async function barcodeToPngDataUrl(
  value: string,
  opts?: BarcodeOptions,
): Promise<{ dataUrl: string; widthPx: number; heightPx: number }> {
  if (typeof document === "undefined") {
    throw new Error(
      "barcodeToPngDataUrl доступна только в браузере (требуется document/canvas)",
    );
  }
  const check = validateBarcodeValue(value);
  if (!check.ok) {
    throw new Error(`Невозможно сгенерировать штрих-код: ${check.error}`);
  }

  // Динамический импорт браузерной сборки: она использует canvas/DOM и не должна
  // подтягиваться при загрузке модуля в Node/тестах.
  const { toCanvas } = await import("bwip-js/browser");

  const canvas = document.createElement("canvas");
  toCanvas(canvas, buildBwipOptions(value, opts));

  return {
    dataUrl: canvas.toDataURL("image/png"),
    widthPx: canvas.width,
    heightPx: canvas.height,
  };
}
