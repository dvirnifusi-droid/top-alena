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
          background: "#FAF3E7",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: 80,
        }}
      >
        <div style={{ fontSize: 96, color: "#C65D3A", fontWeight: 700 }}>עלינא</div>
        <div style={{ fontSize: 36, color: "#2B2825", marginTop: 16 }}>
          חמארה ים-תיכונית כשרה · ראשון לציון
        </div>
      </div>
    ),
    size
  );
}
