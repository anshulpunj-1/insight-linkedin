import puppeteer from 'puppeteer';
import { generateMetadataText } from './generateMetadataText.js'; // update path as needed

/**
 * Save a structured PDF containing metadata, content, OCR, links, and embedded images.
 * @param {Object} params
 * @param {string} params.content - Main post content.
 * @param {Object} params.metadata - Metadata key-value pairs.
 * @param {string} params.ocrText - OCR-extracted text.
 * @param {string[]} params.extLinks - External links in the post.
 * @param {string} params.outputPath - Where to save the PDF.
 * @param {{ base64: string, mime: string }[]} [params.images] - Optional images to include in PDF.
 */
export async function saveStructuredPdfDirectly({ content, metadata, ocrText, extLinks, outputPath, images = [] }) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  const includeMetadata = metadata && metadata.url && metadata.keyword && metadata.scrapedAt;
  const isInsightReport = metadata?.insight === true;
  const formattedMetadata = metadata ? generateMetadataText(metadata) : '';

  const imageSection = images.length
    ? `
    <div class="section">
      <h2>Images from Post</h2>
      ${images
        .map(
          img => `<img src="data:${img.mime};base64,${img.base64}" style="max-width: 500px; margin-bottom: 20px;" />`
        )
        .join('')}
    </div>`
    : '';

  const html = `
<html>
  <head>
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; font-size: 13px; }
      h1, h2, h3, h4 { font-weight: bold; color: #2c3e50; }
      .section { margin-top: 20px; }
      .link { color: #2c3e50; text-decoration: underline; }
      pre {
        white-space: pre-wrap;
        word-wrap: break-word;
        background: #f9f9f9;
        padding: 10px;
        border-radius: 4px;
        border: 1px solid #ddd;
      }
    </style>
  </head>
  <body>

    ${!isInsightReport ? `
    <h1>Post Extract</h1>
    <div class="section"><b>Post URL:</b> <a class="link" href="${metadata.url}" target="_blank">${metadata.url}</a></div>
    <div class="section"><b>Keyword:</b> ${metadata.keyword}</div>
    <div class="section"><b>📂 Category:</b> ${metadata.category || 'Uncategorized'}</div>
    <div class="section"><b>Scraped At:</b> ${metadata.scrapedAt}</div>

    <div class="section">
      <h2>Metadata</h2>
      <pre>${formattedMetadata}</pre>
    </div>
    ` : ''}

    <div class="section">
      <h2>Post Content</h2>
      <pre>${content}</pre>
    </div>

    ${ocrText ? `
      <div class="section">
        <h2>OCR Extracted Text</h2>
        <pre>${ocrText}</pre>
      </div>
    ` : ''}

    ${extLinks?.length ? `
      <div class="section">
        <h2>External Links</h2>
        <ul>
          ${extLinks.map(link => `<li><a class="link" href="${link}" target="_blank">${link}</a></li>`).join('')}
        </ul>
      </div>
    ` : ''}

    ${imageSection}
  </body>
</html>`;

  await page.setContent(html, { waitUntil: 'domcontentloaded' });

  // ✅ Wait for all images to fully load before generating the PDF
  await page.evaluate(async () => {
    const images = Array.from(document.images);
    await Promise.all(images.map(img =>
      new Promise(resolve => {
        if (img.complete) resolve();
        else img.onload = img.onerror = resolve;
      })
    ));
  });

  await page.pdf({ path: outputPath, format: 'A4', printBackground: true });
  await browser.close();
  console.log(`📄 PDF saved: ${outputPath}`);
}