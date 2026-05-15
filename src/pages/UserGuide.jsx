import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users, BarChart3, GraduationCap, CheckSquare, Calendar, Banknote,
  MessageSquare, AlertTriangle, Package, ChevronDown, ChevronUp,
  Play, BookOpen, Crown, Utensils, Clock, Star
} from "lucide-react";
import { base44 } from "@/api/base44Client";

const sections = [
  {
    id: "intro",
    icon: Crown,
    title: "מבוא למערכת TOP ALENA",
    color: "bg-green-100 text-green-700",
    audience: ["מנהל", "עובד"],
    video: "",
    image: "https://media.base44.com/images/public/68ac71d972dff18b98e30a21/c591d49b9_generated_image.png",
    content: [
      { title: "מה זה TOP ALENA?", text: "מערכת ניהול מסעדה כוללת — מעובדים, משמרות, טיפים, הכשרות, לקוחות ועוד. הכל במקום אחד." },
      { title: "איך נכנסים?", text: "נכנסים דרך הקישור של המסעדה. מנהלים יועברו ללוח הבקרה, עובדים לאזור האישי שלהם." },
      { title: "ניווט", text: "התפריט נמצא בצד ימין (מחשב) או בלחיצה על כפתור התפריט (נייד). כל סעיף מוביל לכלי אחר." },
    ]
  },
  {
    id: "dashboard",
    icon: BarChart3,
    title: "לוח בקרה למנהל",
    color: "bg-blue-100 text-blue-700",
    audience: ["מנהל"],
    video: "",
    image: "https://media.base44.com/images/public/68ac71d972dff18b98e30a21/c591d49b9_generated_image.png",
    content: [
      { title: "סטטיסטיקות מהירות", text: "בחלק העליון רואים: הזמנות היום, הכנסות, סטטוס צ'קליסטים ותקריות פתוחות." },
      { title: "כלי AI", text: "הכפתורים הירוקים פותחים כלי AI: סריקת חשבוניות, עזרת הושבה, ויועץ שיווקי." },
      { title: "גיוס עובדים", text: "כרטיס הגיוס מציג מועמדים שהגיעו דרך הוואטסאפ. לחיצה על מועמד פותחת את הפרופיל שלו." },
    ]
  },
  {
    id: "scheduling",
    icon: Calendar,
    title: "סידור עבודה",
    color: "bg-purple-100 text-purple-700",
    audience: ["מנהל", "עובד"],
    video: "",
    image: "https://media.base44.com/images/public/68ac71d972dff18b98e30a21/49508c698_generated_image.png",
    content: [
      { title: "יצירת משמרת (מנהל)", text: "נכנסים לסידור עבודה → לחיצה על + → בוחרים תאריך, סוג משמרת (צהריים/ערב) ומוסיפים עובדים." },
      { title: "שיבוץ עובדים", text: "גוררים עובדים לתפקידים או לוחצים 'שיבוץ מהיר'. ניתן לראות את הזמינות שהגיש כל עובד." },
      { title: "הגשת זמינות (עובד)", text: "נכנסים ל'הגשת זמינות' → מסמנים את הימים הפנויים → שולחים. המנהל רואה את זה מיד." },
      { title: "החלפת משמרות", text: "עובד יכול לבקש החלפה מהאזור האישי שלו. המנהל מאשר/דוחה ומקבל התראה." },
    ]
  },
  {
    id: "tips",
    icon: Banknote,
    title: "ניהול טיפים",
    color: "bg-yellow-100 text-yellow-700",
    audience: ["מנהל", "עובד"],
    video: "",
    image: "https://media.base44.com/images/public/68ac71d972dff18b98e30a21/eaf15ada1_generated_image.png",
    content: [
      { title: "פתיחת דוח טיפים", text: "נכנסים לניהול טיפים → בוחרים תאריך ומשמרת → מזינים סך הטיפים שנאספו." },
      { title: "חישוב אוטומטי", text: "המערכת מחשבת אוטומטית טיפ לשעה לפי שעות עבודה בפועל של כל עובד, בניכוי ארוחות ורנרים." },
      { title: "אישור עובדים", text: "כל עובד רואה את הסכום שלו ויכול לאשר דיגיטלית. אחרי שכולם אישרו — נועלים את הדוח." },
    ]
  },
  {
    id: "training",
    icon: GraduationCap,
    title: "הכשרות ואימונים",
    color: "bg-orange-100 text-orange-700",
    audience: ["מנהל", "עובד"],
    video: "",
    image: "https://media.base44.com/images/public/68ac71d972dff18b98e30a21/126bc570f_generated_image.png",
    content: [
      { title: "אימון תפריט עם AI", text: "בלוח הבקרה → לחיצה על 'דביר' (הבוט הירוק) → בוחרים 'אימון תפריט' → הבוט שואל שאלות על מנות." },
      { title: "סרטוני הדרכה", text: "בסרטוני הדרכה תמצאו סרטונים לפי קטגוריות. לחיצה על סרטון מפעילה אותו ישירות." },
      { title: "מבחנים וחידונים", text: "בהכשרות ואימונים יש קורסים עם מבחנים. ציון עובר מוסיף מטבעות לחשבון הגמיפיקציה." },
      { title: "לוח המובילים", text: "עובדים יכולים לראות את הדירוג שלהם מול שאר הצוות. תחרות בריאה מגבירה מוטיבציה!" },
    ]
  },
  {
    id: "checklists",
    icon: CheckSquare,
    title: "צ'קליסטים",
    color: "bg-teal-100 text-teal-700",
    audience: ["מנהל", "עובד"],
    video: "",
    image: "https://media.base44.com/images/public/68ac71d972dff18b98e30a21/660ae1e13_generated_image.png",
    content: [
      { title: "ביצוע צ'קליסט (עובד)", text: "נכנסים לצ'קליסטים → בוחרים את הצ'קליסט המשויך אליכם → מסמנים כל משימה → שולחים." },
      { title: "יצירת צ'קליסט (מנהל)", text: "ניהול צ'קליסטים → + חדש → מוסיפים משימות, קובעים מי אחראי ומתי לבצע." },
      { title: "מעקב ביצוע", text: "המנהל רואה בלוח הבקרה אחוז ביצוע של כל צ'קליסט בזמן אמת." },
    ]
  },
  {
    id: "queue",
    icon: Users,
    title: "ניהול תור",
    color: "bg-pink-100 text-pink-700",
    audience: ["מנהל", "עובד"],
    video: "",
    image: "https://media.base44.com/images/public/68ac71d972dff18b98e30a21/1569d0b1f_generated_image.png",
    content: [
      { title: "הרשמה לתור (לקוח)", text: "הלקוח סורק QR או נכנס לקישור → ממלא שם, טלפון וגודל קבוצה → מקבל SMS עם מיקום בתור." },
      { title: "דאשבורד מארחת", text: "בדאשבורד תור רואים את כל הממתינים. לחיצה על 'זמן!' שולחת SMS ללקוח שהשולחן מוכן." },
      { title: "משחקי המתנה", text: "ממתינים יכולים לשחק טריוויה בזמן ההמתנה. ניתן לנהל את השאלות תחת ניהול משחקים." },
    ]
  },
  {
    id: "incidents",
    icon: AlertTriangle,
    title: "תקריות",
    color: "bg-red-100 text-red-700",
    audience: ["מנהל", "עובד"],
    video: "",
    image: "https://media.base44.com/images/public/68ac71d972dff18b98e30a21/cea0de44f_generated_image.png",
    content: [
      { title: "דיווח תקרית", text: "כל עובד יכול לדווח תקרית: נכנסים לתקריות → + חדשה → מתארים מה קרה, קטגוריה וחומרה." },
      { title: "מעקב", text: "מנהלים מקבלים התראה על כל תקרית חדשה. ניתן לעדכן סטטוס ולהוסיף פתרון." },
    ]
  },
  {
    id: "deliveries",
    icon: Package,
    title: "משלוחים",
    color: "bg-indigo-100 text-indigo-700",
    audience: ["מנהל", "עובד"],
    video: "",
    image: "https://media.base44.com/images/public/68ac71d972dff18b98e30a21/4465c2aeb_generated_image.png",
    content: [
      { title: "רישום משלוח", text: "נכנסים למשלוחים → + חדש → מזינים פרטי לקוח, כתובת ופלטפורמה (Wolt/תן ביס/וכד')." },
      { title: "מעקב שליח", text: "במעקב שליחים חי ניתן לראות היכן כל שליח נמצא על המפה בזמן אמת." },
      { title: "מועדון לקוחות משלוחים", text: "לקוחות חוזרים מקבלים הטבות אוטומטיות לפי מספר הזמנות." },
    ]
  },
  {
    id: "gamification",
    icon: Star,
    title: "גמיפיקציה ומטבעות",
    color: "bg-amber-100 text-amber-700",
    audience: ["עובד"],
    video: "",
    image: "https://media.base44.com/images/public/68ac71d972dff18b98e30a21/b8f7540dd_generated_image.png",
    content: [
      { title: "מטבעות עלינא", text: "צוברים מטבעות על: השלמת הכשרות, הגשת זמינות, ביצוע צ'קליסטים, ועוד." },
      { title: "חנות בגדים", text: "ניתן להשתמש במטבעות לקנות פריטי לבוש לדמות האישית שלכם." },
      { title: "סלון דמויות", text: "מתאימים את הדמות האישית שלכם — עיצוב, בגדים ואביזרים." },
    ]
  },
];

const VideoPlaceholder = ({ videoUrl, onSave, isAdmin }) => {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(videoUrl || "");

  const getEmbedUrl = (rawUrl) => {
    if (!rawUrl) return null;
    const ytMatch = rawUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
    const vimeoMatch = rawUrl.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    return rawUrl;
  };

  const embedUrl = getEmbedUrl(url);

  if (embedUrl) {
    return (
      <div className="mt-4">
        <div className="rounded-xl overflow-hidden aspect-video bg-black">
          <iframe src={embedUrl} className="w-full h-full" allowFullScreen title="סרטון הדרכה" />
        </div>
        {isAdmin && (
          <button onClick={() => setEditing(true)} className="text-xs text-muted-foreground mt-1 underline">
            החלף סרטון
          </button>
        )}
        {editing && (
          <div className="flex gap-2 mt-2">
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="הדבק קישור YouTube / Vimeo"
              className="border rounded px-2 py-1 text-sm flex-1"
            />
            <button onClick={() => { onSave(url); setEditing(false); }} className="bg-primary text-primary-foreground px-3 py-1 rounded text-sm">שמור</button>
            <button onClick={() => setEditing(false)} className="text-sm text-muted-foreground">ביטול</button>
          </div>
        )}
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="mt-4">
      {editing ? (
        <div className="flex gap-2">
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="הדבק קישור YouTube / Vimeo"
            className="border rounded px-2 py-1 text-sm flex-1"
          />
          <button onClick={() => { onSave(url); setEditing(false); }} className="bg-primary text-primary-foreground px-3 py-1 rounded text-sm">שמור</button>
          <button onClick={() => setEditing(false)} className="text-sm text-muted-foreground">ביטול</button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-2 text-sm text-muted-foreground border-2 border-dashed border-muted rounded-xl px-4 py-3 w-full hover:border-primary hover:text-primary transition-colors"
        >
          <Play className="w-4 h-4" />
          + הוסף סרטון הדרכה לנושא זה
        </button>
      )}
    </div>
  );
};

const Section = ({ section, isAdmin, videoUrls, onSaveVideo }) => {
  const [open, setOpen] = useState(false);
  const Icon = section.icon;

  return (
    <Card className="overflow-hidden">
      <button
        className="w-full text-right"
        onClick={() => setOpen(prev => !prev)}
      >
        <CardHeader className="flex flex-row items-center gap-4 py-4 px-6">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${section.color}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 text-right">
            <CardTitle className="text-base">{section.title}</CardTitle>
            <div className="flex gap-1 mt-1 flex-wrap">
              {section.audience.map(a => (
                <Badge key={a} variant="outline" className="text-xs">{a}</Badge>
              ))}
            </div>
          </div>
          {open ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
        </CardHeader>
      </button>

      {open && (
        <CardContent className="pt-0 px-6 pb-6 space-y-4">
          {section.image && (
            <div className="rounded-xl overflow-hidden border mt-2">
              <img src={section.image} alt={section.title} className="w-full object-cover max-h-56" />
            </div>
          )}
          <VideoPlaceholder
            videoUrl={videoUrls[section.id] || section.video}
            onSave={(url) => onSaveVideo(section.id, url)}
            isAdmin={isAdmin}
          />
          <div className="space-y-3 mt-4">
            {section.content.map((item, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <div>
                  <p className="font-semibold text-sm text-foreground">{item.title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
};

export default function UserGuide() {
  const [filter, setFilter] = useState("הכל");
  const [videoUrls, setVideoUrls] = useState({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [videoRecords, setVideoRecords] = useState({}); // sectionId -> record id

  useEffect(() => {
    const load = async () => {
      try {
        const user = await base44.auth.me();
        setIsAdmin(user?.role === 'admin');
      } catch {}

      try {
        const records = await base44.entities.TrainingVideo.filter({ category: "user_guide" });
        const urls = {};
        const ids = {};
        records.forEach(r => {
          urls[r.title] = r.video_url;
          ids[r.title] = r.id;
        });
        setVideoUrls(urls);
        setVideoRecords(ids);
      } catch {}
    };
    load();
  }, []);

  const filters = ["הכל", "מנהל", "עובד"];

  const filtered = sections.filter(s =>
    filter === "הכל" || s.audience.includes(filter)
  );

  const handleSaveVideo = async (sectionId, url) => {
    setVideoUrls(prev => ({ ...prev, [sectionId]: url }));
    try {
      if (videoRecords[sectionId]) {
        await base44.entities.TrainingVideo.update(videoRecords[sectionId], { video_url: url });
      } else {
        const created = await base44.entities.TrainingVideo.create({
          title: sectionId,
          category: "user_guide",
          video_url: url,
          is_active: true
        });
        setVideoRecords(prev => ({ ...prev, [sectionId]: created.id }));
      }
    } catch (e) {
      console.error("Failed to save video:", e);
    }
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-gradient-to-br from-primary to-accent rounded-2xl flex items-center justify-center mx-auto shadow-lg">
            <BookOpen className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-black text-foreground">מדריך שימוש</h1>
          <p className="text-muted-foreground">TOP ALENA — כל מה שצריך לדעת</p>
        </div>

        {/* Filter */}
        <div className="flex gap-2 justify-center">
          {filters.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-primary">{sections.length}</p>
            <p className="text-xs text-muted-foreground">נושאים</p>
          </div>
          <div className="bg-card border rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-primary">{sections.reduce((a, s) => a + s.content.length, 0)}</p>
            <p className="text-xs text-muted-foreground">מדריכים</p>
          </div>
          <div className="bg-card border rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-primary">{Object.values(videoUrls).filter(Boolean).length}</p>
            <p className="text-xs text-muted-foreground">סרטונים</p>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-3">
          {filtered.map(section => (
            <Section
              key={section.id}
              section={section}
              isAdmin={isAdmin}
              videoUrls={videoUrls}
              onSaveVideo={handleSaveVideo}
            />
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground pb-4">
          TOP ALENA v1.0 — לשאלות פנה למנהל המערכת
        </p>
      </div>
    </div>
  );
}