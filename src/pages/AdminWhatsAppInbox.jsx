// WhatsApp Inbox — list conversations + thread view + reply input.
// Polls every 8s for new messages. Layout: left rail = conversations,
// right pane = active thread. Mobile = single pane that toggles.
import React, { useEffect, useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { isMainAlena } from '@/lib/tenant';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Send, ArrowRight, MessageCircle, RefreshCw } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

// Quick-reply templates. Brand name comes from tenant branding; the
// confirmation template's address + phone line is Alena-specific, so it
// only renders on the flagship (other tenants get a generic confirmation).
function buildQuickTemplates(brandName, isAlena) {
    const confirmVenueLine = isAlena
        ? `נשמח לראותך בעלינא — רוטשילד 104, ראשון לציון.\nלכל שאלה אנחנו כאן 03-6228055 שלוחה 3`
        : `נשמח לראותך ב${brandName}.`;
    return [
        {
            key: 'confirm',
            label: '✅ אישור הזמנה',
            text: `שלום 🌿\nההזמנה שלך אצלנו אושרה!\n${confirmVenueLine}`,
        },
        {
            key: 'menu',
            label: '📜 תפריט',
            text: 'הנה התפריט שלנו 🍽️\nhttps://topalena.com/menu\nבתאבון!',
        },
        {
            key: 'hours',
            label: '🕐 שעות',
            text: 'שעות הפתיחה שלנו:\nא׳–ה׳: 12:00–23:00\nו׳: 12:00–16:00\nשבת: סגור\nנשמח לראותך 🌿',
        },
        {
            key: 'deposit',
            label: '💳 פיקדון',
            text: 'כדי להבטיח את ההזמנה, נבקש פיקדון של 50 ₪ לאדם.\nקישור לתשלום מאובטח:\nhttps://topalena.com/deposit\nההזמנה תאושר מיד עם השלמת התשלום ✅',
        },
        {
            key: 'thanks',
            label: '🙏 תודה',
            text: `תודה שבחרת ב${brandName} 🌿\nנשמח לראותך שוב בקרוב!\n— צוות ${brandName}`,
        },
    ];
}

function fmtTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

function fmtPhone(p) {
    if (!p) return '';
    const s = String(p).replace(/^whatsapp:/, '');
    // +972532181900 → 053-218-1900
    if (/^\+972/.test(s)) {
        const rest = '0' + s.slice(4);
        return rest.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
    }
    if (/^972/.test(s)) {
        const rest = '0' + s.slice(3);
        return rest.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
    }
    return s;
}

function ConversationList({ conversations, activeContact, onSelect, loading }) {
    return (
        <div className={`border-l border-gray-200 bg-white overflow-y-auto w-full md:w-[320px] md:max-w-[320px] md:shrink-0 ${activeContact ? 'hidden md:block' : 'block'}`} style={{ maxHeight: 'calc(100vh - 120px)' }}>
            <div className="p-3 border-b bg-gray-50">
                <h2 className="font-bold text-sm flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-emerald-600" />
                    שיחות ({conversations.length})
                </h2>
            </div>
            {loading && conversations.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    טוען...
                </div>
            ) : conversations.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">
                    אין שיחות עדיין. הודעות נכנסות יופיעו כאן.
                </div>
            ) : (
                <div className="divide-y divide-gray-100">
                    {conversations.map(c => {
                        const isActive = c.contact_phone === activeContact;
                        const last = c.last_message;
                        return (
                            <button
                                key={c.contact_phone}
                                onClick={() => onSelect(c.contact_phone)}
                                className={`w-full text-right p-3 hover:bg-gray-50 transition-colors ${isActive ? 'bg-emerald-50 border-r-4 border-emerald-500' : ''}`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-sm truncate">
                                            {c.contact_name || fmtPhone(c.contact_phone)}
                                        </div>
                                        <div className="text-xs text-gray-500">{fmtPhone(c.contact_phone)}</div>
                                    </div>
                                    {c.unread_count > 0 && (
                                        <span className="bg-emerald-600 text-white text-xs font-bold rounded-full px-2 py-0.5 ml-2">
                                            {c.unread_count}
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-gray-600 truncate mt-1">
                                    {last.direction === 'outbound' && <span className="text-[#44512C]">↳ </span>}
                                    {last.body || (last.num_media > 0 ? '📎 קובץ מצורף' : '—')}
                                </div>
                                <div className="text-[10px] text-gray-400 mt-1">{fmtTime(last.created_at)}</div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function MessageThread({ messages, sending, error, onSend, onMarkRead, contactPhone, contactName, onBack, onDelete }) {
    const brandName = useTenantBranding()?.name || 'המסעדה';
    const quickTemplates = buildQuickTemplates(brandName, isMainAlena());
    const [text, setText] = useState('');
    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages]);

    useEffect(() => {
        if (contactPhone) onMarkRead?.();
    }, [contactPhone]);

    const submit = async () => {
        if (!text.trim()) return;
        const t = text.trim();
        setText('');
        await onSend(t);
    };

    if (!contactPhone) {
        return (
            <div className="hidden md:flex flex-1 items-center justify-center bg-gray-50 text-gray-400">
                <div className="text-center">
                    <MessageCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>בחר שיחה מהרשימה</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col bg-gray-50 w-full" style={{ maxHeight: 'calc(100vh - 120px)' }}>
            {/* Header */}
            <div className="bg-white border-b p-3 flex items-center gap-2">
                <button onClick={() => onBack?.()} className="md:hidden text-[#44512C] text-xl px-1" aria-label="חזרה לרשימה">←</button>
                <div className="flex-1">
                    <div className="font-bold">{contactName || fmtPhone(contactPhone)}</div>
                    <div className="text-xs text-gray-500">{fmtPhone(contactPhone)}</div>
                </div>
                <button
                    onClick={() => onDelete?.()}
                    className="text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg px-2 py-1 text-sm"
                    title="מחק שיחה"
                    aria-label="מחק שיחה"
                >
                    🗑️
                </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
                {messages.length === 0 && <div className="text-center text-gray-400 text-sm py-8">אין הודעות עדיין</div>}
                {messages.map(m => {
                    const isMe = m.direction === 'outbound';
                    return (
                        <div key={m.id} className={`flex ${isMe ? 'justify-start' : 'justify-end'}`}>
                            <div className={`max-w-md rounded-2xl px-3 py-2 shadow-sm ${isMe
                                ? 'bg-emerald-100 border border-emerald-200'
                                : 'bg-white border border-gray-200'}`}>
                                <div className="text-sm whitespace-pre-wrap break-words">{m.body || (m.num_media > 0 ? '📎 קובץ מצורף' : '')}</div>
                                <div className={`text-[10px] mt-1 ${isMe ? 'text-emerald-700' : 'text-gray-400'} flex items-center justify-end gap-1`}>
                                    {fmtTime(m.created_at)}
                                    {isMe && m.status && <span className="opacity-70">· {m.status}</span>}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Reply input */}
            <div className="bg-white border-t p-3">
                {error && <p className="text-xs text-red-700 mb-2">❌ {error}</p>}
                <div className="flex flex-wrap gap-1.5 mb-2">
                    {quickTemplates.map(t => (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setText(t.text)}
                            disabled={sending}
                            className="text-xs px-2.5 py-1 rounded-full border border-[#D9BD83] bg-[#F4ECD8] hover:bg-[#D9BD83] text-[#7A3722] transition-colors disabled:opacity-50"
                            title={t.text}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
                <div className="flex gap-2">
                    <Input
                        value={text}
                        onChange={e => setText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
                        placeholder="כתוב הודעה..."
                        disabled={sending}
                        className="flex-1"
                    />
                    <Button onClick={submit} disabled={sending || !text.trim()} className="bg-emerald-600 hover:bg-emerald-700">
                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Enter לשליחה · Shift+Enter לשורה חדשה</p>
            </div>
        </div>
    );
}

export default function AdminWhatsAppInbox() {
    const [conversations, setConversations] = useState([]);
    const [activeContact, setActiveContact] = useState(null);
    const [activeContactName, setActiveContactName] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loadingList, setLoadingList] = useState(true);
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState(null);

    const loadConversations = async () => {
        try {
            const res = await base44.functions.getWhatsAppConversations({});
            const r = res?.data ?? res;
            setConversations(r?.conversations || []);
        } catch (e) {
            // silent — keep showing existing data
        } finally {
            setLoadingList(false);
        }
    };

    const loadMessages = async (phone) => {
        if (!phone) { setMessages([]); return; }
        try {
            const res = await base44.functions.getWhatsAppMessages({ contact_phone: phone });
            const r = res?.data ?? res;
            setMessages(r?.messages || []);
        } catch (e) { /* silent */ }
    };

    const markRead = async () => {
        if (!activeContact) return;
        try {
            await base44.functions.markWhatsAppConversationRead({ contact_phone: activeContact });
            loadConversations();  // refresh unread badges
        } catch (e) { /* silent */ }
    };

    const deleteConv = async () => {
        if (!activeContact) return;
        const name = conversations.find(c => c.contact_phone === activeContact)?.contact_name || activeContact;
        if (!confirm(`למחוק את כל השיחה עם ${name}?\n\nכל ההודעות (נכנסות + יוצאות) יימחקו לצמיתות מהDB. הלקוח עדיין יוכל לשלוח הודעה חדשה — היא תפתח שיחה חדשה.`)) return;
        try {
            const res = await base44.functions.deleteWhatsAppConversation({ contact_phone: activeContact });
            const r = res?.data ?? res;
            if (!r?.ok) throw new Error(r?.message || 'failed');
            setActiveContact(null);
            setMessages([]);
            loadConversations();
        } catch (e) {
            alert('שגיאה במחיקה: ' + (e?.message || e));
        }
    };

    const send = async (text) => {
        if (!activeContact) return;
        setSending(true); setSendError(null);
        try {
            const res = await base44.functions.sendWhatsAppReply({ contact_phone: activeContact, message: text });
            const r = res?.data ?? res;
            if (!r?.ok) throw new Error(r?.result?.reason || r?.message || 'failed');
            // Optimistic: add the message immediately
            setMessages(prev => [...prev, {
                id: 'temp-' + Date.now(),
                direction: 'outbound',
                body: text,
                created_at: new Date().toISOString(),
                status: 'sent',
            }]);
            // Refresh after a moment to get the real row
            setTimeout(() => { loadMessages(activeContact); loadConversations(); }, 1200);
        } catch (e) { setSendError(e?.message || String(e)); }
        finally { setSending(false); }
    };

    useEffect(() => {
        loadConversations();
        const i = setInterval(() => {
            loadConversations();
            if (activeContact) loadMessages(activeContact);
        }, 8_000);
        return () => clearInterval(i);
    }, [activeContact]);

    useEffect(() => {
        if (activeContact) {
            loadMessages(activeContact);
            const conv = conversations.find(c => c.contact_phone === activeContact);
            setActiveContactName(conv?.contact_name || null);
        }
    }, [activeContact]);

    return (
        <div className="p-4" dir="rtl">
            <PageHeader
                title="WhatsApp Inbox"
                subtitle="הודעות נכנסות מ-WhatsApp מופיעות כאן בזמן אמת (אחרי שתגדיר webhook ב-Twilio). לחץ על שיחה כדי לראות את ההיסטוריה ולהגיב."
                icon={MessageCircle}
                action={
                    <Button variant="outline" size="sm" onClick={loadConversations}>
                        <RefreshCw className={`w-3 h-3 ml-1 ${loadingList ? 'animate-spin' : ''}`} />
                        רענן
                    </Button>
                }
            />

            <Card className="overflow-hidden flex" style={{ minHeight: '600px' }}>
                <ConversationList
                    conversations={conversations}
                    activeContact={activeContact}
                    onSelect={setActiveContact}
                    loading={loadingList}
                />
                <MessageThread
                    messages={messages}
                    sending={sending}
                    error={sendError}
                    onSend={send}
                    onMarkRead={markRead}
                    onBack={() => setActiveContact(null)}
                    onDelete={deleteConv}
                    contactPhone={activeContact}
                    contactName={activeContactName}
                />
            </Card>

            <details className="mt-4 bg-amber-50 border border-amber-200 rounded-lg">
                <summary className="cursor-pointer p-3 text-sm font-bold text-amber-900 select-none">
                    הגדרת Webhook ב-Twilio (פעם אחת — לחץ להרחבה)
                </summary>
                <div className="p-3 pt-0 border-t border-amber-200">
                    <p className="text-xs text-amber-800 mb-2">
                        URL להעתיק ל-Twilio Console:
                    </p>
                    <div className="bg-white border rounded p-2 font-mono text-[10px] md:text-xs select-all break-all">
                        https://topalena.com/api/twilio/whatsapp-inbox
                    </div>
                    <p className="text-xs text-amber-800 mt-2 leading-relaxed">
                        <b>איך:</b> Twilio Console → Messaging → Senders → WhatsApp Senders → +1 681-293-1920 → Inbound Settings → "When a message comes in" → <b>Webhook</b> → הדבק את ה-URL → Method = POST → Save.
                    </p>
                </div>
            </details>
        </div>
    );
}
