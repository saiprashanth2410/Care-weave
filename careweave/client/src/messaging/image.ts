/**
 * Shrinks a photo from the camera or gallery before it is sent: at most 1280 px on the long side, JPEG, and small enough for the
 * server's limit (about 450 KB). A phone photo is several megabytes, so it is never sent as it is.
 */
export async function compressImage(file: File, maxSide = 1280, maxBytes = 330_000): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose a photo.')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('This photo format is not supported. Try a JPEG or PNG photo.')
  }
  let scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  for (let round = 0; round < 4; round++) {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('This browser cannot prepare photos.')
    ctx.fillStyle = '#fff' // a PNG with a transparent background would otherwise turn black
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    for (const quality of [0.82, 0.7, 0.58, 0.46]) {
      const url = canvas.toDataURL('image/jpeg', quality)
      if (url.length * 0.75 <= maxBytes) { bitmap.close?.(); return url }
    }
    scale *= 0.75
  }
  bitmap.close?.()
  throw new Error('This photo is too large to send. Try another one.')
}
