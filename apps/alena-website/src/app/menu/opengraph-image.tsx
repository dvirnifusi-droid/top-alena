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
          background: "#F4ECD8",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: 100,
        }}
      >
        <div
          style={{
            fontSize: 24,
            color: "#B89556",
            letterSpacing: 8,
            textTransform: "uppercase",
            marginBottom: 30,
          }}
        >
          תפריט · עלינא
        </div>
        <div
          style={{
            fontSize: 110,
            color: "#A04A2E",
            fontWeight: 900,
            textAlign: "center",
            lineHeight: 1,
          }}
        >
          המומלצים שלנו
        </div>
        <div
          style={{ display: "flex", gap: 40, marginTop: 50, fontSize: 28, color: "#1F1B17" }}
        >
          <span>עלינאבורגר ₪64</span>
          <span>·</span>
          <span>אנטריקוט ₪134</span>
          <span>·</span>
          <span>ברוסקטה ₪61</span>
        </div>
      </div>
    ),
    size,
  );
}
