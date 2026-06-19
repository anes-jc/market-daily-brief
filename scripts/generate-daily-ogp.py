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


def text_width(draw: ImageDraw.ImageDraw, text: str, font) -> int:
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0]


def draw_fit_text(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    max_width: int,
    size: int,
    *,
    bold: bool = False,
    fill: str,
    min_size: int = 18,
) -> None:
    current = size
    font = make_font(current, bold=bold)
    while current > min_size and text_width(draw, text, font) > max_width:
        current -= 2
        font = make_font(current, bold=bold)
    draw_text(draw, xy, text, font, fill)


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
    image = Image.new("RGB", (width, height), "#f4f1ea")
    draw = ImageDraw.Draw(image)

    panel = "#12332f"
    panel_2 = "#1f4540"
    accent = "#007466"
    accent_2 = "#a25a12"
    gold = "#f3c96b"
    ink = "#202427"
    muted = "#5e656b"
    line = "#d8d1c3"
    surface = "#ffffff"
    card = "#fbfaf6"

    title_font = make_font(62, bold=True)
    label_font = make_font(26, bold=True)
    body_font = make_font(29)
    value_font = make_font(38, bold=True)
    small_font = make_font(20)
    micro_font = make_font(18)

    draw.rounded_rectangle((38, 34, width - 38, height - 34), radius=30, fill=surface, outline=line, width=2)
    draw.rounded_rectangle((66, 64, 468, height - 64), radius=24, fill=panel)
    draw.rectangle((444, 64, 468, height - 64), fill=panel)
    draw.rounded_rectangle((92, 92, 244, 136), radius=22, fill=gold)
    draw_text(draw, (116, 102), "MARKET", small_font, panel)
    draw_text(draw, (96, 176), "Morning", body_font, "#d8ece7")
    draw_text(draw, (96, 214), "Market Memo", body_font, "#d8ece7")
    draw_text(draw, (96, 286), "Market", title_font, surface)
    draw_text(draw, (96, 356), "Daily Brief", title_font, surface)
    draw_text(draw, (98, 452), snapshot.get("dateLabel", date), make_font(34), "#d8ece7")
    draw.rounded_rectangle((96, 510, 424, 556), radius=12, fill=panel_2)
    draw_text(draw, (116, 520), "推奨しない / 予想しない / 煽らない", small_font, surface)

    draw_text(draw, (520, 86), "Public Market Snapshot", label_font, accent)
    draw_text(draw, (520, 126), "株式・為替・金利・イベントを朝の確認用に整理", body_font, ink)

    metrics = snapshot.get("metrics", [])[:6]
    card_w = 292
    card_h = 112
    start_x = 520
    start_y = 184
    gap_x = 24
    gap_y = 18

    for idx, metric in enumerate(metrics):
        col = idx % 2
        row = idx // 2
        x = start_x + col * (card_w + gap_x)
        y = start_y + row * (card_h + gap_y)
        draw.rounded_rectangle((x, y, x + card_w, y + card_h), radius=16, fill=card, outline=line, width=1)
        draw_fit_text(draw, (x + 18, y + 14), metric.get("label", ""), card_w - 36, 22, bold=True, fill=muted)
        value = metric.get("value") or "データなし"
        change = " / ".join(part for part in [metric.get("change", ""), metric.get("pct", "")] if part) or "変化率なし"
        draw_fit_text(draw, (x + 18, y + 44), value, card_w - 36, 38, bold=True, fill=ink, min_size=24)
        change_color = accent_2 if change.strip().startswith("-") else accent
        draw_fit_text(draw, (x + 18, y + 84), change, card_w - 36, 21, fill=change_color, min_size=16)

    draw.line((520, 584, 1104, 584), fill=line, width=2)
    draw_text(draw, (520, 594), "投資助言ではありません。公開情報を整理する市場メモです。", micro_font, muted)

    OG_DIR.mkdir(parents=True, exist_ok=True)
    output = OG_DIR / f"{date}.png"
    latest_output = OG_DIR / "latest.png"
    image.save(output, "PNG")
    shutil.copyfile(output, latest_output)
    print(f"Generated OGP image: {output.relative_to(ROOT).as_posix()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
