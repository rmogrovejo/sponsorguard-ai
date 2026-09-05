"""Write a tiny synthetic vertical MP4 for local Short-Form demos.

Usage (from the repository root, with backend dependencies installed):

    python scripts/generate_demo_mp4.py

The file is written to examples/demo-vertical.mp4 and is gitignored.
Do not commit third-party creator videos.
"""

from __future__ import annotations

from pathlib import Path

import av


OUTPUT = Path(__file__).resolve().parents[1] / "examples" / "demo-vertical.mp4"
WIDTH = 360
HEIGHT = 640
FPS = 12
SECONDS = 2


def _solid_frame(red: int) -> av.VideoFrame:
    frame = av.VideoFrame(WIDTH, HEIGHT, "rgb24")
    frame.planes[0].update(bytes((red % 256, 40, 80)) * (WIDTH * HEIGHT))
    return frame


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    container = av.open(str(OUTPUT), mode="w")
    stream = container.add_stream("libx264", rate=FPS)
    stream.width = WIDTH
    stream.height = HEIGHT
    stream.pix_fmt = "yuv420p"
    for index in range(FPS * SECONDS):
        frame = _solid_frame(20 + index * 3)
        for packet in stream.encode(frame):
            container.mux(packet)
    for packet in stream.encode():
        container.mux(packet)
    container.close()
    print(OUTPUT)


if __name__ == "__main__":
    main()
