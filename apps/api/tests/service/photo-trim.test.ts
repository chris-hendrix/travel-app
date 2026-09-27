import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { trimPhotoBorder } from "@/services/photo-cache.service.js";

/** A coloured rectangle centred on a larger pure-white canvas (PNG: lossless). */
async function letterboxed(): Promise<Buffer> {
  const content = await sharp({
    create: {
      width: 300,
      height: 200,
      channels: 3,
      background: { r: 180, g: 60, b: 40 },
    },
  })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: 400,
      height: 300,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([{ input: content, left: 50, top: 50 }])
    .png()
    .toBuffer();
}

describe("trimPhotoBorder", () => {
  it("trims a white letterbox down to the content", async () => {
    const boxed = await letterboxed();
    const trimmed = await trimPhotoBorder(boxed);
    const meta = await sharp(trimmed).metadata();
    expect(meta.width).toBe(300);
    expect(meta.height).toBe(200);
  });

  it("leaves a full-bleed photo byte-identical", async () => {
    const fullBleed = await sharp({
      create: {
        width: 200,
        height: 150,
        channels: 3,
        background: { r: 180, g: 60, b: 40 },
      },
    })
      .png()
      .toBuffer();
    const result = await trimPhotoBorder(fullBleed);
    expect(Buffer.compare(result, fullBleed)).toBe(0);
  });

  it("keeps the original bytes when the content is legitimately uniform at the edges", async () => {
    // A white sky with a distant bird: trimming the uniform field
    // would gut the photo to the bird, so the guard keeps it whole.
    const bird = await sharp({
      create: {
        width: 20,
        height: 20,
        channels: 3,
        background: { r: 60, g: 60, b: 60 },
      },
    })
      .png()
      .toBuffer();
    const sky = await sharp({
      create: {
        width: 400,
        height: 400,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite([{ input: bird, left: 190, top: 190 }])
      .png()
      .toBuffer();
    const result = await trimPhotoBorder(sky);
    expect(Buffer.compare(result, sky)).toBe(0);
  });
});
