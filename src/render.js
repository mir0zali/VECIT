const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const PDFDocument = require('pdfkit');
const SVGtoPDF = require('svg-to-pdfkit');
const { DATA_DIR } = require('./db');

const LOGO_DIR = path.join(DATA_DIR, 'logos');
const SOURCE_DIR = path.join(DATA_DIR, 'sources');
const PREVIEW_DIR = path.join(DATA_DIR, 'previews');
for (const d of [LOGO_DIR, SOURCE_DIR, PREVIEW_DIR]) fs.mkdirSync(d, { recursive: true });

// Strips anything executable or external from an uploaded SVG, so files we hand
// to designers are clean and safe to open.
function sanitizeSvg(input) {
  let svg = String(input);
  if (!/<svg[\s>]/i.test(svg)) throw new Error('That file is not an SVG.');
  svg = svg.replace(/<\?xml[^>]*>/gi, '').replace(/<!DOCTYPE[^>]*>/gi, '');
  svg = svg.replace(/<script[\s\S]*?<\/script\s*>/gi, '').replace(/<script[^>]*\/>/gi, '');
  svg = svg.replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '');
  svg = svg.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  svg = svg.replace(/(href\s*=\s*)("|')\s*(?!#|data:image\/)[^"']*\2/gi, '$1$2#$2');
  svg = svg.replace(/javascript:/gi, '');
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + svg.trim() + '\n';
}

function svgDimensions(svg) {
  const vb = svg.match(/viewBox\s*=\s*["']\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (vb) return { width: Number(vb[3]), height: Number(vb[4]) };
  const w = svg.match(/<svg[^>]*\swidth\s*=\s*["']([\d.]+)/i);
  const h = svg.match(/<svg[^>]*\sheight\s*=\s*["']([\d.]+)/i);
  return { width: w ? Number(w[1]) : 512, height: h ? Number(h[1]) : 512 };
}

function readSvg(file) {
  return fs.readFileSync(path.join(LOGO_DIR, file), 'utf8');
}

// Renders the SVG so its longest side is `size` pixels.
async function toRaster(svgFile, format, size, background) {
  const svg = readSvg(svgFile);
  const { width, height } = svgDimensions(svg);
  const density = Math.min(2400, Math.max(72, Math.ceil((72 * size) / Math.max(width, height))));
  let img = sharp(Buffer.from(svg), { density }).resize({
    width: width >= height ? size : null,
    height: height > width ? size : null,
    fit: 'inside',
  });
  if (format === 'jpg') {
    img = img.flatten({ background: background || '#ffffff' }).jpeg({ quality: 92 });
  } else {
    img = img.png();
  }
  return img.toBuffer();
}

// A PDF keeps the artwork as real vector paths, so it opens editable in Illustrator.
function toPdf(svgFile) {
  const svg = readSvg(svgFile);
  const { width, height } = svgDimensions(svg);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [width, height], margin: 0, info: { Creator: 'Vectorly' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    SVGtoPDF(doc, svg, 0, 0, { width, height, assumePt: true });
    doc.end();
  });
}

// Previews are small PNGs so the SVG itself is only reachable through a download.
async function previewPath(logo) {
  const out = path.join(PREVIEW_DIR, `${logo.id}.png`);
  if (!fs.existsSync(out)) {
    fs.writeFileSync(out, await toRaster(logo.svg_file, 'png', 480));
  }
  return out;
}

function clearPreview(logoId) {
  fs.rmSync(path.join(PREVIEW_DIR, `${logoId}.png`), { force: true });
}

module.exports = {
  LOGO_DIR, SOURCE_DIR, sanitizeSvg, svgDimensions, readSvg, toRaster, toPdf, previewPath, clearPreview,
};
