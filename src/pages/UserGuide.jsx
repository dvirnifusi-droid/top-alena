import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users, BarChart3, GraduationCap, CheckSquare, Calendar, Banknote,
  MessageSquare, AlertTriangle, Package, ChevronDown, ChevronUp,
  Play, BookOpen, Crown, Utensils, Clock, Star, Image, Upload, X, ZoomIn, Move
} from "lucide-react";
import { base44 } from "@/api/base44Client";

const sections = [
  {
    id: "intro",
    icon: Crown,
    title: "מבוא למערכת TOP APOLLO",
    color: "bg-green-100 text-green-700",
    audience: ["מנהל", "עובד"],
    content: [
      { title: "מה זה TOP APOLLO?", text: "מערכת ניהול מסעדה כוללת — מעובדים, משמרות, טיפים, הכשרות, לקוחות ועוד. הכל במקום אחד." },
      { title: "איך נכנסים?", text: "נכנסים דרך הקישור של המסעדה. מנהלים יועברו ללוח הבקרה, עובדים לאזור האישי שלהם." },
      { title: "ניווט", text: "התפריט נמצא בצד ימין (מחשב) או בלחיצה על כפתור התפריט (נייד). כל סעיף מוביל לכלי אחר." },
    ]
  },
  {
    id: "dashboard",
    icon: BarChart3,
    title: "לוח בקרה למנהל",
    color: "bg-[#F4ECD8] text-[#44512C]",
    audience: ["מנהל"],
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
    color: "bg-[#F4ECD8] text-[#7A3722]",
    audience: ["מנהל", "עובד"],
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
    color: "bg-[#F4ECD8] text-yellow-700",
    audience: ["מנהל", "עובד"],
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
    color: "bg-[#F4ECD8] text-[#7A3722]",
    audience: ["מנהל", "עובד"],
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
    content: [
      { title: "דיווח תקרית", text: "כל עובד יכול לדווח תקרית: נכנסים לתקריות → + חדשה → מתארים מה קרה, קטגוריה וחומרה." },
      { title: "מעקב", text: "מנהלים מקבלים התראה על כל תקרית חדשה. ניתן לעדכן סטטוס ולהוסיף פתרון." },
    ]
  },
  {
    id: "deliveries",
    icon: Package,
    title: "משלוחים",
    color: "bg-[#F4ECD8] text-[#7A3722]",
    audience: ["מנהל", "עובד"],
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
    content: [
      { title: "מטבעות עלינא", text: "צוברים מטבעות על: השלמת הכשרות, הגשת זמינות, ביצוע צ'קליסטים, ועוד." },
      { title: "חנות בגדים", text: "ניתן להשתמש במטבעות לקנות פריטי לבוש לדמות האישית שלכם." },
      { title: "סלון דמויות", text: "מתאימים את הדמות האישית שלכם — עיצוב, בגדים ואביזרים." },
    ]
  },
];

// Positions for image alignment inside the box
const POSITIONS = [
  { label: "מרכז", value: "center" },
  { label: "למעלה", value: "top" },
  { label: "למטה", value: "bottom" },
  { label: "שמאל", value: "left" },
  { label: "ימין", value: "right" },
  { label: "שמאל-למעלה", value: "top left" },
  { label: "ימין-למעלה", value: "top right" },
  { label: "שמאל-למטה", value: "bottom left" },
  { label: "ימין-למטה", value: "bottom right" },
];

const ImageLightbox = ({ src, onClose }) => (
  <div
    className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
    onClick={onClose}
  >
    <button
      onClick={onClose}
      className="absolute top-4 left-4 text-white bg-black/50 rounded-full p-2 hover:bg-black/80 transition-colors"
    >
      <X className="w-6 h-6" />
    </button>
    <img
      src={src}
      alt="תמונה מלאה"
      className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
      onClick={e => e.stopPropagation()}
    />
  </div>
);

const MediaManager = ({ videoUrl, imageUrl, imagePosition, onSaveVideo, onSaveImage, onSaveImagePosition, isAdmin }) => {
  const [editingVideo, setEditingVideo] = useState(false);
  const [editingImage, setEditingImage] = useState(false);
  const [editingPosition, setEditingPosition] = useState(false);
  const [videoInput, setVideoInput] = useState(videoUrl || "");
  const [imageInput, setImageInput] = useState(imageUrl || "");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const getEmbedUrl = (rawUrl) => {
    if (!rawUrl) return null;
    const ytMatch = rawUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
    const vimeoMatch = rawUrl.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    return rawUrl;
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setImageInput(file_url);
    onSaveImage(file_url);
    setUploadingImage(false);
    setEditingImage(false);
  };

  const embedUrl = getEmbedUrl(videoUrl);
  const position = imagePosition || "center";

  return (
    <>
      {lightboxOpen && <ImageLightbox src={imageUrl} onClose={() => setLightboxOpen(false)} />}
      <div className="space-y-3 mt-2">
        {/* תמונה */}
        {imageUrl ? (
          <div className="rounded-xl overflow-hidden border">
            <div
              className="relative cursor-zoom-in group"
              onClick={() => setLightboxOpen(true)}
            >
              <img
                src={imageUrl}
                alt="תמונת הדרכה"
                className="w-full object-cover max-h-64 transition-transform duration-200 group-hover:scale-[1.01]"
                style={{ objectPosition: position }}
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
              </div>
            </div>
            {isAdmin && (
              <div className="p-2 bg-muted/30 flex flex-wrap gap-2 items-center">
                <button onClick={() => setEditingImage(true)} className="text-xs text-muted-foreground underline">החלף תמונה</button>
                <button onClick={() => setEditingPosition(p => !p)} className="flex items-center gap-1 text-xs text-[#44512C] underline">
                  <Move className="w-3 h-3" /> מיקום תמונה
                </button>
                <button onClick={() => { onSaveImage(""); setImageInput(""); }} className="text-xs text-red-500 underline">הסר</button>
              </div>
            )}
            {isAdmin && editingPosition && (
              <div className="p-3 bg-muted/20 border-t flex flex-wrap gap-1">
                {POSITIONS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => { onSaveImagePosition(p.value); setEditingPosition(false); }}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${position === p.value ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80 text-muted-foreground"}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
            {isAdmin && editingImage && (
              <div className="p-3 bg-muted/20 border-t space-y-2">
                <label className="flex items-center gap-2 cursor-pointer bg-primary/10 hover:bg-primary/20 text-primary rounded-lg px-3 py-2 text-sm font-medium transition-colors w-fit">
                  <Upload className="w-4 h-4" />
                  {uploadingImage ? "מעלה..." : "העלה תמונה מהמכשיר"}
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
                </label>
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-muted-foreground">או קישור:</span>
                  <input value={imageInput} onChange={e => setImageInput(e.target.value)} placeholder="https://..." className="border rounded px-2 py-1 text-sm flex-1" />
                  <button onClick={() => { onSaveImage(imageInput); setEditingImage(false); }} className="bg-primary text-primary-foreground px-3 py-1 rounded text-sm">שמור</button>
                </div>
                <button onClick={() => setEditingImage(false)} className="text-xs text-muted-foreground underline">ביטול</button>
              </div>
            )}
          </div>
        ) : isAdmin && (
        <div>
          {editingImage ? (
            <div className="border rounded-xl p-3 space-y-2 bg-muted/20">
              <p className="text-xs font-semibold text-muted-foreground">הוסף תמונה:</p>
              <label className="flex items-center gap-2 cursor-pointer bg-primary/10 hover:bg-primary/20 text-primary rounded-lg px-3 py-2 text-sm font-medium transition-colors w-fit">
                <Upload className="w-4 h-4" />
                {uploadingImage ? "מעלה..." : "העלה תמונה מהמכשיר"}
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
              </label>
              <div className="flex gap-2 items-center">
                <span className="text-xs text-muted-foreground">או הדבק קישור:</span>
                <input
                  value={imageInput}
                  onChange={e => setImageInput(e.target.value)}
                  placeholder="https://..."
                  className="border rounded px-2 py-1 text-sm flex-1"
                />
                <button onClick={() => { onSaveImage(imageInput); setEditingImage(false); }} className="bg-primary text-primary-foreground px-3 py-1 rounded text-sm">שמור</button>
              </div>
              <button onClick={() => setEditingImage(false)} className="text-xs text-muted-foreground underline">ביטול</button>
            </div>
          ) : (
            <button
              onClick={() => setEditingImage(true)}
              className="flex items-center gap-2 text-sm text-muted-foreground border-2 border-dashed border-muted rounded-xl px-4 py-3 w-full hover:border-primary hover:text-primary transition-colors"
            >
              <Image className="w-4 h-4" />
              + הוסף תמונת הדרכה לנושא זה
            </button>
          )}
        </div>
      )}

      {/* סרטון */}
      {embedUrl ? (
        <div>
          <div className="rounded-xl overflow-hidden aspect-video bg-black">
            <iframe src={embedUrl} className="w-full h-full" allowFullScreen title="סרטון הדרכה" />
          </div>
          {isAdmin && (
            <div className="flex gap-3 mt-1">
              <button onClick={() => setEditingVideo(true)} className="text-xs text-muted-foreground underline">
                החלף סרטון
              </button>
              <button onClick={() => { onSaveVideo(""); setVideoInput(""); }} className="text-xs text-red-500 underline">
                הסר
              </button>
            </div>
          )}
          {editingVideo && (
            <div className="flex gap-2 mt-2">
              <input
                value={videoInput}
                onChange={e => setVideoInput(e.target.value)}
                placeholder="הדבק קישור YouTube / Vimeo"
                className="border rounded px-2 py-1 text-sm flex-1"
              />
              <button onClick={() => { onSaveVideo(videoInput); setEditingVideo(false); }} className="bg-primary text-primary-foreground px-3 py-1 rounded text-sm">שמור</button>
              <button onClick={() => setEditingVideo(false)} className="text-sm text-muted-foreground">ביטול</button>
            </div>
          )}
        </div>
      ) : isAdmin && (
        <div>
          {editingVideo ? (
            <div className="flex gap-2">
              <input
                value={videoInput}
                onChange={e => setVideoInput(e.target.value)}
                placeholder="הדבק קישור YouTube / Vimeo"
                className="border rounded px-2 py-1 text-sm flex-1"
              />
              <button onClick={() => { onSaveVideo(videoInput); setEditingVideo(false); }} className="bg-primary text-primary-foreground px-3 py-1 rounded text-sm">שמור</button>
              <button onClick={() => setEditingVideo(false)} className="text-sm text-muted-foreground">ביטול</button>
            </div>
          ) : (
            <button
              onClick={() => setEditingVideo(true)}
              className="flex items-center gap-2 text-sm text-muted-foreground border-2 border-dashed border-muted rounded-xl px-4 py-3 w-full hover:border-primary hover:text-primary transition-colors"
            >
              <Play className="w-4 h-4" />
              + הוסף סרטון הדרכה לנושא זה
            </button>
          )}
        </div>
      )}
    </div>
    </>
  );
};

const Section = ({ section, isAdmin, mediaData, onSaveVideo, onSaveImage, onSaveImagePosition }) => {
  const [open, setOpen] = useState(false);
  const Icon = section.icon;

  return (
    <Card className="overflow-hidden">
      <button className="w-full text-right" onClick={() => setOpen(prev => !prev)}>
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
          <MediaManager
            videoUrl={mediaData[section.id]?.video || ""}
            imageUrl={mediaData[section.id]?.image || ""}
            imagePosition={mediaData[section.id]?.imagePosition || "center"}
            onSaveVideo={(url) => onSaveVideo(section.id, url)}
            onSaveImage={(url) => onSaveImage(section.id, url)}
            onSaveImagePosition={(pos) => onSaveImagePosition(section.id, pos)}
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
  const [mediaData, setMediaData] = useState({}); // sectionId -> { video, image, imagePosition, videoId, imageId }
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const user = await base44.auth.me();
        setIsAdmin(user?.role === 'admin');
      } catch {}

      try {
        const records = await base44.entities.TrainingVideo.filter({ category: "user_guide" });
        const data = {};
        records.forEach(r => {
          if (!data[r.title]) data[r.title] = {};
          if (r.thumbnail_url) {
            data[r.title].image = r.thumbnail_url;
            data[r.title].imageId = r.id;
            // store position in description field
            data[r.title].imagePosition = r.description || "center";
          } else {
            data[r.title].video = r.video_url;
            data[r.title].videoId = r.id;
          }
        });
        setMediaData(data);
      } catch {}
    };
    load();
  }, []);

  const filters = ["הכל", "מנהל", "עובד"];
  const filtered = sections.filter(s => filter === "הכל" || s.audience.includes(filter));

  const handleSaveVideo = async (sectionId, url) => {
    setMediaData(prev => ({ ...prev, [sectionId]: { ...prev[sectionId], video: url } }));
    const existing = mediaData[sectionId]?.videoId;
    if (existing) {
      await base44.entities.TrainingVideo.update(existing, { video_url: url });
    } else {
      const created = await base44.entities.TrainingVideo.create({
        title: sectionId, category: "user_guide", video_url: url, is_active: true
      });
      setMediaData(prev => ({ ...prev, [sectionId]: { ...prev[sectionId], videoId: created.id } }));
    }
  };

  const handleSaveImage = async (sectionId, url) => {
    setMediaData(prev => ({ ...prev, [sectionId]: { ...prev[sectionId], image: url } }));
    const existing = mediaData[sectionId]?.imageId;
    if (existing) {
      await base44.entities.TrainingVideo.update(existing, { thumbnail_url: url });
    } else {
      const created = await base44.entities.TrainingVideo.create({
        title: sectionId, category: "user_guide", video_url: "_image_only_", thumbnail_url: url, is_active: true
      });
      setMediaData(prev => ({ ...prev, [sectionId]: { ...prev[sectionId], imageId: created.id } }));
    }
  };

  const handleSaveImagePosition = async (sectionId, position) => {
    setMediaData(prev => ({ ...prev, [sectionId]: { ...prev[sectionId], imagePosition: position } }));
    const existing = mediaData[sectionId]?.imageId;
    if (existing) {
      await base44.entities.TrainingVideo.update(existing, { description: position });
    }
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-gradient-to-br from-primary to-accent rounded-2xl flex items-center justify-center mx-auto shadow-lg">
            <BookOpen className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-black text-foreground">מדריך שימוש</h1>
          <p className="text-muted-foreground">TOP APOLLO — כל מה שצריך לדעת</p>
        </div>

        <div className="flex gap-2 justify-center">
          {filters.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

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
            <p className="text-2xl font-black text-primary">{Object.values(mediaData).filter(d => d.video || d.image).length}</p>
            <p className="text-xs text-muted-foreground">מדיה</p>
          </div>
        </div>

        <div className="space-y-3">
          {filtered.map(section => (
            <Section
              key={section.id}
              section={section}
              isAdmin={isAdmin}
              mediaData={mediaData}
              onSaveVideo={handleSaveVideo}
              onSaveImage={handleSaveImage}
              onSaveImagePosition={handleSaveImagePosition}
            />
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground pb-4">
          TOP APOLLO v1.0 — לשאלות פנה למנהל המערכת
        </p>
      </div>
    </div>
  );
}