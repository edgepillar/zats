// Kakaonut: the wallet's photo reader must agree byte-for-byte with the Kakaonut site.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  readStickerFromBytes,
  readStickerFromFile,
} from "src/js/kakaonut/read";
import { decodePng, encodePng } from "src/js/kakaonut/png";

const fixtures = resolve(__dirname, "fixtures");
const fixturePng = new Uint8Array(
  readFileSync(resolve(fixtures, "kakaonut-fixture.png"))
);
const fixtureToken = readFileSync(
  resolve(fixtures, "kakaonut-fixture.token.txt"),
  "utf8"
);

describe("Kakaonut photo reader", () => {
  it("decodes the site's fixture PNG to the exact token (cross-repo vector)", () => {
    const r = readStickerFromBytes(fixturePng);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.status).toBe("intact");
      expect(r.token).toBe(fixtureToken);
    }
    expect(r).toMatchObject({ format: "png", width: 320, height: 240 });
  });

  it("works from a Blob, as the dialog uses it", async () => {
    const r = await readStickerFromFile(
      new Blob([fixturePng], { type: "image/png" })
    );
    expect(r.ok && r.token).toBe(fixtureToken);
  });

  it("rejects a JPEG with the erased reason", () => {
    // SOI, APP0 (JFIF), SOF0 640×480
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0,
      1, 0, 1, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 3, 1,
      0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
    ]);
    expect(readStickerFromBytes(jpeg)).toMatchObject({
      ok: false,
      reason: "erased",
      format: "jpeg",
    });
  });

  it("says none for a PNG without a sticker", () => {
    const { pixels } = decodePng(fixturePng);
    const clean = new Uint8Array(pixels.data);
    for (let i = 0; i < clean.length; i++) clean[i] &= 0xfe; // wipe every low bit
    const png = encodePng({ ...pixels, data: clean });
    expect(readStickerFromBytes(png)).toMatchObject({
      ok: false,
      reason: "none",
    });
  });
});
