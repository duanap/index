import sharp from "sharp";

sharp.concurrency(1);
export type ImageOptions = {
  quality?: number;
  maxEdge?: number;
  maxBytes?: number;
  maxPixels?: number;
};
export function imageOptions(): Required<ImageOptions> {
  return {
    quality: Number(process.env.KANADE_WEBP_QUALITY || 82),
    maxEdge: Number(process.env.KANADE_IMAGE_MAX_EDGE || 2560),
    maxBytes: 10 * 1024 * 1024,
    maxPixels: 40_000_000,
  };
}
export async function convertImage(bytes: Buffer, options: ImageOptions = {}) {
  const config = { ...imageOptions(), ...options };
  if (
    !Number.isInteger(config.quality) ||
    config.quality < 1 ||
    config.quality > 100 ||
    !Number.isInteger(config.maxEdge) ||
    config.maxEdge < 1
  )
    throw new Error("Invalid image conversion settings");
  if (bytes.length > config.maxBytes) throw new Error("Image is too large");
  const image = sharp(bytes, {
    limitInputPixels: config.maxPixels,
    animated: true,
    failOn: "error",
  });
  const meta = await image.metadata();
  if (!["jpeg", "png"].includes(meta.format || "") || (meta.pages || 1) > 1)
    return null;
  const result = await image
    .rotate()
    .resize({
      width: config.maxEdge,
      height: config.maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: config.quality })
    .toBuffer({ resolveWithObject: true });
  return {
    bytes: result.data,
    width: result.info.width,
    height: result.info.height,
  };
}
