import { ImageResponse } from "next/og";

export const alt = "NY IRL — Be in the right room";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Wordmark on the landing gradient, generated at request time — no image
// asset checked in, consistent with §A4's "no image assets" instruction.
export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundImage: "linear-gradient(to bottom, #C85A28, #E39B8B)",
        }}
      >
        <div
          style={{
            fontSize: 120,
            fontWeight: 600,
            letterSpacing: 24,
            color: "#F6F5F3",
            textTransform: "uppercase",
          }}
        >
          NY IRL
        </div>
      </div>
    ),
    { ...size },
  );
}
