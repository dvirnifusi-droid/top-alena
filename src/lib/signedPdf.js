import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { UploadFile } from '@/integrations/Core';

// A4 at 96dpi, and 20mm margins — the same proportions as the Word original.
const PAGE_W = 794;
const PAGE_H = 1123;
const MARGIN = 76;
const CONTENT_W = PAGE_W - MARGIN * 2;   // 642
const CONTENT_H = PAGE_H - MARGIN * 2;   // 971

/**
 * Renders a signed document as a real A4 PDF.
 *
 * Generated in the BROWSER on purpose: the API container has no PDF library,
 * and adding Chromium would inflate the image for every tenant, while the
 * browser already lays out Hebrew RTL correctly for free.
 *
 * Pagination is done on the DOM, not on the image. The earlier version
 * screenshotted one tall element and sliced the bitmap every page height, which
 * cut through the middle of lines and ignored margins. Here the content is
 * broken into blocks that are packed into page-sized boxes first, so a page
 * always breaks between paragraphs — the way the Word original does.
 *
 * @param {object}  doc
 * @param {string}  doc.body       the document text (newline separated)
 * @param {string} [doc.signature] employee signature image dataURL
 * @param {string} [doc.companySignature] company counter-signature dataURL
 * @param {string} [doc.title]     heading printed at the top of page 1
 * @param {string} [doc.subtitle]  smaller line under the heading
 * @param {object} [meta]          { title (filename), signedAt, ip, formId }
 * @returns {Promise<string>} uploaded file_url
 */
export async function generateAndUploadSignedPdf(doc, meta = {}) {
  // Back-compat: callers used to pass a DOM element. Read its text so an old
  // call site still produces a correctly paginated A4 document.
  const source = (doc && doc.nodeType === 1)
    ? { body: doc.innerText || '', signature: doc.querySelector('img')?.src || '' }
    : (doc || {});

  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;top:0;left:-20000px;width:${PAGE_W}px;`;
  document.body.appendChild(host);

  try {
    const pages = buildPages(host, source, meta);

    const pdf = new jsPDF({ unit: 'px', format: [PAGE_W, PAGE_H], hotfixes: ['px_scaling'] });
    for (let i = 0; i < pages.length; i++) {
      // scale 1.7 ≈ 163dpi — comfortably sharp for 12px text, while scale 2 at
      // quality .94 produced a 2MB file for a 4-page contract that Word exports
      // in 118KB. These are stored per employee, per year.
      const canvas = await html2canvas(pages[i], {
        scale: 1.45,
        backgroundColor: '#ffffff',
        useCORS: true,
        windowWidth: PAGE_W,
      });
      if (i > 0) pdf.addPage([PAGE_W, PAGE_H]);
      pdf.addImage(
        canvas.toDataURL("image/jpeg", 0.78), 'JPEG',
        MARGIN, MARGIN, CONTENT_W, (canvas.height * CONTENT_W) / canvas.width,
        undefined, 'FAST',
      );
    }

    const blob = pdf.output('blob');
    const name = `${meta.title || 'document'}.pdf`;
    const file = new File([blob], name, { type: 'application/pdf' });
    const res = await UploadFile({ file });
    return res?.file_url || res?.data?.file_url || '';
  } finally {
    host.remove();
  }
}

/** Splits the document into page-sized boxes, breaking only between blocks. */
function buildPages(host, source, meta) {
  const pages = [];
  let page = newPage(host);
  let used = 0;

  const place = (el, { keepWithNext = false } = {}) => {
    page.appendChild(el);
    const h = el.offsetHeight;
    // A block that doesn't fit moves whole to the next page rather than being
    // cut through the middle.
    if (used + h > CONTENT_H && used > 0) {
      page.removeChild(el);
      page = newPage(host);
      pages.push(page);
      used = 0;
      page.appendChild(el);
    }
    used += h + (keepWithNext ? 0 : 0);
  };

  pages.push(page);

  if (source.title) {
    place(el('h1', source.title, 'font-size:19px;font-weight:700;text-align:center;margin:0 0 4px'));
  }
  if (source.subtitle) {
    place(el('div', source.subtitle, 'font-size:12px;color:#666;text-align:center;margin:0 0 18px'));
  }

  for (const raw of String(source.body || '').split('\n')) {
    const line = raw.trim();
    if (!line) { used += 6; continue; }
    const heading = /^##\s+/.test(line) || /^\d+\.\s+[^\d]/.test(line) && line.length < 60;
    place(el(
      'p',
      line.replace(/^##\s+/, ''),
      heading
        ? 'font-size:14px;font-weight:700;margin:14px 0 5px'
        : 'font-size:12.2px;line-height:1.75;margin:5px 0;text-align:justify',
    ));
  }

  // Signature block — kept together so a name never lands on its own page.
  const sig = document.createElement('div');
  sig.style.cssText = 'margin-top:26px;display:flex;gap:40px;align-items:flex-end';
  sig.innerHTML = `
    <div style="flex:1;text-align:center">
      <div style="height:70px;display:flex;align-items:flex-end;justify-content:center">
        ${source.companySignature ? `<img src="${source.companySignature}" style="max-height:68px" />` : ''}
      </div>
      <div style="border-top:1px solid #333;padding-top:5px;font-size:11.5px;color:#444">חתימת החברה</div>
    </div>
    <div style="flex:1;text-align:center">
      <div style="height:70px;display:flex;align-items:flex-end;justify-content:center">
        ${source.signature ? `<img src="${source.signature}" style="max-height:68px" />` : ''}
      </div>
      <div style="border-top:1px solid #333;padding-top:5px;font-size:11.5px;color:#444">חתימת העובד/ת</div>
    </div>`;
  place(sig);

  const stamp = [
    meta.signedAt ? `נחתם דיגיטלית ב-${new Date(meta.signedAt).toLocaleString('he-IL')}` : null,
    meta.ip ? `מכתובת IP ${meta.ip}` : null,
    meta.formId ? `מזהה טופס ${meta.formId}` : null,
  ].filter(Boolean).join(' · ');
  if (stamp) {
    place(el('div', stamp, 'margin-top:16px;padding-top:7px;border-top:1px solid #e2e2e2;font-size:9.5px;color:#777'));
  }

  return pages;
}

function newPage(host) {
  const p = document.createElement('div');
  p.dir = 'rtl';
  p.style.cssText = `width:${CONTENT_W}px;background:#fff;font-family:Arial,"Segoe UI",sans-serif;color:#111;`;
  host.appendChild(p);
  return p;
}

function el(tag, text, css) {
  const n = document.createElement(tag);
  n.textContent = text;
  n.style.cssText = css;
  return n;
}
