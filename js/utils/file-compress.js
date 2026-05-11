/**
 * Compresión/optimización de archivos antes de subirlos a Supabase Storage.
 * Depende de scripts CDN en dashboard.html: pdf.js, pdf-lib, mammoth, html2pdf, SheetJS (XLSX).
 */

/** Máximo de páginas de PDF a rasterizar (evita cuelgues en documentos enormes). */
const PDF_MAX_PAGES = 35;

/** Escala de render ≈ 150 DPI respecto al espacio usuario PDF (72 pt ≈ 1 pulgada). */
const PDF_RENDER_SCALE = 150 / 72;

/** Calidad JPEG al reempaquetar páginas PDF. */
const PDF_JPEG_QUALITY = 0.72;

/** Borde máximo en px de la imagen raster (evita límites de canvas). */
const PDF_MAX_CANVAS_EDGE = 4200;

/** Calidad JPEG para imágenes de actas. */
const IMG_JPEG_QUALITY = 0.82;

/** Borde máximo (px) al redimensionar fotos. */
const IMG_MAX_EDGE = 2200;

/**
 * @param {string} name
 * @returns {string}
 */
function baseNombreSinExtension(name) {
  const s = String(name || 'archivo');
  const i = s.lastIndexOf('.');
  return i > 0 ? s.slice(0, i) : s;
}

/**
 * @param {string} fileName
 * @returns {string}
 */
function extensionMinuscula(fileName) {
  const i = String(fileName || '').lastIndexOf('.');
  if (i < 0) return '';
  return String(fileName)
    .slice(i + 1)
    .toLowerCase();
}

/**
 * Si el blob comprimido no mejora el tamaño, devuelve el archivo original.
 * @param {File} original
 * @param {Blob} candidato
 * @param {string} nuevoNombre
 * @param {string} mime
 * @returns {File}
 */
function preferirSiMejora(original, candidato, nuevoNombre, mime) {
  if (!candidato || candidato.size >= original.size * 0.97) {
    return original;
  }
  return new File([candidato], nuevoNombre, { type: mime, lastModified: Date.now() });
}

/**
 * Convierte data URL JPEG a Uint8Array para pdf-lib.
 * @param {string} dataUrl
 * @returns {Promise<Uint8Array>}
 */
async function dataUrlJpegAUint8(dataUrl) {
  const res = await fetch(dataUrl);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * PDF → PDF re-rasterizando cada página ~150 DPI y reempaquetando como JPEG.
 * @param {File} file
 * @returns {Promise<File>}
 */
async function comprimirPdf(file) {
  const pdfjsLib = window.pdfjsLib;
  const PDFLib = window.PDFLib;
  if (!pdfjsLib?.getDocument || !PDFLib?.PDFDocument) {
    console.warn('[compress] pdf.js o pdf-lib no disponibles');
    return file;
  }

  const ab = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: ab, useSystemFonts: true });
  const pdf = await loadingTask.promise;
  if (pdf.numPages > PDF_MAX_PAGES) {
    console.warn(`[compress] PDF con ${pdf.numPages} páginas; se omite recompresión (límite ${PDF_MAX_PAGES}).`);
    return file;
  }
  const num = pdf.numPages;
  const outPdf = await PDFLib.PDFDocument.create();

  for (let i = 1; i <= num; i++) {
    const page = await pdf.getPage(i);
    let viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
    const maxEdge = Math.max(viewport.width, viewport.height);
    let scaleExtra = 1;
    if (maxEdge > PDF_MAX_CANVAS_EDGE) {
      scaleExtra = PDF_MAX_CANVAS_EDGE / maxEdge;
      viewport = page.getViewport({ scale: PDF_RENDER_SCALE * scaleExtra });
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: ctx, viewport, background: 'white' }).promise;
    const dataUrl = canvas.toDataURL('image/jpeg', PDF_JPEG_QUALITY);
    const jpgBytes = await dataUrlJpegAUint8(dataUrl);
    const jpg = await outPdf.embedJpg(jpgBytes);
    const w = jpg.width;
    const h = jpg.height;
    const p = outPdf.addPage([w, h]);
    p.drawImage(jpg, { x: 0, y: 0, width: w, height: h });
  }

  const outBytes = await outPdf.save({ useObjectStreams: true });
  const blob = new Blob([outBytes], { type: 'application/pdf' });
  const nuevoNombre = `${baseNombreSinExtension(file.name)}.pdf`;
  return preferirSiMejora(file, blob, nuevoNombre, 'application/pdf');
}

/**
 * Excel / legacy XLS: regenerar sin estilos pesados, zip comprimido.
 * @param {File} file
 * @returns {Promise<File>}
 */
async function comprimirExcel(file) {
  const XLSX = window.XLSX;
  if (!XLSX?.read || !XLSX?.write) {
    console.warn('[compress] SheetJS no disponible');
    return file;
  }

  const ab = await file.arrayBuffer();
  const wb = XLSX.read(ab, {
    type: 'array',
    cellStyles: false,
    bookVBA: false,
    cellDates: true,
  });

  try {
    delete wb.Props;
    delete wb.Custprops;
  } catch (_) {
    /* noop */
  }

  const outAb = XLSX.write(wb, {
    type: 'array',
    bookType: 'xlsx',
    compression: true,
    cellStyles: false,
  });
  const blob = new Blob([outAb], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const base = baseNombreSinExtension(file.name);
  const nuevoNombre = `${base}.xlsx`;
  const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return preferirSiMejora(file, blob, nuevoNombre, mime);
}

/**
 * DOCX → HTML (mammoth) → PDF (html2pdf) con imágenes JPEG internas.
 * .doc legacy no soportado por mammoth: se devuelve sin cambios.
 * @param {File} file
 * @returns {Promise<File>}
 */
async function comprimirWord(file) {
  const ext = extensionMinuscula(file.name);
  if (ext === 'doc') {
    console.warn('[compress] .DOC binario: sin optimización en cliente (use DOCX).');
    return file;
  }

  const mammoth = window.mammoth;
  const html2pdf = window.html2pdf;
  if (!mammoth?.convertToHtml || !html2pdf) {
    console.warn('[compress] mammoth o html2pdf no disponibles');
    return file;
  }

  const arrayBuffer = await file.arrayBuffer();
  const { value: html } = await mammoth.convertToHtml(
    { arrayBuffer },
    { includeDefaultStyleMap: true },
  );

  const wrap = document.createElement('div');
  wrap.setAttribute('data-compress-host', '1');
  wrap.style.cssText =
    'position:fixed;left:-12000px;top:0;width:190mm;max-width:190mm;padding:12mm 14mm;background:#fff;color:#000;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;font-size:11pt;line-height:1.35;';
  wrap.innerHTML = html;
  document.body.appendChild(wrap);

  try {
    const opt = {
      margin: [10, 10, 10, 10],
      image: { type: 'jpeg', quality: 0.75 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true },
      pagebreak: { mode: ['css', 'legacy'] },
    };
    const blob = await html2pdf().set(opt).from(wrap).outputPdf('blob');
    const nuevoNombre = `${baseNombreSinExtension(file.name)}.pdf`;
    return preferirSiMejora(file, blob, nuevoNombre, 'application/pdf');
  } finally {
    wrap.remove();
  }
}

/**
 * Redimensiona y reexporta JPEG para reducir peso.
 * @param {File} file
 * @returns {Promise<File>}
 */
async function comprimirImagen(file) {
  try {
    const bmp = await createImageBitmap(file);
    let { width, height } = bmp;
    const maxE = Math.max(width, height);
    const scale = maxE > IMG_MAX_EDGE ? IMG_MAX_EDGE / maxE : 1;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bmp, 0, 0, width, height);
    bmp.close();
    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b || file), 'image/jpeg', IMG_JPEG_QUALITY);
    });
    const base = baseNombreSinExtension(file.name);
    const nuevoNombre = `${base}.jpg`;
    return preferirSiMejora(file, blob, nuevoNombre, 'image/jpeg');
  } catch (e) {
    console.warn('[compress] imagen', e);
    return file;
  }
}

/**
 * Comprime u optimiza el archivo según extensión; ante fallo devuelve el original.
 *
 * @param {File} file Archivo del input
 * @returns {Promise<{ file: File, optimizado: boolean, detalle?: string }>}
 */
export async function comprimirArchivoParaUpload(file) {
  if (!file || !(file instanceof File)) {
    throw new Error('ARCHIVO NO VÁLIDO.');
  }

  const ext = extensionMinuscula(file.name);
  const antes = file.size;
  let out = file;
  let optimizado = false;
  let detalle = '';

  try {
    if (ext === 'pdf') {
      out = await comprimirPdf(file);
    } else if (ext === 'xlsx' || ext === 'xls') {
      out = await comprimirExcel(file);
    } else if (ext === 'docx' || ext === 'doc') {
      out = await comprimirWord(file);
    } else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      out = await comprimirImagen(file);
    } else {
      return { file, optimizado: false, detalle: 'TIPO SIN OPTIMIZACIÓN EN CLIENTE.' };
    }

    if (out !== file && out.size < antes) {
      optimizado = true;
      const pct = Math.round((1 - out.size / antes) * 100);
      detalle = `TAMAÑO REDUCIDO ~${pct}% (${(antes / 1024).toFixed(0)} KB → ${(out.size / 1024).toFixed(0)} KB).`;
    }
  } catch (e) {
    console.warn('[compress] revertir a original', e);
    out = file;
    detalle = 'NO SE PUDO OPTIMIZAR; SE SUBE EL ARCHIVO ORIGINAL.';
  }

  return { file: out, optimizado, detalle };
}
