import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "edge";

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #1F1B17 0%, #44512C 60%, #A04A2E 100%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: 80,
          position: "relative",
        }}
      >
        {/* Brass accent line */}
        <div
          style={{
            position: "absolute",
            top: 60,
            left: 60,
            right: 60,
            height: 2,
            background: "#B89556",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 60,
            left: 60,
            right: 60,
            height: 2,
            background: "#B89556",
          }}
        />

        <div
          style={{
            fontSize: 28,
            color: "#D9BD83",
            letterSpacing: 10,
            textTransform: "uppercase",
            marginBottom: 28,
          }}
        >
          רוטשילד 104 · ראשון לציון
        </div>
        <div
          style={{
            fontSize: 200,
            color: "#F4ECD8",
            fontWeight: 900,
            lineHeight: 0.9,
          }}
        >
          עלינא
        </div>
        <div
          style={{
            fontSize: 36,
            color: "#F4ECD8",
            opacity: 0.85,
            marginTop: 24,
          }}
        >
          חמארה ים-תיכונית · כשרה
        </div>
        <div
          style={{
            fontSize: 22,
            color: "#D9BD83",
            marginTop: 40,
            display: "flex",
            gap: 24,
          }}
        >
          <span>🍷 ערבי יין</span>
          <span>🔥 ג'וספר 600°</span>
          <span>🍔 Burger Night</span>
        </div>
      </div>
    ),
    size,
  );
}
