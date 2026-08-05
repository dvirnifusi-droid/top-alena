import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { UploadFile } from '@/integrations/Core';

/**
 * Turns a signed document into a stored PDF.
 *
 * Generated in the BROWSER on purpose. The API container has no PDF library,
 * and adding Chromium to it would inflate the image for every tenant — while
 * the browser already lays out Hebrew RTL correctly for free. The binding
 * record stays the JSON + signature in the database; this file is the copy a
 * human (or an accountant) opens, and it can be regenerated from the record at
 * any time.
 *
 * @param {HTMLElement} el      element rendering the document exactly as signed
 * @param {object} meta         { title, signedAt, ip, formId }
 * @returns {Promise<string>}   the uploaded file_url
 */
export async function generateAndUploadSignedPdf(el, meta = {}) {
  if (!el) throw new Error('missing element');

  const canvas = await html2canvas(el, {
    scale: 2,           // legible text rather than a blurry screenshot
    backgroundColor: '#ffffff',
    useCORS: true,
    windowWidth: el.scrollWidth,
    windowHeight: el.scrollHeight,
  });

  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 28;
  const imgW = pageW - margin * 2;
  const imgH = (canvas.height * imgW) / canvas.width;
  const img = canvas.toDataURL('image/jpeg', 0.92);

  // A 5-page agreement does not fit on one sheet — slide the same image up a
  // page height at a time and clip it with the page, so nothing is dropped.
  let remaining = imgH;
  let offset = 0;
  while (remaining > 0) {
    if (offset > 0) pdf.addPage();
    pdf.addImage(img, 'JPEG', margin, margin - offset, imgW, imgH);
    remaining -= (pageH - margin * 2);
    offset += (pageH - margin * 2);
  }

  // The evidentiary line — what makes this more than a printout.
  const stamp = [
    meta.signedAt ? `נחתם דיגיטלית ב-${new Date(meta.signedAt).toLocaleString('he-IL')}` : null,
    meta.ip ? `מכתובת IP ${meta.ip}` : null,
    meta.formId ? `מזהה טופס ${meta.formId}` : null,
  ].filter(Boolean).join(' · ');
  if (stamp) {
    pdf.setFontSize(8);
    pdf.setTextColor(110);
    // Latin-only in the footer: jsPDF's built-in fonts can't shape Hebrew, and a
    // reversed string would be worse than none. The Hebrew stamp lives inside
    // the rendered element above, which is an image and renders correctly.
    pdf.text(toLatinStamp(meta), margin, pageH - 14);
  }

  const blob = pdf.output('blob');
  const name = `${meta.title || 'document'}-${Date.now()}.pdf`;
  const file = new File([blob], name, { type: 'application/pdf' });
  const res = await UploadFile({ file });
  return res?.file_url || res?.data?.file_url || '';
}

function toLatinStamp(meta) {
  const parts = [];
  if (meta.signedAt) parts.push(`Digitally signed ${new Date(meta.signedAt).toISOString()}`);
  if (meta.ip) parts.push(`IP ${meta.ip}`);
  if (meta.formId) parts.push(`Form ${meta.formId}`);
  return parts.join('  |  ');
}
