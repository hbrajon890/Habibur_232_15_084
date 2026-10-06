/**
 * Generates sample valid PDF files in a sample_docs/ folder
 * to test the Tender Document Package Builder.
 * Run with: node generate_samples.js
 */

const fs = require('fs');
const path = require('path');

// Simple minimal valid PDF generator in pure Node.js (no external deps)
function createSimplePdf(title, content, pageCount = 1) {
  // We will build a minimal valid PDF 1.4 byte stream
  // A clean standard minimal PDF
  const objects = [];
  let offset = 0;
  const offsets = [];

  const addObj = (str) => {
    offsets.push(offset);
    const buf = Buffer.from(str, 'utf-8');
    offset += buf.length;
    return buf;
  };

  const headerBuf = Buffer.from('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n', 'utf-8');
  offset += headerBuf.length;

  const bodyBuffers = [headerBuf];

  // Obj 1: Catalog
  bodyBuffers.push(addObj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'));

  // Kids references
  const kidRefs = [];
  for (let i = 0; i < pageCount; i++) {
    kidRefs.push(`${4 + i * 2} 0 R`);
  }

  // Obj 2: Pages
  bodyBuffers.push(addObj(`2 0 obj\n<< /Type /Pages /Kids [${kidRefs.join(' ')}] /Count ${pageCount} >>\nendobj\n`));

  // Obj 3: Font
  bodyBuffers.push(addObj('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'));

  // For each page:
  for (let i = 0; i < pageCount; i++) {
    const pageObjNum = 4 + i * 2;
    const contentObjNum = 5 + i * 2;

    // Page object
    bodyBuffers.push(addObj(`${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjNum} 0 R >>\nendobj\n`));

    // Content stream
    const pageText = `BT /F1 18 Tf 50 780 Td (${title} - Page ${i + 1} of ${pageCount}) Tj /F1 12 Tf 0 -30 Td (${content}) Tj ET`;
    const streamLen = Buffer.byteLength(pageText, 'utf-8');
    bodyBuffers.push(addObj(`${contentObjNum} 0 obj\n<< /Length ${streamLen} >>\nstream\n${pageText}\nendstream\nendobj\n`));
  }

  const xrefOffset = offset;
  let xref = `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`;
  for (let o of offsets) {
    xref += String(o).padStart(10, '0') + ' 00000 n \n';
  }
  const trailer = `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  bodyBuffers.push(Buffer.from(xref + trailer, 'utf-8'));

  return Buffer.concat(bodyBuffers);
}

const sampleDir = path.join(__dirname, 'sample_docs');
if (!fs.existsSync(sampleDir)) {
  fs.mkdirSync(sampleDir);
}

const testFiles = [
  { name: 'trade_license_2026.pdf', title: 'Trade License', content: 'Official City Corporation Valid Trade License 2026', pages: 2 },
  { name: 'tin_certificate.pdf', title: 'Tax Identification Number (TIN)', content: 'National Board of Revenue 12-digit e-TIN Certificate', pages: 1 },
  { name: 'vat_registration_bin.pdf', title: 'VAT Registration (BIN)', content: 'Value Added Tax Registration Certificate', pages: 1 },
  { name: 'bank_solvency_certificate.pdf', title: 'Bank Solvency Certificate', content: 'Audited Bank Solvency and Credit Line Facility Statement', pages: 3 },
  { name: 'iso_9001_quality_certificate.pdf', title: 'ISO 9001 Quality Certificate', content: 'Quality Management Systems Standard ISO 9001:2015', pages: 2 },
  { name: 'manufacturer_authorization_form.pdf', title: 'Manufacturer Authorization Form (MAF)', content: 'Original Equipment Manufacturer Authorization Declaration', pages: 2 },
  // Duplicate file: different filename, identical content
  { name: 'trade_license_duplicate_copy.pdf', title: 'Trade License', content: 'Official City Corporation Valid Trade License 2026', pages: 2 },
  // Negative test files (should never auto-match or suggest for Trade License)
  { name: 'AI DevFest Vibe Coding Rulebook.pdf', title: 'Contest Rulebook', content: 'Official AI DevFest 2026 Contest Rulebook Guidelines', pages: 5 },
  { name: 'AIDevFest-ViveCoding_ProblemStatement.pdf', title: 'Problem Statement', content: 'Official Tender Document Package Builder Problem Statement', pages: 4 },
];

testFiles.forEach(f => {
  const pdfBuf = createSimplePdf(f.title, f.content, f.pages);
  fs.writeFileSync(path.join(sampleDir, f.name), pdfBuf);
  console.log(`Created: ${f.name} (${f.pages} pages, ${pdfBuf.length} bytes)`);
});

console.log('Sample documents generation complete!');

