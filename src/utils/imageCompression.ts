const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.72;
const MAX_OUTPUT_BYTES = 750 * 1024;

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Nao foi possivel ler a imagem.'));
    };
    image.src = url;
  });

const dataUrlSize = (dataUrl: string) => {
  const base64 = dataUrl.split(',')[1] ?? '';
  return Math.ceil((base64.length * 3) / 4);
};

export async function compressImageToBase64(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecione um arquivo de imagem.');
  }

  const image = await loadImage(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Nao foi possivel preparar a imagem.');
  }

  context.drawImage(image, 0, 0, width, height);
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);

  if (dataUrlSize(dataUrl) > MAX_OUTPUT_BYTES) {
    throw new Error('Imagem muito grande. Use uma foto menor ou mais leve.');
  }

  return dataUrl;
}
