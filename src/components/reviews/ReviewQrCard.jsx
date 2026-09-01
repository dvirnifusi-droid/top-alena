import React, { useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';

export default function ReviewQrCard({ link }) {
  const ref = useRef(null);
  const download = () => {
    const canvas = ref.current?.querySelector('canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'alena-google-review-qr.png';
    a.click();
  };
  return (
    <div className="rounded-xl border p-4 bg-white flex flex-col items-center gap-3">
      <div className="text-sm text-gray-600 text-center">QR לשלט / חשבון — סריקה פותחת ישר את כתיבת הביקורת</div>
      <div ref={ref}><QRCodeCanvas value={link} size={220} includeMargin /></div>
      <button onClick={download} className="bg-emerald-600 text-white rounded px-3 py-1">הורד PNG להדפסה</button>
      <a href={link} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline break-all text-center">{link}</a>
    </div>
  );
}
