import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, X, Heart, Share2, Send, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { format, isAfter } from "date-fns";

export default function StoriesBar({ currentEmployee }) {
  const [stories, setStories] = useState([]);
  const [viewingStory, setViewingStory] = useState(null); // { storyIndex, stories[] }
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState("");
  const [previewUrl, setPreviewUrl] = useState(null);
  const [mediaType, setMediaType] = useState("image");
  const [selectedFile, setSelectedFile] = useState(null);
  const [comment, setComment] = useState("");
  const [progress, setProgress] = useState(0);
  const [showViewers, setShowViewers] = useState(false);
  const [paused, setPaused] = useState(false);
  const fileInputRef = useRef();
  const progressRef = useRef();
  const timerRef = useRef();

  useEffect(() => {
    loadStories();
  }, []);

  // Auto-advance story every 5 seconds
  useEffect(() => {
    if (viewingStory === null) {
      clearInterval(timerRef.current);
      setProgress(0);
      return;
    }
    setProgress(0);
    let p = 0;
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      p += 1;
      setProgress(p);
      if (p >= 100) {
        clearInterval(timerRef.current);
        goNext();
      }
    }, 100);
    return () => clearInterval(timerRef.current);
  }, [viewingStory]);

  const loadStories = async () => {
    const all = await base44.entities.EmployeeStory.list("-created_date", 50);
    const now = new Date();
    const active = all.filter(s => !s.expires_at || isAfter(new Date(s.expires_at), now));
    setStories(active);
  };

  // Group by employee
  const grouped = stories.reduce((acc, s) => {
    if (!acc[s.employee_id]) acc[s.employee_id] = { employee_name: s.employee_name, avatar_url: s.avatar_url, stories: [] };
    acc[s.employee_id].stories.push(s);
    return acc;
  }, {});

  const groups = Object.entries(grouped);

  const recordView = async (story) => {
    if (!currentEmployee || !story) return;
    const views = story.views || [];
    const alreadyViewed = views.some(v => v.employee_id === currentEmployee.id);
    if (!alreadyViewed) {
      const newViews = [...views, { employee_id: currentEmployee.id, employee_name: currentEmployee.full_name }];
      await base44.entities.EmployeeStory.update(story.id, { views: newViews });
    }
  };

  const openStory = (groupIndex) => {
    const [, group] = groups[groupIndex];
    setViewingStory({ groupIndex, storyIndex: 0, stories: group.stories });
    recordView(group.stories[0]);
  };

  const goNext = () => {
    setViewingStory(prev => {
      if (!prev) return null;
      if (prev.storyIndex < prev.stories.length - 1) {
        const next = { ...prev, storyIndex: prev.storyIndex + 1 };
        recordView(prev.stories[next.storyIndex]);
        return next;
      }
      const nextGroup = prev.groupIndex + 1;
      if (nextGroup < groups.length) {
        const [, group] = groups[nextGroup];
        recordView(group.stories[0]);
        return { groupIndex: nextGroup, storyIndex: 0, stories: group.stories };
      }
      return null;
    });
  };

  const goPrev = () => {
    setViewingStory(prev => {
      if (!prev) return null;
      if (prev.storyIndex > 0) return { ...prev, storyIndex: prev.storyIndex - 1 };
      if (prev.groupIndex > 0) {
        const [, group] = groups[prev.groupIndex - 1];
        return { groupIndex: prev.groupIndex - 1, storyIndex: group.stories.length - 1, stories: group.stories };
      }
      return null;
    });
  };

  const currentStory = viewingStory ? viewingStory.stories[viewingStory.storyIndex] : null;

  const handleLike = async () => {
    if (!currentEmployee || !currentStory) return;
    const likes = currentStory.likes || [];
    const alreadyLiked = likes.includes(currentEmployee.id);
    const newLikes = alreadyLiked ? likes.filter(id => id !== currentEmployee.id) : [...likes, currentEmployee.id];
    await base44.entities.EmployeeStory.update(currentStory.id, { likes: newLikes });
    setViewingStory(prev => {
      const updated = { ...currentStory, likes: newLikes };
      const newStories = prev.stories.map((s, i) => i === prev.storyIndex ? updated : s);
      return { ...prev, stories: newStories };
    });
    loadStories();
  };

  const handleComment = async () => {
    if (!comment.trim() || !currentEmployee || !currentStory) return;
    const newComment = {
      employee_id: currentEmployee.id,
      employee_name: currentEmployee.full_name,
      text: comment.trim(),
      created_at: new Date().toISOString()
    };
    const comments = [...(currentStory.comments || []), newComment];
    await base44.entities.EmployeeStory.update(currentStory.id, { comments });
    setComment("");
    setViewingStory(prev => {
      const updated = { ...currentStory, comments };
      const newStories = prev.stories.map((s, i) => i === prev.storyIndex ? updated : s);
      return { ...prev, stories: newStories };
    });
  };

  const handleShare = () => {
    if (!currentStory?.media_url) return;
    if (navigator.share) {
      navigator.share({ url: currentStory.media_url, title: currentStory.caption || "סטורי מהעבודה" });
    } else {
      window.open(`https://www.instagram.com/`, "_blank");
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    const isVideo = file.type.startsWith("video/");
    setMediaType(isVideo ? "video" : "image");
    setPreviewUrl(URL.createObjectURL(file));
    setShowUpload(true);
  };

  const handleUpload = async () => {
    if (!selectedFile || !currentEmployee) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file: selectedFile });
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await base44.entities.EmployeeStory.create({
      employee_id: currentEmployee.id,
      employee_name: currentEmployee.full_name,
      avatar_url: currentEmployee.avatar_url || "",
      media_url: file_url,
      media_type: mediaType,
      caption,
      likes: [],
      comments: [],
      expires_at: expires
    });
    setUploading(false);
    setShowUpload(false);
    setPreviewUrl(null);
    setCaption("");
    setSelectedFile(null);
    loadStories();
  };

  useEffect(() => {
    window.__setStoriesOpen?.(viewingStory !== null);
    setShowViewers(false);
  }, [viewingStory]);

  const isLiked = currentStory && currentEmployee && (currentStory.likes || []).includes(currentEmployee.id);

  // Swipe support for story viewer
  const touchStartX = useRef(null);
  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) diff > 0 ? goNext() : goPrev();
    touchStartX.current = null;
  };

  // Stories bar scroll
  const barRef = useRef();
  const scrollBar = (dir) => { barRef.current?.scrollBy({ left: dir * 200, behavior: "smooth" }); };

  return (
    <>
      {/* Stories Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6 relative">
        {/* Scroll arrows */}
        <button onClick={() => scrollBar(-1)} className="absolute right-1 top-1/2 -translate-y-1/2 z-10 bg-white/90 shadow rounded-full w-7 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-100">
          <ChevronRight className="w-4 h-4" />
        </button>
        <button onClick={() => scrollBar(1)} className="absolute left-1 top-1/2 -translate-y-1/2 z-10 bg-white/90 shadow rounded-full w-7 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-100">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div ref={barRef} className="flex gap-4 overflow-x-auto pb-1 scrollbar-hide px-4">
          {/* Add Story */}
          {currentEmployee && (
            <div className="flex flex-col items-center gap-1 flex-shrink-0 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              <div className="relative w-16 h-16">
                <div className="w-16 h-16 rounded-full bg-gray-100 border-2 border-gray-200 flex items-center justify-center overflow-hidden">
                  {currentEmployee.avatar_url
                    ? <img src={currentEmployee.avatar_url} className="w-full h-full object-cover" alt="" />
                    : <span className="text-2xl font-bold text-gray-500">{currentEmployee.full_name?.charAt(0)}</span>}
                </div>
                <div className="absolute bottom-0 right-0 w-5 h-5 bg-primary rounded-full flex items-center justify-center border-2 border-white">
                  <Plus className="w-3 h-3 text-white" />
                </div>
              </div>
              <span className="text-xs text-gray-600 truncate w-16 text-center">הסטורי שלי</span>
            </div>
          )}

          {/* Stories */}
          {groups.map(([empId, group], idx) => {
            const hasUnviewed = true;
            return (
              <div key={empId} className="flex flex-col items-center gap-1 flex-shrink-0 cursor-pointer" onClick={() => openStory(idx)}>
                <div className={`w-16 h-16 rounded-full p-0.5 ${hasUnviewed ? "bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600" : "bg-gray-300"}`}>
                  <div className="w-full h-full rounded-full border-2 border-white overflow-hidden bg-gray-100 flex items-center justify-center">
                    {group.avatar_url
                      ? <img src={group.avatar_url} className="w-full h-full object-cover" alt="" />
                      : <span className="text-xl font-bold text-gray-500">{group.employee_name?.charAt(0)}</span>}
                  </div>
                </div>
                <span className="text-xs text-gray-600 truncate w-16 text-center">{group.employee_name?.split(" ")[0]}</span>
              </div>
            );
          })}

          {groups.length === 0 && !currentEmployee && (
            <p className="text-sm text-gray-400 self-center">אין סטוריז כרגע</p>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileSelect} />
      </div>

      {/* Story Viewer */}
      {viewingStory && currentStory && (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center" onClick={() => setViewingStory(null)}>
          <div
          className="relative w-full max-w-sm h-full max-h-screen flex flex-col"
          onClick={e => e.stopPropagation()}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
            {/* Progress bars */}
            <div className="absolute top-0 left-0 right-0 z-10 flex gap-1 p-2">
              {viewingStory.stories.map((_, i) => (
                <div key={i} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full transition-none"
                    style={{ width: i < viewingStory.storyIndex ? "100%" : i === viewingStory.storyIndex ? `${progress}%` : "0%" }}
                  />
                </div>
              ))}
            </div>

            {/* Header */}
            <div className="absolute top-4 left-0 right-0 z-10 flex items-center gap-3 px-4 pt-4">
              <div className="w-9 h-9 rounded-full bg-gray-400 overflow-hidden border-2 border-white flex-shrink-0">
                {currentStory.avatar_url
                  ? <img src={currentStory.avatar_url} className="w-full h-full object-cover" alt="" />
                  : <span className="text-sm font-bold text-white flex items-center justify-center h-full">{currentStory.employee_name?.charAt(0)}</span>}
              </div>
              <div className="flex-1">
                <p className="text-white font-semibold text-sm">{currentStory.employee_name}</p>
                <p className="text-white/60 text-xs">{format(new Date(currentStory.created_date), "HH:mm")}</p>
              </div>
              <button onClick={() => setViewingStory(null)} className="text-white p-1">
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Media */}
            <div className="flex-1 relative">
              {currentStory.media_type === "video"
                ? <video src={currentStory.media_url} autoPlay muted loop className="w-full h-full object-cover" style={{maxHeight:"100vh"}} />
                : <img src={currentStory.media_url} className="w-full h-full object-cover" style={{maxHeight:"100vh"}} alt="" />}

              {/* Tap zones */}
              <div className="absolute inset-0 flex">
                <div className="flex-1" onClick={goPrev} />
                <div className="flex-1" onClick={goNext} />
              </div>

              {/* Caption */}
              {currentStory.caption && (
                <div className="absolute bottom-20 left-0 right-0 px-4">
                  <p className="text-white text-sm bg-black/40 rounded-lg px-3 py-2">{currentStory.caption}</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="bg-black/80 px-4 py-3 space-y-3" dir="rtl">
              <div className="flex items-center gap-3">
                <button onClick={handleLike} className={`flex items-center gap-1 ${isLiked ? "text-red-500" : "text-white"}`}>
                  <Heart className={`w-6 h-6 ${isLiked ? "fill-red-500" : ""}`} />
                  <span className="text-sm">{(currentStory.likes || []).length}</span>
                </button>
                <div className="flex-1 flex gap-2">
                  <input
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleComment()}
                    placeholder="הוסף תגובה..."
                    className="flex-1 bg-white/10 text-white placeholder-white/40 rounded-full px-3 py-1.5 text-sm outline-none"
                  />
                  <button onClick={handleComment} className="text-white">
                    <Send className="w-5 h-5" />
                  </button>
                </div>
                <button onClick={handleShare} className="text-white">
                  <Share2 className="w-5 h-5" />
                </button>
              </div>
              {(currentStory.comments || []).length > 0 && (
                <div className="space-y-1 max-h-20 overflow-y-auto">
                  {currentStory.comments.slice(-3).map((c, i) => (
                    <p key={i} className="text-xs text-white/80">
                      <span className="font-bold">{c.employee_name}: </span>{c.text}
                    </p>
                  ))}
                </div>
              )}

              {/* Viewers & Likes - only for story owner */}
              {currentEmployee && currentStory.employee_id === currentEmployee.id && (
                <div>
                  <button
                    onClick={() => setShowViewers(v => !v)}
                    className="flex items-center gap-2 text-white/70 text-xs hover:text-white"
                  >
                    <Eye className="w-4 h-4" />
                    <span>{(currentStory.views || []).length} צפיות</span>
                    <span>•</span>
                    <Heart className="w-4 h-4 fill-red-400 text-red-400" />
                    <span>{(currentStory.likes || []).length} לייקים</span>
                  </button>

                  {showViewers && (
                    <div className="mt-2 bg-white/10 rounded-xl p-3 space-y-2 max-h-40 overflow-y-auto">
                      {(currentStory.views || []).length === 0 ? (
                        <p className="text-white/50 text-xs text-center">אין צפיות עדיין</p>
                      ) : (
                        (currentStory.views || []).map((v, i) => {
                          const liked = (currentStory.likes || []).includes(v.employee_id);
                          return (
                            <div key={i} className="flex items-center justify-between">
                              <span className="text-white text-xs font-medium">{v.employee_name}</span>
                              {liked && <Heart className="w-3.5 h-3.5 fill-red-400 text-red-400" />}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Upload Dialog */}
      {showUpload && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center" onClick={() => setShowUpload(false)}>
          <div className="bg-white w-full max-w-sm rounded-t-3xl p-6 space-y-4" onClick={e => e.stopPropagation()} dir="rtl">
            <h3 className="text-lg font-bold text-center">העלה סטורי חדש</h3>
            {previewUrl && (
              mediaType === "video"
                ? <video src={previewUrl} className="w-full h-48 object-cover rounded-xl" controls />
                : <img src={previewUrl} className="w-full h-48 object-cover rounded-xl" alt="" />
            )}
            <input
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="הוסף כיתוב (אופציונלי)..."
              className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
            />
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="w-full bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-xl py-3 font-bold text-base disabled:opacity-60"
            >
              {uploading ? "⏳ מעלה..." : "📤 פרסם סטורי"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}