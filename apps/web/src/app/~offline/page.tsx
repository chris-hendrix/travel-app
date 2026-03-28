"use client";

export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#1a1814",
        color: "#f5edd6",
        fontFamily:
          "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <svg
        width="64"
        height="64"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#f5edd6"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ marginBottom: "1.5rem", opacity: 0.6 }}
      >
        <path d="M1 1l22 22" />
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
        <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>

      <h1
        style={{
          fontSize: "1.75rem",
          fontWeight: 700,
          marginBottom: "0.75rem",
        }}
      >
        You&apos;re offline
      </h1>

      <p
        style={{
          fontSize: "1rem",
          opacity: 0.7,
          marginBottom: "2rem",
          maxWidth: "24rem",
          lineHeight: 1.5,
        }}
      >
        Check your internet connection and try again.
      </p>

      <button
        onClick={() => window.location.reload()}
        style={{
          padding: "0.75rem 2rem",
          fontSize: "1rem",
          fontWeight: 600,
          color: "#1a1814",
          backgroundColor: "#f5edd6",
          border: "none",
          borderRadius: "0.5rem",
          cursor: "pointer",
        }}
      >
        Retry
      </button>

      <p
        style={{
          marginTop: "3rem",
          fontSize: "0.875rem",
          opacity: 0.4,
          fontWeight: 600,
          letterSpacing: "0.05em",
        }}
      >
        JOURNIFUL
      </p>
    </div>
  );
}
