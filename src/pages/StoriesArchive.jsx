import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Heart, Eye, MessageCircle, Trash2, Search } from "lucide-react";
import { format } from "date-fns";

export default function StoriesArchive() {
  const [user, setUser] = useState(null);
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStory, setSelectedStory] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
        
        // Only admins can access this page
        if (currentUser?.role !== "admin") {
          setLoading(false);
          return;
        }
        
        // Load all stories (including expired)
        const allStories = await base44.entities.EmployeeStory.list("-created_date", 1000);
        setStories(allStories);
      } catch (error) {
        console.error("Failed to load user:", error);
      } finally {
        setLoading(false);
      }
    };
    
    loadUser();
  }, []);

  const isAdmin = user?.role === "admin";

  const filteredStories = stories.filter(s =>
    s.employee_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.caption?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDeleteStory = async (storyId) => {
    if (!window.confirm("למחוק סטורי זה לצמיתות?")) return;
    setDeleting(true);
    try {
      await base44.entities.EmployeeStory.delete(storyId);
      setStories(stories.filter(s => s.id !== storyId));
      setSelectedStory(null);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">טוען...</div>;
  }

  if (!isAdmin) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6 text-center">
            <h2 className="text-lg font-bold text-red-700 mb-2">🔐 גישה מוגבלת</h2>
            <p className="text-red-600">דף זה זמין למנהלים בלבד</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4" dir="rtl">
      <div>
        <h1 className="text-3xl font-bold mb-2">📚 ארכיון סטוריז</h1>
        <p className="text-muted-foreground">כל הסטוריז שנפרסמו, כולל אלה שפגו</p>
      </div>

      {/* סיכום */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-3 text-center"><div className="text-2xl font-bold">{stories.length}</div><div className="text-xs text-muted-foreground">סה״כ סטוריז</div></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><div className="text-2xl font-bold">{stories.reduce((s, st) => s + (st.views?.length || 0), 0)}</div><div className="text-xs text-muted-foreground">צפיות</div></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><div className="text-2xl font-bold">{stories.reduce((s, st) => s + (st.likes?.length || 0), 0)}</div><div className="text-xs text-muted-foreground">לייקים</div></CardContent></Card>
      </div>

      {/* חיפוש */}
      <div className="flex gap-2">
        <Search className="w-5 h-5 text-muted-foreground mt-2 ml-2" />
        <Input
          placeholder="חפש לפי שם עובד או כיתוב..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1"
        />
      </div>

      {/* רשימת סטוריז */}
      {filteredStories.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">אין סטוריז</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStories.map((story) => {
            const isExpired = story.expires_at && new Date(story.expires_at) < new Date();
            
            return (
              <Card
                key={story.id}
                className={`cursor-pointer hover:shadow-lg transition-shadow ${isExpired ? "opacity-60" : ""}`}
                onClick={() => setSelectedStory(story)}
              >
                <CardContent className="p-3">
                  {/* Thumbnail */}
                  <div className="relative mb-3 rounded-lg overflow-hidden bg-gray-100 aspect-square">
                    {story.media_type === "video"
                      ? <video src={story.media_url} className="w-full h-full object-cover" />
                      : <img src={story.media_url} className="w-full h-full object-cover" alt="" />}
                    {isExpired && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <span className="text-white text-xs font-bold">⏰ פגה</span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                        {story.avatar_url
                          ? <img src={story.avatar_url} className="w-full h-full object-cover" alt="" />
                          : <span className="text-xs font-bold flex items-center justify-center h-full">{story.employee_name?.charAt(0)}</span>}
                      </div>
                      <span className="font-medium truncate">{story.employee_name}</span>
                    </div>

                    {story.caption && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{story.caption}</p>
                    )}

                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3" /> {story.views?.length || 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <Heart className="w-3 h-3" /> {story.likes?.length || 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="w-3 h-3" /> {story.comments?.length || 0}
                      </span>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      {format(new Date(story.created_date), "dd/MM/yyyy HH:mm")}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Story Detail Dialog */}
      {selectedStory && (
        <Dialog open={!!selectedStory} onOpenChange={(open) => { if (!open) setSelectedStory(null); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden">
                  {selectedStory.avatar_url
                    ? <img src={selectedStory.avatar_url} className="w-full h-full object-cover" alt="" />
                    : <span className="text-xs font-bold flex items-center justify-center h-full">{selectedStory.employee_name?.charAt(0)}</span>}
                </div>
                {selectedStory.employee_name}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Media */}
              <div className="rounded-lg overflow-hidden bg-gray-100 max-h-96">
                {selectedStory.media_type === "video"
                  ? <video src={selectedStory.media_url} autoPlay muted loop controls className="w-full h-full max-h-96 object-cover" />
                  : <img src={selectedStory.media_url} className="w-full h-full max-h-96 object-cover" alt="" />}
              </div>

              {/* Caption */}
              {selectedStory.caption && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm">{selectedStory.caption}</p>
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <Card><CardContent className="p-3 text-center"><Eye className="w-5 h-5 mx-auto text-muted-foreground mb-1" /><div className="font-bold text-lg">{selectedStory.views?.length || 0}</div><div className="text-xs text-muted-foreground">צפיות</div></CardContent></Card>
                <Card><CardContent className="p-3 text-center"><Heart className="w-5 h-5 mx-auto text-red-500 mb-1" /><div className="font-bold text-lg">{selectedStory.likes?.length || 0}</div><div className="text-xs text-muted-foreground">לייקים</div></CardContent></Card>
                <Card><CardContent className="p-3 text-center"><MessageCircle className="w-5 h-5 mx-auto text-blue-500 mb-1" /><div className="font-bold text-lg">{selectedStory.comments?.length || 0}</div><div className="text-xs text-muted-foreground">תגובות</div></CardContent></Card>
              </div>

              {/* Comments */}
              {(selectedStory.comments || []).length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">תגובות</h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {selectedStory.comments.map((c, i) => (
                      <div key={i} className="bg-gray-50 rounded p-2 text-sm">
                        <div className="font-medium text-xs">{c.employee_name}</div>
                        <div className="text-muted-foreground">{c.text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Questions */}
              {(selectedStory.questions || []).length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">שאלות</h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {selectedStory.questions.map((q, i) => (
                      <div key={i} className="bg-blue-50 rounded p-2 text-sm">
                        <div className="font-medium text-xs">{q.employee_name}</div>
                        <div className="text-muted-foreground">{q.text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="text-xs text-muted-foreground space-y-1 bg-gray-50 rounded p-3">
                <div>📅 {format(new Date(selectedStory.created_date), "dd/MM/yyyy HH:mm:ss")}</div>
                {selectedStory.expires_at && (
                  <div>⏰ {new Date(selectedStory.expires_at) < new Date() ? "פגה ב" : "פגה ב"}: {format(new Date(selectedStory.expires_at), "dd/MM/yyyy HH:mm")}</div>
                )}
              </div>

              {/* Delete Button */}
              <Button
                onClick={() => handleDeleteStory(selectedStory.id)}
                disabled={deleting}
                className="w-full bg-red-600 hover:bg-red-700"
              >
                <Trash2 className="w-4 h-4 ml-2" />
                {deleting ? "מוחק..." : "מחק סטורי"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}