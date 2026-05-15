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
import { Instagram, Sparkles, Image, Send, RefreshCw, Calendar, CheckCircle, AlertCircle, Loader2, Upload, ScanSearch } from 'lucide-react';
import { toast } from 'sonner';
import DriveImagePicker from '@/components/instagram/DriveImagePicker';

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

  const handlePublish = async () => {
    if (!generatedCaption || !generatedImageUrl) {
      toast.error('נדרש טקסט ותמונה לפרסום');
      return;
    }
    setPublishing(true);
    try {
      const res = await publishInstagramPost({
        image_url: generatedImageUrl,
        caption: generatedCaption
      });
      if (res.data.success) {
        setPublished(true);
        toast.success('✅ הפוסט פורסם באינסטגרם!');
        // Log to CampaignLog
        await base44.entities.CampaignLog.create({
          channel: 'instagram',
          content: generatedCaption,
          image_url: generatedImageUrl,
          status: 'published',
          post_id: res.data.post_id,
          topic: customTopic || topic
        });
        loadScheduledPosts();
      } else {
        toast.error('שגיאה בפרסום: ' + (res.data.error || 'לא ידוע'));
      }
    } catch (e) {
      toast.error('שגיאה בפרסום');
    }
    setPublishing(false);
  };

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
          <Instagram className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Instagram Studio</h1>
          <p className="text-muted-foreground text-sm">AI יוצר פוסטים מקצועיים לאינסטגרם</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left - Generator */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">⚙️ הגדרות הפוסט</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">נושא הפוסט</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {TOPICS.map(t => (
                    <button
                      key={t}
                      onClick={() => { setTopic(t); setCustomTopic(''); }}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        topic === t && !customTopic ? 'bg-pink-100 border-pink-400 text-pink-700' : 'border-border hover:bg-muted'
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

              <Button onClick={handleGenerate} disabled={loading} className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white">
                {loading ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" /> יוצר פוסט...</> : <><Sparkles className="w-4 h-4 ml-2" /> צור פוסט עם AI</>}
              </Button>
            </CardContent>
          </Card>

          {/* Generated Caption */}
          {generatedCaption && (
            <Card>
              <CardHeader><CardTitle className="text-base">✏️ טקסט הפוסט</CardTitle></CardHeader>
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
            <CardHeader><CardTitle className="text-base">🖼️ תמונה לפוסט</CardTitle></CardHeader>
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
                    <div className="text-xs text-muted-foreground bg-purple-50 border border-purple-100 rounded-lg p-2">
                      <span className="font-medium text-purple-700">🔍 ניתוח התמונה: </span>{imageAnalysis}
                    </div>
                  )}

                  <Button
                    onClick={handleAnalyzeAndGenerate}
                    disabled={analyzingImage}
                    className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white"
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
                    <Button
                      onClick={handlePublish}
                      disabled={publishing || !generatedImageUrl}
                      className="w-full bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 text-white"
                    >
                      {publishing ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" /> מפרסם...</> : <><Send className="w-4 h-4 ml-2" /> פרסם עכשיו באינסטגרם</>}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* History */}
      {scheduledPosts.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calendar className="w-4 h-4" /> היסטוריית פרסומים</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {scheduledPosts.slice(0, 5).map(post => (
                <div key={post.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  {post.image_url && (
                    <img src={post.image_url} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{post.content?.substring(0, 80)}...</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">{post.topic}</Badge>
                      <span className="text-xs text-muted-foreground">{new Date(post.created_date).toLocaleDateString('he-IL')}</span>
                    </div>
                  </div>
                  <Badge className="bg-green-100 text-green-700 text-xs">פורסם</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}