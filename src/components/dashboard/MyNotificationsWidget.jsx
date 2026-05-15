import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function MyNotificationsWidget() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const user = await base44.auth.me();
        const today = new Date(); today.setDate(today.getDate() - 3);
        const msgs = await base44.entities.ShiftMessage.list('-created_date', 10);
        setMessages(msgs.slice(0, 4));
      } catch {} finally { setLoading(false); }
    };
    load();
  }, []);

  return (
    <Link to={createPageUrl("ShiftChat")}>
      <Card className="hover:shadow-lg transition-all cursor-pointer hover:scale-[1.02]">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Bell className="w-4 h-4 text-blue-500" />
            הודעות אחרונות
            {messages.length > 0 && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full mr-auto">{messages.length}</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {loading ? <p className="text-sm text-muted-foreground">טוען...</p> :
            messages.length === 0 ? <p className="text-sm text-muted-foreground">אין הודעות חדשות</p> :
            <div className="space-y-2">
              {messages.map((m, i) => (
                <div key={m.id || i} className="flex items-start gap-2">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-blue-700">{(m.sender_name || m.author || '?').charAt(0)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate flex-1">{m.message || m.content || '...'}</p>
                </div>
              ))}
            </div>
          }
        </CardContent>
      </Card>
    </Link>
  );
}