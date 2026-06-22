import { describe, it, expect } from "vitest";
import { resolveStaticPath, contentType } from "./static.mjs";

const ROOT = "/srv/out";

describe("resolveStaticPath", () => {
  it("/ → index.html в корне", () => {
    expect(resolveStaticPath("/", ROOT)).toBe("/srv/out/index.html");
  });
  it("директория со слешем → index.html внутри", () => {
    expect(resolveStaticPath("/sub/", ROOT)).toBe("/srv/out/sub/index.html");
  });
  it("файл отдаётся как есть", () => {
    expect(resolveStaticPath("/_next/app.js", ROOT)).toBe("/srv/out/_next/app.js");
  });
  it("отбрасывает query", () => {
    expect(resolveStaticPath("/a.js?v=1", ROOT)).toBe("/srv/out/a.js");
  });
  it("блокирует traversal (..)", () => {
    expect(resolveStaticPath("/../../etc/passwd", ROOT)).toBeNull();
  });
  it("битый %-escape → null (не бросает)", () => {
    expect(resolveStaticPath("/%", ROOT)).toBeNull();
    expect(resolveStaticPath("/%zz", ROOT)).toBeNull();
  });
  it("NUL в пути → null", () => {
    expect(resolveStaticPath("/a%00.js", ROOT)).toBeNull();
  });
});

describe("contentType", () => {
  it("сопоставляет известные расширения", () => {
    expect(contentType("/x/app.js")).toBe("text/javascript; charset=utf-8");
    expect(contentType("/x/page.html")).toBe("text/html; charset=utf-8");
    expect(contentType("/x/f.svg")).toBe("image/svg+xml");
    expect(contentType("/x/f.ttf")).toBe("font/ttf");
  });
  it("неизвестное → octet-stream", () => {
    expect(contentType("/x/f.bin")).toBe("application/octet-stream");
  });
});
