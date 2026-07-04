// Settings & Integrations hub — consolidates all behind-the-scenes config
// pages into a single landing page with grouped cards. Each card links to
// the existing detail page; the goal is to declutter the sidebar so the
// owner only needs to remember ONE entry point for setup/integration work.
import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Settings, Zap, MessageCircle, Tablet, MapPin, RefreshCw, CreditCard, FormInput, Tv, Bell, Database, Mic, Mail } from 'lucide-react';
import { createPageUrl } from '@/utils';

function Tile({ to, title, sub, icon: Icon, accent }) {
    return (
        <Link to={to} className="block">
            <div className={`rounded-xl border-2 p-4 hover:shadow-md transition-all bg-white border-${accent}-100 hover:border-${accent}-300 h-full`}>
                <div className={`w-10 h-10 rounded-lg bg-${accent}-50 flex items-center justify-center mb-3`}>
                    <Icon className={`w-5 h-5 text-${accent}-600`} />
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
            <div className="mb-6">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Settings className="w-6 h-6 text-[#1F1B17]" />
                    הגדרות ואינטגרציות
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                    כל החיבורים, ה-API-ים, וההגדרות מאחורי הקלעים במקום אחד.
                </p>
            </div>

            <Section title="חיבורים חיצוניים" emoji="🔌">
                <Tile
                    to={createPageUrl('BeecommLive')}
                    title="Beecomm Live — POS"
                    sub="מעקב חי על קופה, מלצרים, מנות. POS ID fAgKZ7pBRGiJXwRUTebj"
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
