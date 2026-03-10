import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

export default function TextOverlayEditor({ preview, onAdd, onRemove, current }) {
  const [text, setText] = useState(current?.text || "");
  const [color, setColor] = useState(current?.color || "#FFFFFF");
  const [fontSize, setFontSize] = useState(current?.font_size || 32);
  const [position, setPosition] = useState(current?.position || "center");
  const [bgColor, setBgColor] = useState(current?.background_color || "");

  const handleAdd = () => {
    if (!text.trim()) return;
    onAdd({
      text,
      color,
      font_size: fontSize,
      position,
      background_color: bgColor || undefined
    });
    setText("");
    setColor("#FFFFFF");
    setFontSize(32);
    setPosition("center");
    setBgColor("");
  };

  return (
    <div className="space-y-4 bg-white rounded-xl p-4" dir="rtl">
      <h3 className="font-bold text-lg">✏️ הוסף טקסט על התמונה</h3>

      {/* Preview */}
      {preview && (
        <div className="relative w-full aspect-video bg-gray-200 rounded-lg overflow-hidden">
          {preview.media_type === "video"
            ? <video src={preview.media_url} className="w-full h-full object-cover" />
            : <img src={preview.media_url} className="w-full h-full object-cover" alt="" />
          }

          {/* Text Overlay Preview */}
          {current && (
            <div
              className={`absolute inset-x-0 flex items-center justify-center px-4 ${
                current.position === "top" ? "top-8" : current.position === "bottom" ? "bottom-8" : "top-1/2 -translate-y-1/2"
              }`}
            >
              <div
                style={{
                  color: current.color,
                  fontSize: `${current.font_size}px`,
                  backgroundColor: current.background_color ? `${current.background_color}80` : "transparent",
                  padding: current.background_color ? "8px 16px" : "0",
                  borderRadius: current.background_color ? "8px" : "0",
                  textAlign: "center",
                  fontWeight: "bold",
                  textShadow: current.background_color ? "none" : "2px 2px 4px rgba(0,0,0,0.5)"
                }}
              >
                {current.text}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Text Input */}
      <div>
        <label className="text-sm font-medium">טקסט</label>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="הכנס את הטקסט שלך..."
          maxLength={100}
          className="mt-1"
        />
      </div>

      {/* Position */}
      <div>
        <label className="text-sm font-medium">מיקום</label>
        <div className="flex gap-2 mt-2">
          {["top", "center", "bottom"].map((pos) => (
            <button
              key={pos}
              onClick={() => setPosition(pos)}
              className={`flex-1 py-2 rounded-lg font-medium transition-all ${
                position === pos
                  ? "bg-primary text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {pos === "top" ? "🔝 למעלה" : pos === "center" ? "⭐ באמצע" : "🔽 למטה"}
            </button>
          ))}
        </div>
      </div>

      {/* Font Size */}
      <div>
        <label className="text-sm font-medium">גודל גופן: {fontSize}px</label>
        <input
          type="range"
          min="16"
          max="64"
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value))}
          className="w-full mt-2"
        />
      </div>

      {/* Colors */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium">צבע הטקסט</label>
          <div className="flex gap-2 mt-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-12 h-10 rounded cursor-pointer"
            />
            <div
              className="flex-1 rounded border-2 border-gray-200 flex items-center justify-center"
              style={{ backgroundColor: color, color: color }}
            >
              Aa
            </div>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">צבע רקע (אופציונלי)</label>
          <div className="flex gap-2 mt-2">
            <input
              type="color"
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              className="w-12 h-10 rounded cursor-pointer"
            />
            <div
              className="flex-1 rounded border-2 border-gray-200"
              style={{ backgroundColor: bgColor || "transparent" }}
            />
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-2">
        <Button onClick={handleAdd} className="flex-1 bg-green-600 hover:bg-green-700">
          ✅ הוסף טקסט
        </Button>
        {current && (
          <Button onClick={onRemove} variant="destructive" className="flex-1">
            <X className="w-4 h-4" /> הסר
          </Button>
        )}
      </div>
    </div>
  );
}