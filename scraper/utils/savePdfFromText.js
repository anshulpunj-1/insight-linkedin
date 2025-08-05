import fs from 'fs';
import PDFDocument from 'pdfkit';

export async function saveTextToPdf(txtPath) {
  if (!fs.existsSync(txtPath)) {
    console.warn(`❌ Text file not found: ${txtPath}`);
    return;
  }

  const text = fs.readFileSync(txtPath, 'utf-8').trim();
  if (!text) {
    console.warn(`❌ Text file is empty, skipping PDF: ${txtPath}`);
    return;
  }

  const pdfPath = txtPath.replace(/\.txt$/, '.pdf');
  const doc = new PDFDocument({ margin: 40 });

  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    doc.font('Times-Roman').fontSize(11);

    const lines = text.split('\n');
    for (const line of lines) {
      doc.text(line, { lineGap: 4 });
    }

    doc.end();

    writeStream.on('finish', () => {
      console.log(`📄 PDF saved → ${pdfPath}`);
      resolve();
    });
    writeStream.on('error', reject);
  });
}