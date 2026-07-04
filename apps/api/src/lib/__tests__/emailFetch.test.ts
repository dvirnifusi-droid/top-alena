import { describe, it, expect } from 'vitest';
import { resolveAttachmentMime } from '../emailFetch.js';

describe('resolveAttachmentMime', () => {
  it('accepts proper MIME types regardless of filename', () => {
    expect(resolveAttachmentMime('application/pdf', 'whatever.bin')).toBe('application/pdf');
    expect(resolveAttachmentMime('image/jpeg', 'photo')).toBe('image/jpeg');
  });

  it('accepts generic MIME when the filename extension is allowed (Israeli billing systems send octet-stream PDFs)', () => {
    expect(resolveAttachmentMime('application/octet-stream', 'receipt-617895.pdf')).toBe('application/pdf');
    expect(resolveAttachmentMime('application/octet-stream', 'חשבונית מס 15516.PDF')).toBe('application/pdf');
    expect(resolveAttachmentMime('binary/octet-stream', 'scan.jpg')).toBe('image/jpeg');
    expect(resolveAttachmentMime('', 'invoice.png')).toBe('image/png');
  });

  it('rejects disallowed types even with generic MIME', () => {
    expect(resolveAttachmentMime('application/octet-stream', 'invoice-items.xlsx')).toBeNull();
    expect(resolveAttachmentMime('application/zip', 'archive.zip')).toBeNull();
    expect(resolveAttachmentMime('application/octet-stream', 'noextension')).toBeNull();
  });

  it('does not let a bad extension override a good MIME', () => {
    expect(resolveAttachmentMime('application/pdf', 'file.xlsx')).toBe('application/pdf');
  });
});
