import { describe, it, expect } from 'vitest';
import { isSafePublicUrl, extractInvoiceLinks } from '../invoiceLinks.js';

describe('isSafePublicUrl', () => {
  it('allows normal public https/http URLs', () => {
    expect(isSafePublicUrl('https://app.icount.co.il/doc/123.pdf')).toBe(true);
    expect(isSafePublicUrl('http://invoices.example.com/x')).toBe(true);
  });
  it('blocks non-http schemes', () => {
    expect(isSafePublicUrl('mailto:a@b.com')).toBe(false);
    expect(isSafePublicUrl('ftp://host.com/x')).toBe(false);
    expect(isSafePublicUrl('javascript:alert(1)')).toBe(false);
  });
  it('blocks localhost and internal service names', () => {
    expect(isSafePublicUrl('http://localhost:3001/api')).toBe(false);
    expect(isSafePublicUrl('http://minio:9000/bucket')).toBe(false);
    expect(isSafePublicUrl('http://top-alena-api-1/x')).toBe(false);
    expect(isSafePublicUrl('http://foo.internal/x')).toBe(false);
  });
  it('blocks private IP ranges and cloud metadata', () => {
    expect(isSafePublicUrl('http://127.0.0.1/x')).toBe(false);
    expect(isSafePublicUrl('http://10.0.0.5/x')).toBe(false);
    expect(isSafePublicUrl('http://172.16.4.4/x')).toBe(false);
    expect(isSafePublicUrl('http://192.168.1.1/x')).toBe(false);
    expect(isSafePublicUrl('http://169.254.169.254/latest/meta-data')).toBe(false);
  });
  it('allows a public IP', () => {
    expect(isSafePublicUrl('https://8.8.8.8/x')).toBe(true);
  });
});

describe('extractInvoiceLinks', () => {
  it('picks an invoice-labeled anchor over generic links', () => {
    const html = `
      <a href="https://example.com/about">אודות</a>
      <a href="https://app.icount.co.il/download/inv/4779.pdf">להורדת החשבונית</a>
      <a href="https://facebook.com/page">follow us</a>`;
    const links = extractInvoiceLinks(html, '');
    expect(links[0]).toBe('https://app.icount.co.il/download/inv/4779.pdf');
  });

  it('drops unsubscribe / social / mailto', () => {
    const html = `
      <a href="https://x.com/unsubscribe?u=1">unsubscribe</a>
      <a href="mailto:billing@vendor.com">email us</a>
      <a href="https://instagram.com/vendor">insta</a>`;
    expect(extractInvoiceLinks(html, '')).toEqual([]);
  });

  it('drops unsafe internal URLs even if invoice-labeled', () => {
    const html = `<a href="http://localhost:3001/invoice.pdf">חשבונית להורדה</a>
                  <a href="http://169.254.169.254/invoice">invoice download</a>`;
    expect(extractInvoiceLinks(html, '')).toEqual([]);
  });

  it('finds bare invoice URLs in the plain-text body', () => {
    const text = 'לצפייה בחשבונית: https://app.ezcount.co.il/api/downloadPdf?doc=164612 תודה';
    const links = extractInvoiceLinks('', text);
    expect(links).toContain('https://app.ezcount.co.il/api/downloadPdf?doc=164612');
  });

  it('caps the number of returned links', () => {
    const html = Array.from({ length: 10 }, (_, i) =>
      `<a href="https://vendor${i}.co.il/invoice/${i}.pdf">חשבונית ${i}</a>`).join('\n');
    expect(extractInvoiceLinks(html, '').length).toBeLessThanOrEqual(3);
  });

  it('decodes &amp; in hrefs', () => {
    const html = `<a href="https://app.icount.co.il/pdf?a=1&amp;b=2&amp;type=invoice">חשבונית</a>`;
    expect(extractInvoiceLinks(html, '')[0]).toBe('https://app.icount.co.il/pdf?a=1&b=2&type=invoice');
  });
});
