'use client';

export interface ImageCompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

export async function readAndCompressImage(
  file: File,
  options: ImageCompressionOptions = {},
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecione um arquivo de imagem válido (JPG, PNG ou WebP).');
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new Error('A imagem deve ter no máximo 10 MB.');
  }

  const maxWidth = options.maxWidth ?? 900;
  const maxHeight = options.maxHeight ?? 900;
  const quality = options.quality ?? 0.82;

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Não foi possível ler o arquivo selecionado.'));
      }
    };
    reader.onerror = () =>
      reject(new Error('Erro ao ler a imagem selecionada.'));
    reader.readAsDataURL(file);
  });

  if (file.type === 'image/svg+xml') {
    return rawDataUrl;
  }

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Falha ao processar a imagem.'));
      image.src = rawDataUrl;
    });

    const scale = Math.min(
      1,
      maxWidth / Math.max(1, img.width),
      maxHeight / Math.max(1, img.height),
    );
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return rawDataUrl;

    ctx.drawImage(img, 0, 0, width, height);
    const compressed = canvas.toDataURL('image/jpeg', quality);
    return compressed || rawDataUrl;
  } catch {
    return rawDataUrl;
  }
}
