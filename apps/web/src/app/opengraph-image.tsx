import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Journiful - Group Trip Planner";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  const fontsDir = join(process.cwd(), "src/assets/fonts");
  const [playfairFont, dmSansFont] = await Promise.all([
    readFile(join(fontsDir, "PlayfairDisplay-Bold.ttf")),
    readFile(join(fontsDir, "DMSans-Regular.ttf")),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#1a1814",
        position: "relative",
      }}
    >
      {/* Gradient accent line at top */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 6,
          display: "flex",
          background: "linear-gradient(to right, #1a5c9e, #d1643d)",
        }}
      />

      {/* Wordmark */}
      <div
        style={{
          fontSize: 80,
          fontFamily: "Playfair Display",
          fontWeight: 700,
          color: "#fbf6ef",
          letterSpacing: "-0.02em",
          marginBottom: 16,
          display: "flex",
        }}
      >
        Journiful
      </div>

      {/* Tagline */}
      <div
        style={{
          fontSize: 28,
          fontFamily: "DM Sans",
          color: "#8c8173",
          display: "flex",
        }}
      >
        Plan Group Trips Together
      </div>

      {/* Decorative diamond */}
      <div
        style={{
          marginTop: 40,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 48,
            height: 1,
            backgroundColor: "#3a2d22",
            display: "flex",
          }}
        />
        <div
          style={{
            width: 8,
            height: 8,
            transform: "rotate(45deg)",
            border: "1px solid #d1643d",
            display: "flex",
          }}
        />
        <div
          style={{
            width: 48,
            height: 1,
            backgroundColor: "#3a2d22",
            display: "flex",
          }}
        />
      </div>
    </div>,
    {
      ...size,
      fonts: [
        {
          name: "Playfair Display",
          data: playfairFont,
          style: "normal",
          weight: 700,
        },
        {
          name: "DM Sans",
          data: dmSansFont,
          style: "normal",
          weight: 400,
        },
      ],
    },
  );
}
