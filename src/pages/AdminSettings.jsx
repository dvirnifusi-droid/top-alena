// Settings & Integrations hub — consolidates all behind-the-scenes config
// pages into a single landing page with grouped cards. Each card links to
// the existing detail page; the goal is to declutter the sidebar so the
// owner only needs to remember ONE entry point for setup/integration work.
import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import PageHeader from '@/components/shared/PageHeader';
import { Settings, Zap, MessageCircle, Tablet, MapPin, RefreshCw, CreditCard, FormInput, Tv, Bell, Database, Mic, Mail } from 'lucide-react';
import { createPageUrl } from '@/utils';

// Tailwind's JIT can't see interpolated class names (bg-${accent}-50 etc.), so
// every accent used in this file is mapped to full literal class strings here.
const ACCENT = {
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-600',   border: 'border-amber-100',   hover: 'hover:border-amber-300' },
    cyan:    { bg: 'bg-cyan-50',    text: 'text-cyan-600',    border: 'border-cyan-100',    hover: 'hover:border-cyan-300' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100', hover: 'hover:border-emerald-300' },
    purple:  { bg: 'bg-purple-50',  text: 'text-purple-600',  border: 'border-purple-100',  hover: 'hover:border-purple-300' },
    indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-600',  border: 'border-indigo-100',  hover: 'hover:border-indigo-300' },
    blue:    { bg: 'bg-blue-50',    text: 'text-blue-600',    border: 'border-blue-100',    hover: 'hover:border-blue-300' },
    rose:    { bg: 'bg-rose-50',    text: 'text-rose-600',    border: 'border-rose-100',    hover: 'hover:border-rose-300' },
    slate:   { bg: 'bg-slate-50',   text: 'text-slate-600',   border: 'border-slate-100',   hover: 'hover:border-slate-300' },
    violet:  { bg: 'bg-violet-50',  text: 'text-violet-600',  border: 'border-violet-100',  hover: 'hover:border-violet-300' },
    orange:  { bg: 'bg-orange-50',  text: 'text-orange-600',  border: 'border-orange-100',  hover: 'hover:border-orange-300' },
};

function Tile({ to, title, sub, icon: Icon, accent }) {
    const a = ACCENT[accent] || ACCENT.slate;
    return (
        <Link to={to} className="block">
            <div className={`rounded-xl border-2 p-4 hover:shadow-md transition-all bg-white ${a.border} ${a.hover} h-full`}>
                <div className={`w-10 h-10 rounded-lg ${a.bg} flex items-center justify-center mb-3`}>
                    <Icon className={`w-5 h-5 ${a.text}`} />
                </div>
                <div className="font-bold text-sm text-gray-900">{title}</div>
                <div className="text-xs text-gray-500 mt-1 leading-relaxed">{sub}</div>
            </div>
        </Link>
    );
}

function Section({ title, emoji, children }) {
    return (
        <div className="mb-6">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                <span className="text-lg">{emoji}</span>{title}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {children}
            </div>
        </div>
    );
}

export default function AdminSettings() {
    return (
        <div className="p-4 md:p-6 max-w-6xl mx-auto" dir="rtl">
            <PageHeader title="הגדרות ואינטגרציות" subtitle="כל החיבורים, ה-API-ים, וההגדרות מאחורי הקלעים במקום אחד." icon={Settings} />

            <Section title="חיבורים חיצוניים" emoji="🔌">
                <Tile
                    to={createPageUrl('BeecommLive')}
                    title="Beecomm Live — POS"
                    sub="מעקב חי על קופה, מלצרים, מנות."
                    icon={Database}
                    accent="amber"
                />
                <Tile
                    to={createPageUrl('AdminGomileyCookies')}
                    title="Gomiley — משלוחים"
                    sub="חיבור Cookies, סנכרון לקוחות, ייבוא היסטוריה"
                    icon={RefreshCw}
                    accent="cyan"
                />
                <Tile
                    to={createPageUrl('AdminWhatsApp')}
                    title="WhatsApp — Twilio"
                    sub="סטטוס חיבור, בדיקת שליחה, broadcast שיווקי"
                    icon={MessageCircle}
                    accent="emerald"
                />
                <Tile
                    to={createPageUrl('AdminWhatsAppInbox')}
                    title="WhatsApp Inbox"
                    sub="הודעות נכנסות מלקוחות, תגובה ישירה מהמסך"
                    icon={MessageCircle}
                    accent="emerald"
                />
                <Tile
                    to={createPageUrl('DepositSettings')}
                    title="פיקדון אונליין"
                    sub="הגדרות סליקה לפיקדון הזמנות (PayPlus)"
                    icon={CreditCard}
                    accent="purple"
                />
                <Tile
                    to={createPageUrl('EmailInvoiceSettings')}
                    title="תיבות מייל לחשבוניות"
                    sub="קליטת חשבוניות ספקים אוטומטית מהמייל"
                    icon={Mail}
                    accent="indigo"
                />
            </Section>

            <Section title="מסכים ותצוגות" emoji="📺">
                <Tile
                    to={createPageUrl('KitchenScreen')}
                    title="מסך מטבח (TV)"
                    sub="מסך אווירתי למטבח/בר — משלוחים, סועדים, יעדים, חוסרים"
                    icon={Tv}
                    accent="blue"
                />
                <Tile
                    to={createPageUrl('AdminAmbient')}
                    title="Ambient · דוח+TV+Push"
                    sub="דוח בוקרי, סטטוס push, Auto-credit מ-Beecomm"
                    icon={Bell}
                    accent="amber"
                />
            </Section>

            <Section title="הגדרות פעולה" emoji="⚙️">
                <Tile
                    to={createPageUrl('LocationSettings')}
                    title="מיקום העסק וגיאופנס"
                    sub="הגדרת מיקום, רדיוס לchekin/checkout אוטומטי"
                    icon={MapPin}
                    accent="rose"
                />
                <Tile
                    to={createPageUrl('PublicReservationSettings')}
                    title="הגדרות הזמנות ציבוריות"
                    sub="טופס הזמנה, שעות, capacities, אישור אוטומטי"
                    icon={FormInput}
                    accent="cyan"
                />
                <Tile
                    to={createPageUrl('AvailabilityFormSettings')}
                    title="הגדרות הגשת זמינות"
                    sub="טופס זמינות עובדים — שדות, חוקים, תאריכים"
                    icon={FormInput}
                    accent="blue"
                />
                <Tile
                    to={createPageUrl('DevicesDashboard')}
                    title="ניהול ציוד"
                    sub="iPads, מסופונים, מצב חיבור, הגדרות"
                    icon={Tablet}
                    accent="slate"
                />
                <Tile
                    to={createPageUrl('VoiceTest')}
                    title="בדיקת פקודות קוליות"
                    sub="טסט מערכת הקול — synonyms, intents, examples"
                    icon={Mic}
                    accent="violet"
                />
                <Tile
                    to={createPageUrl('AdminReopenShifts')}
                    title="פתיחה מחדש של משמרות"
                    sub="שחזור משמרות שנסגרו אוטומטית — admin recovery"
                    icon={Zap}
                    accent="orange"
                />
            </Section>

            <div className="mt-8 text-xs text-gray-500 text-center bg-gray-50 rounded-lg p-3">
                💡 דף זה מאחד את ההגדרות הטכניות והאינטגרציות. ההגדרות העסקיות (משמרות, ראיונות, אירועים) נשארות בתפריט הראשי.
            </div>
        </div>
    );
}
