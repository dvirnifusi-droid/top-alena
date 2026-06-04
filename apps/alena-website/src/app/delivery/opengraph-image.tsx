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
          background: "linear-gradient(135deg, #44512C 0%, #1F1B17 100%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: 100,
          color: "#F4ECD8",
        }}
      >
        <div
          style={{
            fontSize: 24,
            color: "#D9BD83",
            letterSpacing: 8,
            textTransform: "uppercase",
            marginBottom: 30,
          }}
        >
          משלוחים · Take Away
        </div>
        <div
          style={{ fontSize: 130, fontWeight: 900, textAlign: "center", lineHeight: 0.95 }}
        >
          עלינא
        </div>
        <div
          style={{ fontSize: 80, fontWeight: 800, textAlign: "center", color: "#B89556" }}
        >
          עד הבית
        </div>
        <div style={{ fontSize: 28, marginTop: 40, color: "#F4ECD8", opacity: 0.85 }}>
          הזמנה דרך ValueCard · רוטשילד 104
        </div>
      </div>
    ),
    size,
  );
}
