// Dashboard preview of WhatsApp conversations — shows latest 5 unread/recent
// with unread badge total. Click → opens /AdminWhatsAppInbox.
// Polls every 10s. Designed to live at the top of the dashboard so the owner
// notices new customer messages without leaving the page.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { MessageCircle, ChevronLeft, Loader2 } from 'lucide-react';
import { createPageUrl } from '@/utils';

function fmtPhone(p) {
    if (!p) return '';
    const s = String(p).replace(/^whatsapp:/, '');
    if (/^\+972/.test(s)) return ('0' + s.slice(4)).replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
    if (/^972/.test(s)) return ('0' + s.slice(3)).replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
    return s;
}

function fmtTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
}

export default function WhatsAppInboxWidget() {
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        try {
            const res = await base44.functions.getWhatsAppConversations({});
            const r = res?.data ?? res;
            setConversations(r?.conversations || []);
        } catch (e) {
            // silent — keep showing existing data
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        const i = setInterval(load, 10_000);
        return () => clearInterval(i);
    }, []);

    const totalUnread = conversations.reduce((s, c) => s + (c.unread_count || 0), 0);
    const preview = conversations.slice(0, 5);

    return (
        <Card className="mb-4" dir="rtl">
            <CardContent className="p-4">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <MessageCircle className="w-5 h-5 text-emerald-600" />
                            {totalUnread > 0 && (
                                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                                    {totalUnread > 9 ? '9+' : totalUnread}
                                </span>
                            )}
                        </div>
                        <h3 className="font-bold text-base">WhatsApp</h3>
                        <span className="text-xs text-gray-500">
                            {loading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : `${conversations.length} שיחות`}
                        </span>
                    </div>
                    <Link
                        to={createPageUrl('AdminWhatsAppInbox')}
                        className="text-xs text-emerald-600 hover:text-emerald-700 font-bold flex items-center gap-1"
                    >
                        פתח Inbox <ChevronLeft className="w-3 h-3" />
                    </Link>
                </div>

                {/* List */}
                {conversations.length === 0 ? (
                    <div className="text-center text-gray-400 text-sm py-6">
                        {loading ? 'טוען...' : 'אין שיחות עדיין'}
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {preview.map(c => {
                            const last = c.last_message;
                            const name = c.contact_name || fmtPhone(c.contact_phone);
                            return (
                                <Link
                                    key={c.contact_phone}
                                    to={createPageUrl('AdminWhatsAppInbox')}
                                    className="flex items-center gap-2 py-2 hover:bg-gray-50 transition-colors px-2 -mx-2 rounded"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-sm truncate">{name}</span>
                                            {c.unread_count > 0 && (
                                                <span className="bg-emerald-600 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
                                                    {c.unread_count}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs text-gray-600 truncate">
                                            {last.direction === 'outbound' && <span className="text-[#44512C]">↳ </span>}
                                            {last.body || (last.num_media > 0 ? '📎 קובץ' : '—')}
                                        </div>
                                    </div>
                                    <div className="text-[10px] text-gray-400 whitespace-nowrap">
                                        {fmtTime(last.created_at)}
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}

                {conversations.length > 5 && (
                    <Link
                        to={createPageUrl('AdminWhatsAppInbox')}
                        className="block text-center text-xs text-emerald-600 hover:text-emerald-700 mt-2 pt-2 border-t"
                    >
                        עוד {conversations.length - 5} שיחות ↓
                    </Link>
                )}
            </CardContent>
        </Card>
    );
}
