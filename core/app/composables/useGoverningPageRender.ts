// useGoverningPageRender — turn an original (a PDF or an image) into page
// images in the browser, and read a PDF page's text layer where it has one
// (docs/prompts/governing-docs.md, Session 3A).
//
// Done here and not on the server because rendering a PDF there needs a native
// canvas package and a long request; the browser has both for free. pdf.js
// comes from `unpdf`, already a dependency, loaded only when this runs.
import { PAGE_IMAGE_MAX_BYTES, PAGE_IMAGE_WIDTH, hasUsableTextLayer } from "#core/shared/governing/upload";

export type RenderedPage = { image: Blob; /** The page's text layer, exactly as the file gives it, or null when it has none worth keeping. */ text: string | null };
export type OpenedOriginal = { pageCount: number; render: (pageNumber: number) => Promise<RenderedPage>; close: () => void };

const toJpeg = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not make the page image"))), "image/jpeg", quality));

/** A JPEG under the per-request limit: lower the quality before giving up. */
async function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  for (const quality of [0.85, 0.7, 0.5]) {
    const blob = await toJpeg(canvas, quality);
    if (blob.size <= PAGE_IMAGE_MAX_BYTES) return blob;
  }
  throw new Error("This page is too large to store as an image");
}

function blankCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d")!;
  // A scan with transparency would otherwise come out black as a JPEG.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, context };
}

export function useGoverningPageRender() {
  /** Fetch the file through the asset proxy (which checks the caller) and open it. */
  const open = async (url: string, type: string | null): Promise<OpenedOriginal> => {
    const response = await fetch(url, { credentials: "same-origin" });
    if (!response.ok) throw new Error("Could not open the original file");
    const bytes = new Uint8Array(await response.arrayBuffer());

    if (type?.startsWith("image/")) {
      const bitmap = await createImageBitmap(new Blob([bytes], { type }));
      return {
        pageCount: 1,
        render: async () => {
          const scale = Math.min(1, PAGE_IMAGE_WIDTH / bitmap.width);
          const { canvas, context } = blankCanvas(bitmap.width * scale, bitmap.height * scale);
          context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          return { image: await encode(canvas), text: null };
        },
        close: () => bitmap.close(),
      };
    }

    const { getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    return {
      pageCount: pdf.numPages,
      render: async (pageNumber) => {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: PAGE_IMAGE_WIDTH / page.getViewport({ scale: 1 }).width });
        const { canvas, context } = blankCanvas(viewport.width, viewport.height);
        // "print" draws without waiting on animation frames, which a browser
        // withholds from a tab in the background: the run must not stall there.
        await page.render({ canvasContext: context, viewport, canvas, intent: "print" } as any).promise;

        // Items in the file's own order; a line ends where the file says it does.
        const content = await page.getTextContent();
        const text = (content.items as Array<{ str?: string; hasEOL?: boolean }>).map((item) => (item.str ?? "") + (item.hasEOL ? "\n" : "")).join("");
        const image = await encode(canvas);
        page.cleanup();
        return { image, text: hasUsableTextLayer(text) ? text : null };
      },
      close: () => void pdf.destroy(),
    };
  };

  return { open };
}
