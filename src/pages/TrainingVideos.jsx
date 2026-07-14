import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus, Pencil, Trash2, Play, Video, FolderOpen, X, Search
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/shared/PageHeader";

export default function TrainingVideos() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingVideo, setEditingVideo] = useState(null);
  const [playingVideo, setPlayingVideo] = useState(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const [form, setForm] = useState({
    title: "",
    category: "",
    description: "",
    video_url: "",
    thumbnail_url: "",
    duration_minutes: "",
    is_active: true,
    order: 0,
  });

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    loadVideos();
  }, []);

  const loadVideos = async () => {
    setLoading(true);
    const data = await base44.entities.TrainingVideo.list("-created_date", 200);
    setVideos(data);
    setLoading(false);
  };

  const categories = ["all", ...Array.from(new Set(videos.map(v => v.category).filter(Boolean)))];

  const filtered = videos.filter(v => {
    const matchSearch = v.title?.includes(search) || v.description?.includes(search) || v.category?.includes(search);
    const matchCategory = selectedCategory === "all" || v.category === selectedCategory;
    return matchSearch && matchCategory;
  });

  const grouped = filtered.reduce((acc, v) => {
    const cat = v.category || "כללי";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(v);
    return acc;
  }, {});

  const openAdd = () => {
    setEditingVideo(null);
    setForm({ title: "", category: "", description: "", video_url: "", thumbnail_url: "", duration_minutes: "", is_active: true, order: 0 });
    setShowForm(true);
  };

  const openEdit = (video) => {
    setEditingVideo(video);
    setForm({
      title: video.title || "",
      category: video.category || "",
      description: video.description || "",
      video_url: video.video_url || "",
      thumbnail_url: video.thumbnail_url || "",
      duration_minutes: video.duration_minutes || "",
      is_active: video.is_active !== false,
      order: video.order || 0,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.category || !form.video_url) {
      toast({ title: "שדות חובה חסרים", description: "נא למלא כותרת, קטגוריה וכתובת וידאו", variant: "destructive" });
      return;
    }
    const data = {
      ...form,
      duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
      order: Number(form.order) || 0,
    };
    if (editingVideo) {
      await base44.entities.TrainingVideo.update(editingVideo.id, data);
      toast({ title: "עודכן בהצלחה" });
    } else {
      await base44.entities.TrainingVideo.create(data);
      toast({ title: "הסרטון נוסף בהצלחה" });
    }
    setShowForm(false);
    loadVideos();
  };

  const handleDelete = async (id) => {
    if (!confirm("למחוק את הסרטון?")) return;
    await base44.entities.TrainingVideo.delete(id);
    toast({ title: "נמחק" });
    loadVideos();
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(prev => ({ ...prev, video_url: file_url }));
    setUploading(false);
    toast({ title: "הסרטון הועלה בהצלחה" });
  };

  const isAdmin = user?.role === "admin";

  const getEmbedUrl = (url) => {
    if (!url) return null;
    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
    // Vimeo
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    // Direct video file
    return null;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FAF5E8] via-[#F7EFDD] to-[#F1E6CE] p-4 md:p-8" dir="rtl">
      <div className="max-w-6xl mx-auto">
      <PageHeader
        title="סרטוני הדרכה"
        subtitle={`${videos.length} סרטונים בסך הכל`}
        icon={Video}
        action={isAdmin && (
          <Button onClick={openAdd} className="gap-2">
            <Plus className="w-4 h-4" />
            הוסף סרטון
          </Button>
        )}
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש סרטון..."
            className="pr-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {categories.map(cat => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(cat)}
            >
              {cat === "all" ? "הכל" : cat}
            </Button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Video className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p>אין סרטונים להצגה</p>
          {isAdmin && <Button onClick={openAdd} className="mt-4 gap-2"><Plus className="w-4 h-4" />הוסף סרטון ראשון</Button>}
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([category, catVideos]) => (
            <div key={category}>
              <div className="flex items-center gap-2 mb-3">
                <FolderOpen className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">{category}</h2>
                <Badge variant="secondary">{catVideos.length}</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {catVideos.map(video => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    isAdmin={isAdmin}
                    onEdit={() => openEdit(video)}
                    onDelete={() => handleDelete(video.id)}
                    onPlay={() => setPlayingVideo(video)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVideo ? "עריכת סרטון" : "הוספת סרטון"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">כותרת *</label>
              <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="שם הסרטון" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">קטגוריה *</label>
              <Input value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} placeholder="לדוגמה: שירות, מטבח, בטיחות..." className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">תיאור</label>
              <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="תיאור קצר של הסרטון" rows={2} className="mt-1 text-right" />
            </div>
            <div>
              <label className="text-sm font-medium">קישור לסרטון *</label>
              <Input value={form.video_url} onChange={e => setForm(p => ({ ...p, video_url: e.target.value }))} placeholder="https://youtube.com/watch?v=... או כתובת קובץ" className="mt-1" dir="ltr" />
              <p className="text-xs text-muted-foreground mt-1">YouTube, Vimeo, או קישור ישיר לקובץ וידאו</p>
            </div>
            <div>
              <label className="text-sm font-medium">או העלה קובץ וידאו</label>
              <div className="mt-1 flex items-center gap-2">
                <input type="file" accept="video/*" onChange={handleFileUpload} className="hidden" id="video-upload" />
                <label htmlFor="video-upload" className="cursor-pointer">
                  <Button variant="outline" size="sm" asChild disabled={uploading}>
                    <span>{uploading ? "מעלה..." : "בחר קובץ"}</span>
                  </Button>
                </label>
                {form.video_url && <span className="text-xs text-green-600 truncate max-w-40">✓ קובץ נבחר</span>}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">תמונה ממוזערת (URL)</label>
              <Input value={form.thumbnail_url} onChange={e => setForm(p => ({ ...p, thumbnail_url: e.target.value }))} placeholder="https://..." className="mt-1" dir="ltr" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">משך (דקות)</label>
                <Input type="number" value={form.duration_minutes} onChange={e => setForm(p => ({ ...p, duration_minutes: e.target.value }))} placeholder="0" className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">סדר תצוגה</label>
                <Input type="number" value={form.order} onChange={e => setForm(p => ({ ...p, order: e.target.value }))} placeholder="0" className="mt-1" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} />
              <label htmlFor="is_active" className="text-sm">סרטון פעיל</label>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)} className="flex-1">ביטול</Button>
              <Button onClick={handleSave} className="flex-1">שמור</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Play Dialog */}
      <Dialog open={!!playingVideo} onOpenChange={() => setPlayingVideo(null)}>
        <DialogContent dir="rtl" className="max-w-3xl p-4">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{playingVideo?.title}</span>
            </DialogTitle>
          </DialogHeader>
          {playingVideo && (() => {
            const embedUrl = getEmbedUrl(playingVideo.video_url);
            return embedUrl ? (
              <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
                <iframe
                  src={embedUrl}
                  className="absolute inset-0 w-full h-full rounded-lg"
                  allowFullScreen
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                />
              </div>
            ) : (
              <video src={playingVideo.video_url} controls className="w-full rounded-lg max-h-[60vh]" />
            );
          })()}
          {playingVideo?.description && (
            <p className="text-sm text-muted-foreground mt-2">{playingVideo.description}</p>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}

function VideoCard({ video, isAdmin, onEdit, onDelete, onPlay }) {
  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow group">
      <div
        className="relative bg-gray-900 cursor-pointer"
        style={{ paddingBottom: "56.25%" }}
        onClick={onPlay}
      >
        {video.thumbnail_url ? (
          <img src={video.thumbnail_url} alt={video.title} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
            <Video className="w-12 h-12 text-gray-500" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
          <div className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
            <Play className="w-6 h-6 text-gray-900 mr-[-2px]" fill="currentColor" />
          </div>
        </div>
        {video.duration_minutes && (
          <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded">
            {video.duration_minutes} דק'
          </div>
        )}
      </div>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{video.title}</p>
            {video.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{video.description}</p>}
          </div>
          {isAdmin && (
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}