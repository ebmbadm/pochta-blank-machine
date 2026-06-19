/**
 * Загрузка шрифтов для встраивания в экспортируемый PDF (pdf-lib + fontkit).
 * Используется DejaVu Sans: полное покрытие латиницы, кириллицы и цифр —
 * нужно для подписей «Дата печати: 19.06.2026» и «Дата отправки:».
 *
 * Файлы лежат в /public/fonts и грузятся в браузере через fetch.
 */

export interface ExportFonts {
  regular: Uint8Array;
  bold: Uint8Array;
}

export async function loadExportFonts(basePath = ""): Promise<ExportFonts> {
  const [regular, bold] = await Promise.all([
    fetch(`${basePath}/fonts/DejaVuSans.ttf`).then((r) => {
      if (!r.ok) throw new Error("Не удалось загрузить шрифт DejaVuSans.ttf");
      return r.arrayBuffer();
    }),
    fetch(`${basePath}/fonts/DejaVuSans-Bold.ttf`).then((r) => {
      if (!r.ok) throw new Error("Не удалось загрузить шрифт DejaVuSans-Bold.ttf");
      return r.arrayBuffer();
    }),
  ]);
  return { regular: new Uint8Array(regular), bold: new Uint8Array(bold) };
}
