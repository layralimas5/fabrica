import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { FORMAT_SIZES, type Carousel } from '../domain/carousel';
import { renderCarouselSlide, type RenderContext } from './slideRendering';

export type ImageFormat = 'png' | 'jpg';

const MIME: Record<ImageFormat, string> = { png: 'image/png', jpg: 'image/jpeg' };

function toBlob(canvas: HTMLCanvasElement, format: ImageFormat): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar a imagem.'))), MIME[format], 0.92),
  );
}

export function slugify(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'carrossel'
  );
}

const fileName = (index: number, format: ImageFormat) => `${String(index + 1).padStart(2, '0')}.${format}`;

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function exportSlide(context: RenderContext, carousel: Carousel, index: number, format: ImageFormat): Promise<void> {
  const canvas = await renderCarouselSlide(context, carousel.slides[index], index, 1);
  download(await toBlob(canvas, format), `${slugify(carousel.title)}-${fileName(index, format)}`);
}

export async function exportZip(context: RenderContext, carousel: Carousel, format: ImageFormat, onProgress: (done: number) => void): Promise<void> {
  const zip = new JSZip();
  const folder = zip.folder(slugify(carousel.title));
  if (!folder) throw new Error('Não consegui montar o ZIP.');
  for (const [index, slide] of carousel.slides.entries()) {
    const canvas = await renderCarouselSlide(context, slide, index, 1);
    folder.file(fileName(index, format), await toBlob(canvas, format));
    onProgress(index + 1);
  }
  download(await zip.generateAsync({ type: 'blob' }), `${slugify(carousel.title)}.zip`);
}

export async function exportPdf(context: RenderContext, carousel: Carousel, onProgress: (done: number) => void): Promise<void> {
  const { width, height } = FORMAT_SIZES[carousel.format];
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [width, height], hotfixes: ['px_scaling'] });
  for (const [index, slide] of carousel.slides.entries()) {
    const canvas = await renderCarouselSlide(context, slide, index, 1);
    if (index > 0) pdf.addPage([width, height], 'portrait');
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, width, height);
    onProgress(index + 1);
  }
  download(pdf.output('blob'), `${slugify(carousel.title)}.pdf`);
}
