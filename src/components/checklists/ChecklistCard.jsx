import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Edit, Trash2, MoreHorizontal, CheckSquare, User, Users, Download, ClipboardList } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const COLOR_MAP = {
    emerald: { gradient: 'from-emerald-500 to-cyan-500', hover: 'hover:from-emerald-600 hover:to-cyan-600', bg: 'from-emerald-50 via-cyan-50 to-teal-50', border: 'border-emerald-100', header: 'bg-emerald-500' },
    blue:    { gradient: 'from-blue-500 to-indigo-500',  hover: 'hover:from-blue-600 hover:to-indigo-600',  bg: 'from-blue-50 via-indigo-50 to-sky-50',     border: 'border-blue-100',    header: 'bg-blue-500'    },
    orange:  { gradient: 'from-orange-500 to-amber-500', hover: 'hover:from-orange-600 hover:to-amber-600', bg: 'from-orange-50 via-amber-50 to-yellow-50', border: 'border-orange-100',  header: 'bg-orange-500'  },
    purple:  { gradient: 'from-purple-500 to-violet-500',hover: 'hover:from-purple-600 hover:to-violet-600',bg: 'from-purple-50 via-violet-50 to-fuchsia-50',border: 'border-purple-100', header: 'bg-purple-500'  },
    pink:    { gradient: 'from-pink-500 to-rose-500',    hover: 'hover:from-pink-600 hover:to-rose-600',    bg: 'from-pink-50 via-rose-50 to-fuchsia-50',   border: 'border-pink-100',    header: 'bg-pink-500'    },
    yellow:  { gradient: 'from-yellow-500 to-orange-400',hover: 'hover:from-yellow-600 hover:to-orange-500',bg: 'from-yellow-50 via-orange-50 to-amber-50', border: 'border-yellow-100',  header: 'bg-yellow-500'  },
    red:     { gradient: 'from-red-500 to-rose-500',     hover: 'hover:from-red-600 hover:to-rose-600',     bg: 'from-red-50 via-rose-50 to-pink-50',       border: 'border-red-100',     header: 'bg-red-500'     },
    cyan:    { gradient: 'from-cyan-500 to-sky-500',     hover: 'hover:from-cyan-600 hover:to-sky-600',     bg: 'from-cyan-50 via-sky-50 to-blue-50',       border: 'border-cyan-100',    header: 'bg-cyan-500'    },
};

const SHIFT_LABELS = {
    morning:  { label: 'משמרת בוקר',  emoji: '🌅' },
    evening:  { label: 'משמרת ערב',   emoji: '🌆' },
    thursday: { label: 'משמרת חמישי', emoji: '🎉' },
    all:      { label: 'כל המשמרות',  emoji: '🔁' },
};

export default function ChecklistCard({ checklist, onStart, executions, onEdit, onDelete, onAssignTasks, onLiveRun }) {
    const [isDeleting, setIsDeleting] = useState(false);

    const exportToPdf = () => {
        const items = checklist.items || [];
        const shiftLabel = SHIFT_LABELS[checklist.shift]?.label || '';
        const date = new Date().toLocaleDateString('he-IL');

        const html = `
            <html dir="rtl">
            <head>
                <meta charset="utf-8">
                <title>${checklist.title}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 30px; color: #222; }
                    h1 { font-size: 24px; border-bottom: 2px solid #333; padding-bottom: 8px; }
                    .meta { color: #666; font-size: 14px; margin-bottom: 20px; }
                    .item { display: flex; align-items: flex-start; gap: 10px; padding: 10px 0; border-bottom: 1px solid #eee; }
                    .checkbox { width: 20px; height: 20px; border: 2px solid #555; border-radius: 4px; flex-shrink: 0; margin-top: 2px; }
                    .item-text { font-size: 15px; }
                    .item-note { font-size: 12px; color: #888; margin-top: 3px; }
                    .footer { margin-top: 30px; font-size: 13px; color: #999; }
                    .sign-area { margin-top: 40px; border-top: 1px solid #aaa; padding-top: 10px; display: flex; justify-content: space-between; }
                </style>
            </head>
            <body>
                <h1>${checklist.title}</h1>
                <div class="meta">
                    ${shiftLabel ? `<span>${shiftLabel} · </span>` : ''}
                    <span>תאריך: ${date}</span>
                    · <span>${items.length} פריטים</span>
                </div>
                ${checklist.description ? `<p style="color:#555;margin-bottom:16px">${checklist.description}</p>` : ''}
                <div>
                    ${items.map((item, i) => `
                        <div class="item">
                            <div class="checkbox"></div>
                            <div>
                                <div class="item-text">${i + 1}. ${item.text || item.title || item}</div>
                                ${item.notes ? `<div class="item-note">📝 ${item.notes}</div>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="sign-area">
                    <span>חתימת מבצע: __________________</span>
                    <span>חתימת מנהל: __________________</span>
                </div>
                <div class="footer">הופק מ-TOP APOLLO · ${date}</div>
            </body>
            </html>
        `;

        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 500);
    };
    const colors = COLOR_MAP[checklist.color] || COLOR_MAP.emerald;
    const shiftInfo = SHIFT_LABELS[checklist.shift] || null;

    const getLastExecution = () => {
        const today = new Date().toISOString().split('T')[0];
        return executions.find(e => e.execution_date.startsWith(today));
    };

    const lastExecution = getLastExecution();

    const getStatusBadge = () => {
        if (!lastExecution) {
            return <Badge variant="outline" className="bg-gray-100">לא הושלם היום</Badge>;
        }

        switch (lastExecution.status) {
            case 'completed':
                return <Badge className="bg-green-100 text-green-800">הושלם</Badge>;
            case 'in_progress':
                return <Badge className="bg-blue-100 text-blue-800">בתהליך</Badge>;
            case 'requires_attention':
                return <Badge className="bg-red-100 text-red-800">דורש תשומת לב</Badge>;
            default:
                return <Badge variant="outline">לא ידוע</Badge>;
        }
    };

    const handleDelete = async () => {
        const confirmMessage = `האם אתה בטוח שברצונך למחוק את הצ'קליסט "${checklist.title}"? פעולה זו בלתי הפיכה.`;
        if (window.confirm(confirmMessage)) {
            setIsDeleting(true);
            try {
                await onDelete(checklist.id);
            } catch (error) {
                console.error('Error deleting checklist:', error);
                alert('שגיאה במחיקת הצ\'קליסט. נסה שוב.');
            } finally {
                setIsDeleting(false);
            }
        }
    };

    return (
        <Card className="group relative overflow-hidden bg-white border-0 shadow-xl hover:shadow-2xl transition-all duration-500 rounded-2xl flex flex-col h-full">
            {/* רקע צבעוני לפי צבע הצ'קליסט */}
            <div className={`absolute inset-0 bg-gradient-to-br ${colors.bg} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>
            {/* פס צבע עליון */}
            <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${colors.gradient} rounded-t-2xl`}></div>
            
            <div className="absolute top-4 left-4 z-10">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-10 h-10 p-0 rounded-full bg-white/70 hover:bg-white shadow-lg border border-white/50">
                            <MoreHorizontal className="w-5 h-5 text-gray-700" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-white/95 backdrop-blur-sm border border-white/50 shadow-xl rounded-2xl">
                        <DropdownMenuItem onClick={() => onEdit(checklist)} className="rounded-xl">
                            <Edit className="w-4 h-4 ml-2" />
                            ערוך צ'קליסט
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onAssignTasks(checklist)} className="rounded-xl">
                            <Users className="w-4 h-4 ml-2" />
                            שייך משימות
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={exportToPdf} className="rounded-xl">
                            <Download className="w-4 h-4 ml-2" />
                            ייצוא PDF להדפסה
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                            onClick={handleDelete}
                            className="text-red-600 focus:text-red-600 rounded-xl"
                            disabled={isDeleting}
                        >
                            <Trash2 className="w-4 h-4 ml-2" />
                            {isDeleting ? 'מוחק...' : 'מחק צ\'קליסט'}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <CardHeader className="relative pb-4">
                <div className="flex justify-between items-start pr-14">
                    <div className="space-y-2">
                        <CardTitle className="text-2xl font-bold text-gray-800 group-hover:text-emerald-700 transition-colors duration-300">
                            {checklist.title}
                        </CardTitle>
                        <CardDescription className="text-gray-600 text-base line-clamp-2 min-h-[2.5rem]">
                            {checklist.description}
                        </CardDescription>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        {getStatusBadge()}
                        {shiftInfo && checklist.shift !== 'all' && (
                            <Badge variant="outline" className="text-xs font-semibold">
                                {shiftInfo.emoji} {shiftInfo.label}
                            </Badge>
                        )}
                    </div>
                </div>
            </CardHeader>

            <CardContent className="relative flex-grow flex flex-col justify-between">
                <div className="space-y-6">
                    <div className="flex justify-between text-sm bg-gradient-to-r from-gray-50 to-blue-50 p-4 rounded-2xl border border-gray-100">
                        <div className="flex items-center gap-2 text-gray-700">
                            <CheckSquare className="w-4 h-4 text-emerald-500" />
                            <span className="font-semibold">פריטים: {checklist.items?.length || 0}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-700">
                            <User className="w-4 h-4 text-blue-500" />
                            <span className="font-semibold">תפקיד: {checklist.assigned_role || 'לכל התפקידים'}</span>
                        </div>
                    </div>
                    
                    {lastExecution && (
                        <div className="text-sm text-gray-600 p-5 bg-gradient-to-r from-blue-50 via-cyan-50 to-emerald-50 rounded-2xl border border-blue-100 space-y-2">
                            <h4 className="font-bold text-gray-800 text-base mb-3">📊 ביצוע אחרון</h4>
                            <p><strong>תאריך:</strong> {new Date(lastExecution.execution_date).toLocaleString('he-IL')}</p>
                            {lastExecution.executed_by_name && (
                                <p><strong>בוצע ע"י:</strong> <span className="text-blue-600 font-semibold">{lastExecution.executed_by_name}</span></p>
                            )}
                            {lastExecution.approving_manager_name && (
                                <p><strong>אושר ע"י:</strong> <span className="text-green-600 font-semibold">{lastExecution.approving_manager_name}</span></p>
                            )}
                            {lastExecution.overall_score != null && (
                                <p><strong>ציון:</strong> <span className="text-purple-600 font-bold text-lg">{lastExecution.overall_score}%</span></p>
                            )}
                        </div>
                    )}
                </div>
                <div className="mt-6">
                    <Button
                        onClick={() => onStart(checklist)}
                        className={`w-full h-12 text-lg font-bold rounded-2xl shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-105 text-white bg-gradient-to-r ${
                            lastExecution && lastExecution.status === 'completed'
                                ? 'from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600'
                                : `${colors.gradient} ${colors.hover}`
                        }`}
                    >
                        <Play className="w-6 h-6 ml-3" />
                        {lastExecution && lastExecution.status === 'completed'
                            ? '🔄 התחל מחדש (הושלם היום)'
                            : '🚀 התחל ביצוע'
                        }
                    </Button>
                    {onLiveRun && (
                        <Button
                            onClick={() => onLiveRun(checklist)}
                            variant="outline"
                            className="w-full h-12 text-base font-bold rounded-2xl mt-2 border-2 border-orange-300 text-orange-700 hover:bg-orange-50 bg-white/70"
                        >
                            <ClipboardList className="w-5 h-5 ml-2" />
                            📋 תצוגת הכנות (לייב)
                        </Button>
                    )}
                    <p className="text-[11px] text-gray-400 text-center mt-1.5">ביצוע = מילוי מודרך וחתימה · תצוגת הכנות = סימון מהיר משותף</p>
                </div>
            </CardContent>
        </Card>
    );
}