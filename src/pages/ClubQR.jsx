// Printable QR for the customer-club signup — admin opens /ClubQR, hits print.
// The QR encodes THIS tenant's own club signup (origin + /club), so each
// restaurant's printed code points at its own club — never Alena's. Branding
// (name, address) comes from the tenant's RestaurantProfile via useTenantBranding.
import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { useTenantBranding } from '@/hooks/useTenantBranding';

export default function ClubQR() {
    const branding = useTenantBranding();
    const brandName = branding?.name || 'המסעדה';
    // Same-origin so the QR always points at THIS tenant's club (e.g.
    // juiceph.topalena.com/club), not a hardcoded Alena URL.
    const clubUrl = (typeof window !== 'undefined' ? window.location.origin : 'https://topalena.com') + '/club';

    return (
        <div dir="rtl" className="min-h-screen p-6 flex flex-col items-center" style={{ background: '#FAF5E8' }}>
            {/* Controls — hidden when printing */}
            <div className="print:hidden mb-6 flex gap-3 items-center">
                <Button onClick={() => window.print()} className="bg-[#44512C] hover:bg-[#7A3722] text-white">
                    🖨️ הדפס
                </Button>
                <span className="text-xs text-gray-500">
                    ה-QR מצביע על <code className="bg-white px-1 rounded">{clubUrl}</code> — עמוד ההרשמה של המסעדה שלך
                </span>
            </div>

            {/* The printable card — sized for a table-tent / A6 */}
            <div className="bg-white rounded-3xl shadow-xl p-10 text-center border-4 print:shadow-none print:border-2" style={{ borderColor: '#B89556', maxWidth: 420 }}>
                <h1 className="text-3xl font-black mb-1" style={{ color: '#A04A2E' }}>{brandName} 🌿</h1>
                <h2 className="text-xl font-bold mb-4" style={{ color: '#44512C' }}>מועדון הלקוחות</h2>

                <div className="inline-block p-4 bg-white rounded-2xl border-2" style={{ borderColor: '#D9BD83' }}>
                    <QRCodeSVG value={clubUrl} size={220} bgColor="#ffffff" fgColor="#1F1B17" level="H" />
                </div>

                <p className="mt-5 text-lg font-bold" style={{ color: '#2E3819' }}>
                    סרקו והצטרפו חינם 📲
                </p>
                <p className="text-sm mt-1" style={{ color: '#7A3722' }}>
                    🎂 מתנה ביום ההולדת · 🎁 הטבות בלעדיות · 🍽️ עדכונים לפני כולם
                </p>
                {branding?.address && (
                    <p className="text-[11px] text-gray-400 mt-4">{branding.address}</p>
                )}
            </div>
        </div>
    );
}
