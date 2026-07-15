import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { generateInstagramPost } from '@/functions/generateInstagramPost';
import { publishInstagramPost } from '@/functions/publishInstagramPost';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Instagram, Sparkles, Image, Send, RefreshCw, Calendar, CheckCircle, AlertCircle, Loader2, Upload, ScanSearch, Clock, Grid3x3 } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter } from 'recharts';
import DriveImagePicker from '@/components/instagram/DriveImagePicker';
import PageHeader from '@/components/shared/PageHeader';

const TONES = [
  { value: 'חמים ומזמין', label: '😊 חמים ומזמין' },
  { value: 'אלגנטי ויוקרתי', label: '✨ אלגנטי ויוקרתי' },
  { value: 'שובב ומשעשע', label: '😄 שובב ומשעשע' },
  { value: 'מקצועי ורציני', label: '💼 מקצועי' },
  { value: 'רומנטי', label: '❤️ רומנטי' },
];

const TOPICS = [
  'מנה מיוחדת של היום',
  'אווירת המסעדה',
  'קידום סוף שבוע',
  'מבצע מיוחד',
  'אירוע מיוחד',
  'ביקורת לקוח מרגשת',
  'אחורי הקלעים',
  'צוות המסעדה',
];

export default function InstagramStudio() {
  const [topic, setTopic] = useState('');
  const [customTopic, setCustomTopic] = useState('');
  const [tone, setTone] = useState('חמים ומזמין');
  const [generatedCaption, setGeneratedCaption] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [generatedImageUrl, setGeneratedImageUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [scheduledPosts, setScheduledPosts] = useState([]);
  const [profile, setProfile] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const [imageAnalysis, setImageAnalysis] = useState('');
  const [activeTab, setActiveTab] = useState('generator');
  const [scheduledDateTime, setScheduledDateTime] = useState('');
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);

  useEffect(() => {
    base44.entities.RestaurantProfile.list().then(p => p[0] && setProfile(p[0]));
    loadScheduledPosts();
  }, []);

  const loadScheduledPosts = async () => {
    try {
      const posts = await base44.entities.CampaignLog.list('-created_date', 10);
      setScheduledPosts(posts.filter(p => p.channel === 'instagram'));
    } catch {}
  };

  const handleGenerate = async () => {
    const finalTopic = customTopic || topic;
    if (!finalTopic) { toast.error('בחר נושא לפוסט'); return; }

    setLoading(true);
    setPublished(false);
    try {
      const res = await generateInstagramPost({
        topic: finalTopic,
        tone,
        restaurant_name: profile?.restaurant_name,
        cuisine_style: profile?.cuisine_style,
        unique_points: profile?.unique_selling_points?.join(', ')
      });
      setGeneratedCaption(res.data.caption || '');
      setImagePrompt(res.data.image_prompt || '');
      setGeneratedImageUrl('');
    } catch (e) {
      toast.error('שגיאה ביצירת הפוסט');
    }
    setLoading(false);
  };

  const handleGenerateImage = async () => {
    if (!imagePrompt) return;
    setImageLoading(true);
    try {
      const result = await base44.integrations.Core.GenerateImage({ prompt: imagePrompt });
      setGeneratedImageUrl(result.url);
    } catch (e) {
      toast.error('שגיאה ביצירת התמונה');
    }
    setImageLoading(false);
  };

  const handleUploadImage = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const result = await base44.integrations.Core.UploadFile({ file });
      setGeneratedImageUrl(result.file_url);
      setImageAnalysis('');
      toast.success('התמונה הועלתה! לחץ "נתח וצור פוסט" לקבלת פוסט מותאם לתמונה');
    } catch {
      toast.error('שגיאה בהעלאת התמונה');
    }
    setUploadingImage(false);
  };

  const handleAnalyzeAndGenerate = async () => {
    if (!generatedImageUrl) return;
    const finalTopic = customTopic || topic;
    setAnalyzingImage(true);
    setPublished(false);
    try {
      const res = await generateInstagramPost({
        topic: finalTopic || '',
        tone,
        restaurant_name: profile?.restaurant_name,
        cuisine_style: profile?.cuisine_style,
        unique_points: profile?.unique_selling_points?.join(', '),
        image_url: generatedImageUrl
      });
      setGeneratedCaption(res.data.caption || '');
      setImagePrompt(res.data.image_prompt || '');
      if (res.data.image_analysis) setImageAnalysis(res.data.image_analysis);
      toast.success('✨ הפוסט נוצר בהתאם לתמונה!');
    } catch {
      toast.error('שגיאה בניתוח התמונה');
    }
    setAnalyzingImage(false);
  };

  const handlePublish = async (isScheduled = false) => {
    if (!generatedCaption || !generatedImageUrl) {
      toast.error('נדרש טקסט ותמונה לפרסום');
      return;
    }
    if (isScheduled && !scheduledDateTime) {
      toast.error('בחר תאריך ושעה לתזמון');
      return;
    }

    setPublishing(true);
    try {
      const res = await publishInstagramPost({
        image_url: generatedImageUrl,
        caption: generatedCaption,
        scheduled_date: isScheduled ? scheduledDateTime : null
      });
      
      const status = isScheduled ? 'scheduled' : 'published';
      const logData = {
        type: 'instagram',
        channel: 'instagram',
        content: generatedCaption,
        image_url: generatedImageUrl,
        status,
        post_id: res.data.post_id || '',
        topic: customTopic || topic,
        sent_at: new Date().toISOString()
      };

      if (isScheduled) {
        logData.scheduled_date = new Date(scheduledDateTime).toISOString();
      }

      if (res.data.success || isScheduled) {
        setPublished(true);
        await base44.entities.CampaignLog.create(logData);
        toast.success(isScheduled ? '📅 הפוסט תוזמן בהצלחה!' : '✅ הפוסט פורסם באינסטגרם!');
        loadScheduledPosts();
        setShowScheduleDialog(false);
        setScheduledDateTime('');
      } else {
        toast.error('שגיאה בפרסום: ' + (res.data.error || 'לא ידוע'));
      }
    } catch (e) {
      toast.error('שגיאה בפרסום');
    }
    setPublishing(false);
  };

  const ganttData = scheduledPosts.map((post, idx) => {
    const createdDate = new Date(post.created_date);
    const scheduledDate = post.scheduled_date ? new Date(post.scheduled_date) : createdDate;
    const start = createdDate.getTime();
    const end = scheduledDate.getTime();
    return {
      id: post.id,
      name: (post.topic || 'פוסט ' + (idx + 1)).substring(0, 20),
      start,
      end,
      startDate: createdDate.toLocaleDateString('he-IL'),
      endDate: scheduledDate.toLocaleDateString('he-IL'),
      status: post.status,
      duration: Math.ceil((end - start) / (1000 * 60 * 60 * 24))
    };
  });

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6" dir="rtl">
      {/* Header */}
      <PageHeader
        title="Instagram Studio"
        subtitle="AI יוצר פוסטים מקצועיים לאינסטגרם + תזמון וגלריה"
        icon={Instagram}
      />

      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-muted">
          <TabsTrigger value="generator"><Sparkles className="w-4 h-4 ml-2" /> יוצר</TabsTrigger>
          <TabsTrigger value="gallery"><Grid3x3 className="w-4 h-4 ml-2" /> גלריה</TabsTrigger>
          <TabsTrigger value="schedule"><Calendar className="w-4 h-4 ml-2" /> לוח זמנים</TabsTrigger>
        </TabsList>

        {/* TAB 1: GENERATOR */}
        <TabsContent value="generator" className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left - Generator */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">הגדרות הפוסט</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">נושא הפוסט</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {TOPICS.map(t => (
                    <button
                      key={t}
                      onClick={() => { setTopic(t); setCustomTopic(''); }}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        topic === t && !customTopic ? 'bg-[#F4ECD8] border-pink-400 text-[#7A3722]' : 'border-border hover:bg-muted'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <Input
                  placeholder="או כתוב נושא חופשי..."
                  value={customTopic}
                  onChange={e => { setCustomTopic(e.target.value); setTopic(''); }}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">טון הפוסט</label>
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TONES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
                <span>💡 AI ישתמש אוטומטית בפריטי התפריט מהמערכת</span>
              </div>

              <Button onClick={handleGenerate} disabled={loading} className="w-full bg-gradient-to-r from-[#A04A2E] to-[#A04A2E] text-white">
                {loading ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" /> יוצר פוסט...</> : <><Sparkles className="w-4 h-4 ml-2" /> צור פוסט עם AI</>}
              </Button>
            </CardContent>
          </Card>

          {/* Generated Caption */}
          {generatedCaption && (
            <Card>
              <CardHeader><CardTitle className="text-base">טקסט הפוסט</CardTitle></CardHeader>
              <CardContent>
                <Textarea
                  value={generatedCaption}
                  onChange={e => setGeneratedCaption(e.target.value)}
                  className="min-h-[180px] text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">{generatedCaption.length} תווים</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right - Image + Publish */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">תמונה לפוסט</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {imagePrompt && (
                <Textarea
                  value={imagePrompt}
                  onChange={e => setImagePrompt(e.target.value)}
                  className="text-sm min-h-[80px]"
                  placeholder="תיאור התמונה..."
                />
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                {imagePrompt && (
                  <Button onClick={handleGenerateImage} disabled={imageLoading} variant="outline" className="flex-1">
                    {imageLoading ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" /> יוצר...</> : <><Image className="w-4 h-4 ml-2" /> צור עם AI</>}
                  </Button>
                )}
                <DriveImagePicker onSelect={(url) => { setGeneratedImageUrl(url); setImageAnalysis(''); toast.success('תמונה נבחרה! לחץ "נתח וצור פוסט" לקבלת פוסט מותאם'); }} />
                <label className="cursor-pointer">
                  <input type="file" accept="image/*" className="hidden" onChange={handleUploadImage} disabled={uploadingImage} />
                  <Button asChild variant="outline" size="sm" disabled={uploadingImage}>
                    <span className="gap-1.5">
                      {uploadingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      העלה תמונה
                    </span>
                  </Button>
                </label>
              </div>

              {generatedImageUrl ? (
                <div className="space-y-3">
                  <div className="rounded-xl overflow-hidden border relative group">
                    <img src={generatedImageUrl} alt="Post" className="w-full aspect-square object-cover" />
                    <button
                      onClick={() => { setGeneratedImageUrl(''); setImageAnalysis(''); }}
                      className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      החלף
                    </button>
                  </div>

                  {imageAnalysis && (
                    <div className="text-xs text-muted-foreground bg-[#F4ECD8] border border-[#F4ECD8] rounded-lg p-2">
                      <span className="font-medium text-[#7A3722]">🔍 ניתוח התמונה: </span>{imageAnalysis}
                    </div>
                  )}

                  <Button
                    onClick={handleAnalyzeAndGenerate}
                    disabled={analyzingImage}
                    className="w-full bg-gradient-to-r from-[#A04A2E] to-[#A04A2E] text-white"
                  >
                    {analyzingImage
                      ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" /> מנתח תמונה ויוצר פוסט...</>
                      : <><ScanSearch className="w-4 h-4 ml-2" /> נתח תמונה וצור פוסט מותאם</>
                    }
                  </Button>
                </div>
              ) : (
                <div className="border-2 border-dashed border-border rounded-xl aspect-square flex items-center justify-center text-muted-foreground text-sm">
                  <div className="text-center space-y-2">
                    <Image className="w-8 h-8 mx-auto opacity-30" />
                    <p>בחר תמונה מ-Drive, העלה, או צור עם AI</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Publish Button */}
          {generatedCaption && (
            <Card className={published ? 'border-green-300 bg-green-50' : ''}>
              <CardContent className="pt-4">
                {published ? (
                  <div className="flex items-center gap-2 text-green-700 font-medium">
                    <CheckCircle className="w-5 h-5" />
                    <span>הפוסט פורסם בהצלחה! 🎉</span>
                  </div>
                ) : (
                  <>
                    {!generatedImageUrl && (
                      <div className="flex items-center gap-2 text-amber-600 text-sm mb-3">
                        <AlertCircle className="w-4 h-4" />
                        <span>נדרשת תמונה לפרסום באינסטגרם</span>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handlePublish(false)}
                        disabled={publishing || !generatedImageUrl}
                        className="flex-1 bg-gradient-to-r from-[#A04A2E] via-[#A04A2E] to-orange-400 text-white"
                      >
                        {publishing ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" /> מפרסם...</> : <><Send className="w-4 h-4 ml-2" /> פרסם עכשיו</>}
                      </Button>
                      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
                        <DialogTrigger asChild>
                          <Button variant="outline" className="flex-1">
                            <Clock className="w-4 h-4 ml-2" /> תזמון
                          </Button>
                        </DialogTrigger>
                        <DialogContent dir="rtl">
                          <DialogHeader>
                            <DialogTitle>תזמן פוסט</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-3">
                            <div>
                              <label className="text-sm font-medium mb-2 block">תאריך ושעה</label>
                              <input
                                type="datetime-local"
                                value={scheduledDateTime}
                                onChange={(e) => setScheduledDateTime(e.target.value)}
                                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                              />
                            </div>
                            <Button
                              onClick={() => handlePublish(true)}
                              disabled={publishing || !scheduledDateTime}
                              className="w-full bg-gradient-to-r from-[#A04A2E] to-[#A04A2E] text-white"
                            >
                              {publishing ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" /> תזמון...</> : <><Clock className="w-4 h-4 ml-2" /> תזמן פוסט</>}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

        </TabsContent>

        {/* TAB 2: GALLERY */}
        <TabsContent value="gallery" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">גלריית פוסטים</CardTitle></CardHeader>
            <CardContent>
              {scheduledPosts.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">אין פוסטים עדיין</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {scheduledPosts.map(post => (
                    <Dialog key={post.id}>
                      <DialogTrigger asChild>
                        <div className="cursor-pointer group relative rounded-lg overflow-hidden bg-muted aspect-square">
                          {post.image_url ? (
                            <img src={post.image_url} alt={post.topic} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#F4ECD8] to-[#F4ECD8]">
                              <Image className="w-6 h-6 text-muted-foreground" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end p-2">
                            <div className="text-white text-xs line-clamp-2 w-full">
                              <Badge className="text-xs bg-gradient-to-r from-[#A04A2E] to-[#A04A2E]">{post.status === 'scheduled' ? '📅' : '✅'} {post.topic}</Badge>
                            </div>
                          </div>
                        </div>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>{post.topic}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          {post.image_url && (
                            <img src={post.image_url} alt={post.topic} className="w-full rounded-lg" />
                          )}
                          <div>
                            <p className="text-sm">{post.content}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">{post.status === 'scheduled' ? '📅 תוזמן' : '✅ פורסם'}</Badge>
                            <Badge variant="outline">{new Date(post.created_date).toLocaleDateString('he-IL')}</Badge>
                            {post.scheduled_date && (
                              <Badge className="bg-[#F4ECD8] text-[#44512C]">{new Date(post.scheduled_date).toLocaleDateString('he-IL')}</Badge>
                            )}
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: GANTT SCHEDULE */}
        <TabsContent value="schedule" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">לוח זמנים (Gantt Chart)</CardTitle></CardHeader>
            <CardContent>
              {ganttData.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">אין פוסטים מתוזמנים</p>
              ) : (
                <div className="overflow-x-auto">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={ganttData} layout="vertical" margin={{ top: 5, right: 30, left: 200, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" dataKey="duration" />
                      <YAxis dataKey="name" type="category" width={180} tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(value) => value}
                        labelFormatter={(label) => `יום ${label}`}
                        contentStyle={{ backgroundColor: 'rgba(0,0,0,0.75)', border: 'none', borderRadius: '8px', color: 'white' }}
                      />
                      <Bar dataKey="duration" fill="#A04A2E" name="ימים מהיצירה לפרסום" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              
              {/* Detailed Schedule Table */}
              <div className="mt-6 space-y-2">
                <p className="text-sm font-medium">פרטי לוח הזמנים:</p>
                <div className="space-y-2">
                  {ganttData.map(post => (
                    <div key={post.id} className="flex items-center justify-between p-3 rounded-lg border border-border text-sm">
                      <span className="font-medium truncate flex-1">{post.name}</span>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{post.startDate}</span>
                        <span>→</span>
                        <span>{post.endDate}</span>
                        <Badge className={post.status === 'scheduled' ? 'bg-[#F4ECD8] text-[#44512C]' : 'bg-green-100 text-green-700'}>
                          {post.status === 'scheduled' ? 'מתוזמן' : 'פורסם'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}