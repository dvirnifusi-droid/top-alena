import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { User } from '@/entities/User';
import { format } from 'date-fns';
import { Send, Megaphone, AlertCircle, MessageCircle, Users } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function ShiftChat() {
    const [user, setUser] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [selectedShift, setSelectedShift] = useState('general');
    const [messageType, setMessageType] = useState('text');
    const [loading, setLoading] = useState(true);
    const bottomRef = useRef(null);
    const today = format(new Date(), 'yyyy-MM-dd');

    useEffect(() => {
        User.me().then(u => {
            setUser(u);
            loadMessages();
        });
    }, [selectedShift]);

    useEffect(() => {
        // subscribe to real-time updates
        const unsub = base44.entities.ShiftMessage.subscribe((event) => {
            if (event.type === 'create') {
                setMessages(prev => [...prev, event.data]);
                markAsRead(event.data, user?.id);
            }
        });
        return unsub;
    }, [user]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const loadMessages = async () => {
        setLoading(true);
        const msgs = await base44.entities.ShiftMessage.filter(
            { shift_date: today, shift_type: selectedShift },
            'created_date',
            100
        );
        setMessages(msgs);
        setLoading(false);
    };

    const markAsRead = async (msg, userId) => {
        if (!userId || msg.read_by?.includes(userId)) return;
        await base44.entities.ShiftMessage.update(msg.id, {
            read_by: [...(msg.read_by || []), userId]
        });
    };

    const sendMessage = async () => {
        if (!newMessage.trim() || !user) return;
        await base44.entities.ShiftMessage.create({
            sender_id: user.id,
            sender_name: user.full_name,
            sender_role: user.role,
            message: newMessage.trim(),
            shift_date: today,
            shift_type: selectedShift,
            message_type: messageType,
            read_by: [user.id]
        });
        setNewMessage('');
        setMessageType('text');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const shiftLabels = {
        lunch: '☀️ צהריים',
        dinner: '🌙 ערב',
        general: '💬 כללי'
    };

    const msgTypeStyle = {
        text: 'bg-white border border-gray-200',
        announcement: 'bg-blue-50 border border-blue-200',
        urgent: 'bg-red-50 border border-red-200'
    };

    const msgTypeIcon = {
        text: null,
        announcement: <Megaphone className="w-3.5 h-3.5 text-blue-500" />,
        urgent: <AlertCircle className="w-3.5 h-3.5 text-red-500" />
    };

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)] max-w-3xl mx-auto" dir="rtl">

            {/* כותרת */}
            <div className="mb-4">
                <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                    <MessageCircle className="w-6 h-6 text-indigo-600" />
                    צ'אט משמרת
                </h1>
                <p className="text-slate-500 text-sm mt-1">תקשורת פנימית לצוות המשמרת</p>
            </div>

            {/* בחירת ערוץ */}
            <div className="flex gap-2 mb-4">
                {['general', 'lunch', 'dinner'].map(shift => (
                    <Button
                        key={shift}
                        variant={selectedShift === shift ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedShift(shift)}
                        className="text-sm"
                    >
                        {shiftLabels[shift]}
                    </Button>
                ))}
            </div>

            {/* הודעות */}
            <div className="flex-1 overflow-y-auto bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
                {loading ? (
                    <div className="text-center text-slate-400 py-8">טוען הודעות...</div>
                ) : messages.length === 0 ? (
                    <div className="text-center text-slate-400 py-12 flex flex-col items-center gap-3">
                        <Users className="w-12 h-12 text-slate-300" />
                        <p className="font-medium">אין הודעות עדיין</p>
                        <p className="text-sm">היה הראשון לכתוב הודעה לצוות!</p>
                    </div>
                ) : (
                    messages.map(msg => {
                        const isMe = msg.sender_id === user?.id;
                        const isAdmin = msg.sender_role === 'admin';
                        return (
                            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                <div className="flex items-center gap-1.5 mb-1">
                                    {!isMe && (
                                        <>
                                            <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700">
                                                {msg.sender_name?.charAt(0)}
                                            </div>
                                            <span className="text-xs font-semibold text-slate-600">{msg.sender_name}</span>
                                            {isAdmin && <Badge className="text-[10px] py-0 px-1.5 h-4 bg-indigo-600">מנהל</Badge>}
                                            {msgTypeIcon[msg.message_type]}
                                        </>
                                    )}
                                    {isMe && msgTypeIcon[msg.message_type]}
                                    <span className="text-[11px] text-slate-400">
                                        {msg.created_date ? format(new Date(msg.created_date), 'HH:mm') : ''}
                                    </span>
                                </div>
                                <div className={`max-w-xs md:max-w-md rounded-2xl px-4 py-2.5 text-sm shadow-sm whitespace-pre-wrap ${
                                    isMe
                                        ? 'bg-indigo-600 text-white rounded-tr-sm'
                                        : `${msgTypeStyle[msg.message_type]} text-slate-800 rounded-tl-sm`
                                }`}>
                                    {msg.message_type === 'urgent' && !isMe && (
                                        <div className="text-red-600 font-bold text-xs mb-1 flex items-center gap-1">
                                            <AlertCircle className="w-3 h-3" /> דחוף!
                                        </div>
                                    )}
                                    {msg.message_type === 'announcement' && !isMe && (
                                        <div className="text-blue-600 font-bold text-xs mb-1 flex items-center gap-1">
                                            <Megaphone className="w-3 h-3" /> הודעה לצוות
                                        </div>
                                    )}
                                    {msg.message}
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={bottomRef} />
            </div>

            {/* שליחת הודעה */}
            <div className="mt-3 bg-white rounded-xl border border-slate-200 p-3 space-y-2">
                {user?.role === 'admin' && (
                    <div className="flex gap-2">
                        {[
                            { value: 'text', label: 'רגיל' },
                            { value: 'announcement', label: '📢 הודעה לצוות' },
                            { value: 'urgent', label: '🚨 דחוף' }
                        ].map(t => (
                            <button
                                key={t.value}
                                onClick={() => setMessageType(t.value)}
                                className={`text-xs px-3 py-1 rounded-full border transition-all ${
                                    messageType === t.value
                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                )}
                <div className="flex gap-2 items-end">
                    <Textarea
                        value={newMessage}
                        onChange={e => setNewMessage(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="כתוב הודעה... (Enter לשליחה)"
                        className="flex-1 resize-none text-sm min-h-[44px] max-h-28"
                        rows={1}
                    />
                    <Button
                        onClick={sendMessage}
                        disabled={!newMessage.trim()}
                        className="bg-indigo-600 hover:bg-indigo-700 h-11 w-11 p-0"
                    >
                        <Send className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}