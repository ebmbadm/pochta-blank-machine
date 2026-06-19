import { describe, it, expect } from "vitest";

import {
  findContentBBox,
  pxBBoxToFormRegion,
  type PxBBox,
} from "@/lib/pdf/detectFormRegion";

/** Создаёт полностью белое непрозрачное RGBA-изображение width×height. */
function makeWhiteImage(width: number, height: number): {
  data: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = 255; // R
    data[i * 4 + 1] = 255; // G
    data[i * 4 + 2] = 255; // B
    data[i * 4 + 3] = 255; // A
  }
  return { data, width, height };
}

/** Закрашивает сплошной чёрный прямоугольник (top-left x,y) поверх изображения. */
function fillBlackRect(
  img: { data: Uint8ClampedArray; width: number; height: number },
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const i = (yy * img.width + xx) * 4;
      img.data[i] = 0;
      img.data[i + 1] = 0;
      img.data[i + 2] = 0;
      img.data[i + 3] = 255;
    }
  }
}

describe("findContentBBox", () => {
  it("returns null for a fully-white image", () => {
    const img = makeWhiteImage(4, 4);
    expect(findContentBBox(img)).toBeNull();
  });

  it("finds a solid black 3×3 block (paddingPx: 0)", () => {
    const img = makeWhiteImage(10, 10);
    fillBlackRect(img, 2, 4, 3, 3);
    const bbox = findContentBBox(img, { paddingPx: 0 });
    expect(bbox).toEqual<PxBBox>({ x: 2, y: 4, width: 3, height: 3 });
  });

  it("expands by paddingPx: 1 around the block", () => {
    const img = makeWhiteImage(10, 10);
    fillBlackRect(img, 2, 4, 3, 3);
    const bbox = findContentBBox(img, { paddingPx: 1 });
    expect(bbox).toEqual<PxBBox>({ x: 1, y: 3, width: 5, height: 5 });
  });

  it("clamps padding at the image edges", () => {
    // Блок в самом верхнем-левом углу: padding не может выйти за границы.
    const img = makeWhiteImage(10, 10);
    fillBlackRect(img, 0, 0, 3, 3);
    const bbox = findContentBBox(img, { paddingPx: 1 });
    // x,y обрезаны до 0; ширина/высота = 3 (блок) + 1 (padding справа/снизу).
    expect(bbox).toEqual<PxBBox>({ x: 0, y: 0, width: 4, height: 4 });
  });
});

describe("pxBBoxToFormRegion", () => {
  it("converts a top-left px bbox into a bottom-left FormRegion (Y flip)", () => {
    const region = pxBBoxToFormRegion(
      { x: 10, y: 20, width: 30, height: 40 },
      {
        pageIndex: 0,
        canvasWidthPx: 100,
        canvasHeightPx: 200,
        pageWidthPt: 50,
        pageHeightPt: 100,
      },
    );

    expect(region.pageIndex).toBe(0);
    expect(region.widthPt).toBeCloseTo(15);
    expect(region.heightPt).toBeCloseTo(20);
    expect(region.xPt).toBeCloseTo(5);
    // yPt = 100 - (20 + 40) * (100/200) = 100 - 30 = 70
    expect(region.yPt).toBeCloseTo(70);
  });
});
