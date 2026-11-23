'use client';

/**
 * Réduit une photo avant son enregistrement dans Firestore.
 *
 * Une photo de téléphone (3 à 5 Mo) dépasse la limite de 1 Mo d'un document Firestore
 * et alourdit toutes les listes qui chargent les agents. On la redimensionne donc
 * (côté le plus long ≤ maxSize px) et on la ré-encode en JPEG : ~15 à 30 Ko au final.
 */
export const MAX_INPUT_BYTES = 15 * 1024 * 1024; // 15 Mo avant compression
const MAX_OUTPUT_CHARS = 200_000; // ~150 Ko en base64 : garde-fou largement sous la limite Firestore

export async function compressImageToDataUrl(
  file: File,
  { maxSize = 320, quality = 0.8 }: { maxSize?: number; quality?: number } = {}
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error("Le fichier choisi n'est pas une image.");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('Photo trop volumineuse (15 Mo maximum).');
  }

  // imageOrientation : respecte la rotation des photos prises au téléphone
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
    .catch(() => {
      throw new Error("Impossible de lire cette image (format non pris en charge).");
    });

  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Impossible de traiter l'image sur cet appareil.");

  // Fond blanc : les PNG transparents ne deviennent pas noirs en JPEG
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let q = quality;
  let dataUrl = canvas.toDataURL('image/jpeg', q);
  while (dataUrl.length > MAX_OUTPUT_CHARS && q > 0.4) {
    q -= 0.1;
    dataUrl = canvas.toDataURL('image/jpeg', q);
  }
  if (dataUrl.length > MAX_OUTPUT_CHARS) {
    throw new Error('Photo trop lourde même après compression.');
  }
  return dataUrl;
}
