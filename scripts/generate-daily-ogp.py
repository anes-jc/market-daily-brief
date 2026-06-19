from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError as exc:
    raise SystemExit("Pillow is required for OGP generation. Install with: python -m pip install pillow") from exc


ROOT = Path(__file__).resolve().parents[1]
LATEST_RUN = ROOT / "data" / "latest-run.json"
OG_DIR = ROOT / "assets" / "og"


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def find_font(bold: bool = False) -> str | None:
    candidates = [
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc" if bold else "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc" if bold else "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "C:/Windows/Fonts/meiryob.ttc" if bold else "C:/Windows/Fonts/meiryo.ttc",
        "C:/Windows/Fonts/YuGothB.ttc" if bold else "C:/Windows/Fonts/YuGothR.ttc",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate
    return None


def make_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    font_path = find_font(bold)
    if font_path:
        return ImageFont.truetype(font_path, size)
    return ImageFont.load_default()


def draw_text(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, font, fill: str) -> None:
    draw.text(xy, text, font=font, fill=fill)


def main() -> int:
    if not LATEST_RUN.exists():
        print("Skip OGP: data/latest-run.json does not exist.")
        return 0

    latest = load_json(LATEST_RUN)
    if latest.get("status") != "PASS":
        print(f"Skip OGP because latest status is {latest.get('status')}.")
        return 0

    date = latest["date"]
    snapshot_path = ROOT / "data" / "market-snapshots" / f"{date}.json"
    snapshot = load_json(snapshot_path)

    width, height = 1200, 630
    image = Image.new("RGB", (width, height), "#f7f5ef")
    draw = ImageDraw.Draw(image)

    accent = "#006b5f"
    accent_2 = "#8a4f11"
    ink = "#202427"
    muted = "#5e656b"
    line = "#d9d4c8"
    surface = "#ffffff"
    soft = "#eaf3ef"

    title_font = make_font(68, bold=True)
    label_font = make_font(26, bold=True)
    body_font = make_font(30)
    value_font = make_font(32, bold=True)
    small_font = make_font(21)

    draw.rounded_rectangle((44, 38, width - 44, height - 38), radius=28, fill=surface, outline=line, width=2)
    draw.rectangle((44, 38, 120, height - 38), fill=accent)
    draw.rounded_rectangle((86, 76, 1110, 164), radius=16, fill=soft)

    draw_text(draw, (116, 86), "Morning Market Memo", label_font, accent)
    draw_text(draw, (116, 126), snapshot.get("dateLabel", date), body_font, muted)
    draw_text(draw, (92, 206), "Market Daily Brief", title_font, ink)
    draw_text(draw, (96, 296), "株式・為替・金利・イベントの朝刊市場メモ", body_font, accent_2)

    metrics = snapshot.get("metrics", [])[:6]
    card_w = 324
    card_h = 90
    start_x = 92
    start_y = 354
    gap_x = 26
    gap_y = 12

    for idx, metric in enumerate(metrics):
        col = idx % 3
        row = idx // 3
        x = start_x + col * (card_w + gap_x)
        y = start_y + row * (card_h + gap_y)
        draw.rounded_rectangle((x, y, x + card_w, y + card_h), radius=12, fill="#fbfaf6", outline=line, width=1)
        draw_text(draw, (x + 18, y + 12), metric.get("label", ""), small_font, muted)
        value = metric.get("value") or "データなし"
        change = " / ".join(part for part in [metric.get("change", ""), metric.get("pct", "")] if part) or "変化率なし"
        draw_text(draw, (x + 18, y + 34), value, value_font, ink)
        draw_text(draw, (x + 18, y + 66), change, small_font, accent if "-" not in change else accent_2)

    draw_text(draw, (140, 566), "推奨しない。予想しない。煽らない。公開情報を整理する。", small_font, muted)

    OG_DIR.mkdir(parents=True, exist_ok=True)
    output = OG_DIR / f"{date}.png"
    latest_output = OG_DIR / "latest.png"
    image.save(output, "PNG")
    shutil.copyfile(output, latest_output)
    print(f"Generated OGP image: {output.relative_to(ROOT).as_posix()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
