import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Music, Check, Play, Pause } from "lucide-react";

// דוגמות של מוזיקה ללא זכויות יוצרים עם URLs ממשיים
const SAMPLE_AUDIO_LIBRARY = [
  { id: "upbeat1", title: "יום חדש", artist: "ספרייה חופשית", duration: 60, category: "upbeat", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" },
  { id: "upbeat2", title: "אנרגיה חיובית", artist: "ספרייה חופשית", duration: 45, category: "upbeat", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3" },
  { id: "chill1", title: "הרגע מנוח", artist: "ספרייה חופשית", duration: 90, category: "chill", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3" },
  { id: "chill2", title: "ערב שקט", artist: "ספרייה חופשית", duration: 120, category: "chill", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3" },
  { id: "fun1", title: "כיף וצחוק", artist: "ספרייה חופשית", duration: 60, category: "fun", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3" },
  { id: "fun2", title: "מסיבה קטנה", artist: "ספרייה חופשית", duration: 75, category: "fun", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3" },
  { id: "motivate1", title: "השראה", artist: "ספרייה חופשית", duration: 80, category: "motivate", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3" },
  { id: "motivate2", title: "עוצמה ויכולת", artist: "ספרייה חופשית", duration: 100, category: "motivate", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3" },
];

const CATEGORIES = {
  upbeat: "🎉 אנרגטי",
  chill: "😌 רגוע",
  fun: "😄 재미있음",
  motivate: "💪 השראה"
};

export default function AudioLibrary({ onSelect, selected }) {
  const [category, setCategory] = useState("upbeat");
  const [playingId, setPlayingId] = useState(null);

  const filtered = SAMPLE_AUDIO_LIBRARY.filter(audio => audio.category === category);

  return (
    <div className="space-y-4 bg-white rounded-xl p-4" dir="rtl">
      <h3 className="font-bold text-lg flex items-center gap-2">
        <Music className="w-5 h-5" /> בחר מוזיקה לסטורי
      </h3>

      {/* Category Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {Object.entries(CATEGORIES).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setCategory(key)}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all ${
              category === key
                ? "bg-primary text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Audio Library Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map((audio) => {
          const isSelected = selected?.id === audio.id;
          const isPlaying = playingId === audio.id;

          return (
            <Card
              key={audio.id}
              className={`cursor-pointer transition-all border-2 ${
                isSelected
                  ? "bg-green-50 border-green-500 shadow-md"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <CardContent className="p-4">
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-bold text-sm">{audio.title}</h4>
                      <p className="text-xs text-muted-foreground">{audio.artist}</p>
                      <p className="text-xs text-muted-foreground mt-1">⏱️ {audio.duration} שניות</p>
                    </div>
                    {isSelected && <Check className="w-5 h-5 text-green-500 flex-shrink-0" />}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPlayingId(isPlaying ? null : audio.id)}
                      className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 rounded text-sm font-medium flex items-center justify-center gap-1 transition-all"
                    >
                      {isPlaying ? (
                        <>
                          <Pause className="w-4 h-4" /> עצור
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" /> השמע
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => onSelect(audio)}
                      className={`flex-1 py-2 rounded text-sm font-bold transition-all ${
                        isSelected
                          ? "bg-green-500 text-white"
                          : "bg-primary text-white hover:bg-primary/90"
                      }`}
                    >
                      {isSelected ? "✓ בחור" : "בחר"}
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Upload Custom Audio */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
        <h4 className="font-bold text-sm mb-2">📤 עלה מוזיקה משלך</h4>
        <input
          type="file"
          accept="audio/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              // In a real app, you'd upload this and get a URL
              console.log("Upload audio:", file.name);
            }
          }}
          className="w-full text-sm"
        />
        <p className="text-xs text-muted-foreground mt-2">קבצי MP3, WAV, OGG</p>
      </div>

      {selected && (
        <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
          <h4 className="font-bold text-sm mb-1">🎵 מוזיקה שנבחרה</h4>
          <p className="text-sm">{selected.title} - {selected.artist}</p>
        </div>
      )}
    </div>
  );
}