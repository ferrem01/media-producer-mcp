/**
 * PDF Deck Export
 *
 * Captures each scene as a PNG and combines them into a multi-page PDF using pdf-lib.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

export interface ExportPdfOptions {
  /** Paths to scene screenshot PNGs */
  scenePngs: string[];
  /** Output PDF path */
  outputPath: string;
  /** Page width in pixels */
  width: number;
  /** Page height in pixels */
  height: number;
}

/**
 * Combine scene PNGs into a multi-page PDF.
 * Each PNG becomes a full-page image.
 */
export async function exportPdf(options: ExportPdfOptions): Promise<string> {
  const { scenePngs, outputPath, width, height } = options;

  if (scenePngs.length === 0) {
    throw new Error("No scene PNGs to export");
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const pdfDoc = await PDFDocument.create();

  for (const pngPath of scenePngs) {
    const pngBytes = await fs.readFile(pngPath);
    const pngImage = await pdfDoc.embedPng(pngBytes);

    // Create a page matching the canvas dimensions (pixels -> points at 1:1)
    const page = pdfDoc.addPage([width, height]);
    page.drawImage(pngImage, {
      x: 0,
      y: 0,
      width,
      height,
    });
  }

  const pdfBytes = await pdfDoc.save();
  await fs.writeFile(outputPath, pdfBytes);

  const stat = await fs.stat(outputPath);
  console.log(`  PDF exported: ${outputPath} (${(stat.size / 1024 / 1024).toFixed(1)} MB, ${scenePngs.length} pages)`);

  return outputPath;
}
