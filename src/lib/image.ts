// Krymper bilder i telefonen innan uppladdning.
// Att rita om bilden på en canvas tar bort ALL metadata (EXIF), inklusive
// GPS-position, kameramodell och tidpunkt. Bilden roteras rätt först.

export interface ProcessedPhoto {
  full: Blob
  thumb: Blob
  /** Lokal länk till den lilla bilden, för förhandsvisning */
  previewUrl: string
}

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // faller tillbaka på <img> nedan
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

function render(source: ImageBitmap | HTMLImageElement, maxSide: number, quality: number): Promise<Blob> {
  const w = 'naturalWidth' in source ? source.naturalWidth : source.width
  const h = 'naturalHeight' in source ? source.naturalHeight : source.height
  const scale = Math.min(1, maxSide / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Kunde inte bearbeta bilden')
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Kunde inte spara bilden'))), 'image/jpeg', quality),
  )
}

export async function processPhoto(file: Blob): Promise<ProcessedPhoto> {
  const bitmap = await loadBitmap(file)
  const full = await render(bitmap, 1600, 0.82)
  const thumb = await render(bitmap, 520, 0.78)
  if ('close' in bitmap) bitmap.close()
  return { full, thumb, previewUrl: URL.createObjectURL(thumb) }
}
