export async function preparePhoto(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("JPG, PNG, WebP 사진만 등록할 수 있습니다.");
  if (file.size > 12 * 1024 * 1024)
    throw new Error("사진 한 장은 12MB 이하여야 합니다.");
  let bitmap;
  try {
    let timer;
    const decoding = createImageBitmap(file);
    let expired = false;
    try {
      bitmap = await Promise.race([
        decoding,
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            expired = true;
            reject(new Error("decode timeout"));
          }, 15000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      if (expired)
        decoding.then(
          (image) => image.close(),
          () => {},
        );
    }
  } catch {
    throw new Error(
      "사진을 읽을 수 없습니다. 손상되지 않은 JPG, PNG, WebP 파일을 선택해 주세요.",
    );
  }
  if (bitmap.width * bitmap.height > 80000000) {
    bitmap.close();
    throw new Error("사진의 해상도가 너무 큽니다.");
  }
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}
