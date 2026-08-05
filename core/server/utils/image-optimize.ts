/**
 * Server-side image optimization for uploads + the manual per-file optimizer.
 * Uses `sharp` to shrink oversized photos.
 *
 * Output format:
 *   - 'auto' (DEFAULT, email-safe): re-encode to a format every email client
 *     renders. Images WITH transparency stay PNG (optimized); everything else
 *     becomes JPEG (mozjpeg). No WebP — Outlook desktop and Gmail don't render
 *     it, so anything that later lands in an email would break.
 *   - 'webp': smaller, but NOT email-safe. Opt-in only, surfaced in the UI with
 *     an explicit "doesn't display in Outlook/Gmail email" warning.
 *
 * Rules (both modes): SVG/GIF pass through untouched; the longest edge is capped
 * at MAX_EDGE (never upscales); the optimized bytes are used only if they're
 * actually smaller than the original.
 */
import sharp from "sharp";

const MAX_EDGE = Number(process.env.IMAGE_MAX_EDGE) || 2560;
const JPEG_QUALITY = Number(process.env.IMAGE_JPEG_QUALITY) || 82;
const WEBP_QUALITY = Number(process.env.IMAGE_WEBP_QUALITY) || 82;

const OPTIMIZABLE = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
  "image/avif",
]);

export type OptimizeFormat = "auto" | "webp";

export interface OptimizedImage {
  bytes: Buffer;
  type: string;
  filename: string;
  optimized: boolean;
}

/** True for raster formats we can re-encode (SVG/GIF excluded). */
export function isOptimizableImage(type: string | undefined | null): boolean {
  return !!type && OPTIMIZABLE.has(type.toLowerCase());
}

function swapExt(filename: string, ext: string): string {
  return filename.replace(/\.(jpe?g|png|tiff?|avif|webp)$/i, "") + "." + ext;
}

/**
 * Optimize a single image buffer. Non-images / failures return the input as-is.
 * `format` picks the output codec — default 'auto' is email-safe (JPEG/PNG).
 */
export async function optimizeImageBuffer(
  bytes: Buffer,
  type: string,
  filename: string,
  opts?: { format?: OptimizeFormat }
): Promise<OptimizedImage> {
  if (!isOptimizableImage(type)) {
    return { bytes, type, filename, optimized: false };
  }
  const format: OptimizeFormat = opts?.format === "webp" ? "webp" : "auto";

  try {
    const img = sharp(bytes, { failOn: "none" }).rotate(); // honor EXIF orientation
    const meta = await img.metadata();
    const longest = Math.max(meta.width || 0, meta.height || 0);

    let pipeline = img;
    if (longest > MAX_EDGE) {
      pipeline = pipeline.resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    let out: Buffer;
    let outType: string;
    let outName: string;

    if (format === "webp") {
      out = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
      outType = "image/webp";
      outName = swapExt(filename, "webp");
    } else if (meta.hasAlpha) {
      // Transparency must survive → optimized PNG (email-safe).
      out = await pipeline
        .png({ compressionLevel: 9, palette: true, quality: 82, effort: 7 })
        .toBuffer();
      outType = "image/png";
      outName = swapExt(filename, "png");
    } else {
      // No transparency → JPEG (email-safe, best general compression).
      out = await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
      outType = "image/jpeg";
      outName = swapExt(filename, "jpg");
    }

    // Only take the optimized version if it genuinely saves space.
    if (out.length < bytes.length) {
      return { bytes: out, type: outType, filename: outName, optimized: true };
    }
    return { bytes, type, filename, optimized: false };
  } catch (err) {
    console.warn(
      "[image-optimize] skipped (failed):",
      filename,
      (err as Error).message
    );
    return { bytes, type, filename, optimized: false };
  }
}
