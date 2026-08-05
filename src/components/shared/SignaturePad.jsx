import React, { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { Eraser } from 'lucide-react';

/**
 * Finger/mouse signature canvas.
 *
 * Lifted verbatim from the drawing logic in EventContractSign, which has been
 * signing event contracts in production — same pointer maths, same touch
 * handling. Extracted so the employment agreement and טופס 101 sign the same
 * way rather than each growing their own canvas.
 *
 * Exposes toDataURL() and isEmpty() via ref; the parent decides what to do with
 * the image. isEmpty() is tracked by stroke events rather than by reading pixels
 * — a canvas that was drawn on and then cleared must count as empty.
 */
const SignaturePad = forwardRef(function SignaturePad({ label = 'חתימה', disabled = false }, ref) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const hasStrokesRef = useRef(false);

  useImperativeHandle(ref, () => ({
    isEmpty: () => !hasStrokesRef.current,
    toDataURL: () => canvasRef.current?.toDataURL('image/png') || '',
    clear: () => clear(),
  }));

  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    hasStrokesRef.current = false;
  };

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || disabled) return;
    const ctx = c.getContext('2d');
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';

    const pos = (e) => {
      const r = c.getBoundingClientRect();
      const t = e.touches?.[0];
      const x = (t ? t.clientX : e.clientX) - r.left;
      const y = (t ? t.clientY : e.clientY) - r.top;
      return { x: x * (c.width / r.width), y: y * (c.height / r.height) };
    };

    const start = (e) => {
      e.preventDefault();
      drawing.current = true;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    };
    const move = (e) => {
      if (!drawing.current) return;
      e.preventDefault();
      const p = pos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      hasStrokesRef.current = true;
    };
    const end = () => { drawing.current = false; };

    c.addEventListener('mousedown', start);
    c.addEventListener('mousemove', move);
    c.addEventListener('mouseup', end);
    c.addEventListener('mouseleave', end);
    c.addEventListener('touchstart', start, { passive: false });
    c.addEventListener('touchmove', move, { passive: false });
    c.addEventListener('touchend', end);

    return () => {
      c.removeEventListener('mousedown', start);
      c.removeEventListener('mousemove', move);
      c.removeEventListener('mouseup', end);
      c.removeEventListener('mouseleave', end);
      c.removeEventListener('touchstart', start);
      c.removeEventListener('touchmove', move);
      c.removeEventListener('touchend', end);
    };
  }, [disabled]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-semibold text-slate-700">{label}</label>
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={disabled}>
          <Eraser className="w-4 h-4 ml-1" />
          נקה
        </Button>
      </div>
      <canvas
        ref={canvasRef}
        width={600}
        height={200}
        className="w-full h-40 border-2 border-slate-300 rounded-lg bg-white touch-none"
      />
      <p className="text-xs text-slate-500 mt-1">חתום/י באצבע בתוך המסגרת</p>
    </div>
  );
});

export default SignaturePad;
