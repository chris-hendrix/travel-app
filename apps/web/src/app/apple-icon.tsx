import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#1a1814",
        borderRadius: 36,
      }}
    >
      <svg
        width="120"
        height="120"
        viewBox="0 0 32 32"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1a5c9e" />
            <stop offset="100%" stopColor="#d1643d" />
          </linearGradient>
        </defs>
        <g transform="rotate(-6 16 16)">
          <rect x="3" y="6" width="26" height="20" rx="2" fill="url(#g)" />
          <line
            x1="16"
            y1="9"
            x2="16"
            y2="23"
            stroke="#fff"
            strokeOpacity="0.5"
            strokeWidth="0.8"
          />
          <rect
            x="21"
            y="8.5"
            width="5.5"
            height="5"
            rx="0.5"
            fill="#fff"
            fillOpacity="0.3"
          />
          <circle cx="23.75" cy="11" r="1.5" fill="#fff" fillOpacity="0.5" />
          <line
            x1="18.5"
            y1="16"
            x2="26"
            y2="16"
            stroke="#fff"
            strokeOpacity="0.6"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
          <line
            x1="18.5"
            y1="18.5"
            x2="26"
            y2="18.5"
            stroke="#fff"
            strokeOpacity="0.6"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
          <line
            x1="18.5"
            y1="21"
            x2="24"
            y2="21"
            stroke="#fff"
            strokeOpacity="0.6"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
          <circle cx="8" cy="12" r="1.5" fill="#fff" fillOpacity="0.4" />
          <path
            d="M5 21 L8.5 15 L11 19 L12.5 16.5 L14.5 21 Z"
            fill="#fff"
            fillOpacity="0.35"
          />
        </g>
      </svg>
    </div>,
    { ...size },
  );
}
