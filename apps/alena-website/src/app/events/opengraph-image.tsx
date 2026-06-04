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
          background: "#44512C",
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
          אירועים פרטיים · עלינא
        </div>
        <div
          style={{ fontSize: 120, fontWeight: 900, textAlign: "center", lineHeight: 0.95 }}
        >
          האירוע שלכם.
        </div>
        <div
          style={{
            fontSize: 120,
            fontWeight: 900,
            color: "#B89556",
            textAlign: "center",
            lineHeight: 0.95,
            marginTop: 8,
          }}
        >
          אצלנו.
        </div>
        <div style={{ fontSize: 28, marginTop: 50, color: "#F4ECD8", opacity: 0.85 }}>
          אולם פרטי עד 50 אורחים · רוטשילד 104, ראשון לציון
        </div>
      </div>
    ),
    size,
  );
}
