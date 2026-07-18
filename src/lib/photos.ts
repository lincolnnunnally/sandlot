/** Client-side image helpers for toy photos only (never faces / kids). */

const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.82;
const MAX_BYTES = 5 * 1024 * 1024;

export function validateToyImageFile(file: File): string | null {
  if (!file.type.startsWith("image/")) return "Please choose a photo (JPEG, PNG, or WebP).";
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return "Use JPEG, PNG, or WebP only.";
  }
  if (file.size > 12 * 1024 * 1024) return "That photo is too large (max about 12 MB before compress).";
  return null;
}

/** Resize/compress to JPEG under ~5MB for upload. */
export async function compressToyPhoto(file: File): Promise<Blob> {
  const err = validateToyImageFile(file);
  if (err) throw new Error(err);

  const bitmap = await createImageBitmap(file);
  try {
    let { width, height } = bitmap;
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't process that image.");
    ctx.drawImage(bitmap, 0, 0, width, height);

    let quality = JPEG_QUALITY;
    let blob = await canvasToBlob(canvas, "image/jpeg", quality);
    while (blob.size > MAX_BYTES && quality > 0.45) {
      quality -= 0.1;
      blob = await canvasToBlob(canvas, "image/jpeg", quality);
    }
    if (blob.size > MAX_BYTES) throw new Error("Photo is still too large after compress. Try a simpler shot.");
    return blob;
  } finally {
    bitmap.close?.();
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't encode photo."))), type, quality);
  });
}
