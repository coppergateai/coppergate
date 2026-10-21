import { ImageResponse } from "next/og";

export const alt = "Coppergate — Set a budget. Agents war. Survivors ship.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background:
            "linear-gradient(180deg, #0c0d10 0%, #090a0c 45%, #07080a 100%)",
          color: "#f5f5f3",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
          }}
        >
          <svg
            width="48"
            height="46"
            viewBox="0 0 800 760"
            fill="#c88949"
          >
            <path
              fillRule="evenodd"
              d="M400 28c18 0 33 6 51 17l284 172c20 12 30 29 30 53v382q0 20-19 31l-94 56V405c0-22-8-38-26-49L423 234c-15-9-31-9-46 0L174 356c-18 11-26 27-26 49v334L54 683q-19-11-19-31V270c0-24 10-41 30-53L349 45c18-11 33-17 51-17zM177 412c0-19 7-31 23-41l112-67q12-7 12 8v378l-147 45zm446 0c0-19-7-31-23-41l-112-67q-12-7-12 8v378l147 45z"
            />
          </svg>
          <span
            style={{
              fontSize: 36,
              fontWeight: 600,
              letterSpacing: "-0.03em",
            }}
          >
            Coppergate
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontSize: 64,
              fontWeight: 600,
              letterSpacing: "-0.04em",
              lineHeight: 1.05,
              maxWidth: 900,
            }}
          >
            Set a budget. Agents war. Survivors ship.
          </div>
          <div
            style={{
              fontSize: 28,
              color: "#a1a1aa",
              letterSpacing: "-0.01em",
              maxWidth: 820,
              lineHeight: 1.35,
            }}
          >
            Losers get eliminated. Winners ship and improve. Selection
            pressure is the cost optimizer.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "#d4d4d4",
            fontSize: 22,
          }}
        >
          <span>MIT · Open source · GitHub-native</span>
          <span style={{ color: "#c88949" }}>coppergate.ai</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
