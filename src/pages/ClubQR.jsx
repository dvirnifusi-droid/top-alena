// Printable QR for the customer-club signup — admin opens /ClubQR, hits print.
// The QR encodes the SHORT STABLE alias https://topalena.com/club (a redirect
// we control in App.jsx), so the printed code keeps working no matter how the
// signup page itself changes internally.
import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';

const CLUB_URL = 'https://topalena.com/club';

export default function ClubQR() {
    return (
        <div dir="rtl" className="min-h-screen p-6 flex flex-col items-center" style={{ background: '#FAF5E8' }}>
            {/* Controls — hidden when printing */}
            <div className="print:hidden mb-6 flex gap-3 items-center">
                <Button onClick={() => window.print()} className="bg-[#44512C] hover:bg-[#7A3722] text-white">
                    🖨️ הדפס
                </Button>
                <span className="text-xs text-gray-500">
                    ה-QR מצביע על <code className="bg-white px-1 rounded">{CLUB_URL}</code> — כתובת קבועה שלא משתנה
                </span>
            </div>

            {/* The printable card — sized for a table-tent / A6 */}
            <div className="bg-white rounded-3xl shadow-xl p-10 text-center border-4 print:shadow-none print:border-2" style={{ borderColor: '#B89556', maxWidth: 420 }}>
                <h1 className="text-3xl font-black mb-1" style={{ color: '#A04A2E' }}>עלינא 🌿</h1>
                <h2 className="text-xl font-bold mb-4" style={{ color: '#44512C' }}>מועדון הלקוחות</h2>

                <div className="inline-block p-4 bg-white rounded-2xl border-2" style={{ borderColor: '#D9BD83' }}>
                    <QRCodeSVG value={CLUB_URL} size={220} bgColor="#ffffff" fgColor="#1F1B17" level="H" />
                </div>

                <p className="mt-5 text-lg font-bold" style={{ color: '#2E3819' }}>
                    סרקו והצטרפו חינם 📲
                </p>
                <p className="text-sm mt-1" style={{ color: '#7A3722' }}>
                    🎂 מתנה ביום ההולדת · 🎁 הטבות בלעדיות · 🍽️ עדכונים לפני כולם
                </p>
                <p className="text-[11px] text-gray-400 mt-4">
                    רוטשילד 104, ראשון לציון · 03-6228055
                </p>
            </div>
        </div>
    );
}
