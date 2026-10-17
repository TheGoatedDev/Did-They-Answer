import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt =
  "Did They Answer? How thoroughly the UK government engages with the petitions it answers.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const icon = await readFile(join(process.cwd(), "src/app/icon.svg"), "base64");

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "white",
        color: "#0a0a0a",
        borderTop: "16px solid #0a0a0a",
        padding: "72px 80px 64px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
        {/* biome-ignore lint/performance/noImgElement: ImageResponse needs a plain img */}
        <img
          src={`data:image/svg+xml;base64,${icon}`}
          width={120}
          height={120}
          alt=""
        />
        <div style={{ fontSize: 88, fontWeight: 700, letterSpacing: -2 }}>
          Did They Answer?
        </div>
      </div>
      <div
        style={{
          fontSize: 40,
          lineHeight: 1.3,
          color: "#525252",
          maxWidth: 960,
        }}
      >
        How thoroughly does the UK government engage with the petitions it
        answers?
      </div>
      <div style={{ display: "flex", height: 20 }}>
        <div style={{ flex: 1, background: "#86b6ef" }} />
        <div style={{ flex: 1, background: "#2a78d6" }} />
        <div style={{ flex: 1, background: "#104281" }} />
      </div>
    </div>,
    size,
  );
}
