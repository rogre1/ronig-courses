"""Turn photos of the filled template into a .ttf font.

usage: build_font.py "Font Name" page1.jpg [page2.jpg] [--raw | --align]   (--raw: keep letters as written; --align: same sizes, common baseline)
"""
import os
import sys

import cv2
import numpy as np
import pillow_heif
import potrace
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from PIL import Image, ImageOps

import layout as L

pillow_heif.register_heif_opener()

PX_PER_MM = 12  # resolution of the flattened page
UNITS_PER_MM = 700 / L.XHEIGHT_ABOVE_BASE  # baseline-to-guide = 700 units
SIDE_BEARING = 70
NARROW_EXTRA = 30  # thin letters (ו ן ' !) look cramped with the same bearing as wide ones
OPEN_SIDE_PULL = 0.35
MAX_PULL_GAP = 200
BODY_HEIGHT = 700
SPACE_WIDTH = 320
MIN_SPECK_MM2 = 0.12

BALANCE = "--raw" not in sys.argv
ALIGN_ONLY = "--align" in sys.argv
PS_NAME = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--ps=")), None)
ALIGN_BASE = "אבגדהוזחטכמםנסצרשתץף" "ABCDEFGHIJKLMNOPQRSTUVWXYZ" "abcdefhiklmnorstuvwxz"
ALIGN_HANG = "ךןקעי" "gjpqy"
STRENGTH = 0.8  # 1 = every letter exactly the group's median size
GROUPS = [
    ("אבגדהוזחטכמםנסעפצרשת" "ABCDEFGHIJKLMNOPQRSTUVWXYZ" "acemnorsuvwxz", "base"),
    ("ךןףץק" "gpqy", "desc"),
    ("0123456789", "base"),
    ("bdfhklt", "base"),
]


def load(path):
    img = ImageOps.exif_transpose(Image.open(path)).convert("L")
    return np.array(img)


def find_markers(gray):
    """Return 4 marker centers (px) ordered tl, tr, br, bl in image space."""
    h, w = gray.shape
    scale = 1600 / max(h, w)
    small = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    # light-gray box outlines must not pass, so threshold globally (Otsu) on a background-flattened image
    bg = cv2.medianBlur(cv2.dilate(small, np.ones((15, 15), np.uint8)), 51)
    flat = cv2.divide(small, bg, scale=255)
    _, bw = cv2.threshold(flat, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(bw, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cands = []
    for c in contours:
        area = cv2.contourArea(c)
        if area < 150:
            continue
        x, y, cw, ch = cv2.boundingRect(c)
        ratio = cw / ch
        hull = cv2.contourArea(cv2.convexHull(c))
        # a marker is a solid dark square (the top-left one has a small hole, so sample off-center)
        solid = ch > 6 and cw > 6 and bw[y + ch // 5 : y + ch // 3, x + cw // 5 : x + cw // 3].mean() > 200
        if 0.7 < ratio < 1.4 and hull and area / hull > 0.9 and area / (cw * ch) > 0.75 and solid:
            m = cv2.moments(c)
            cands.append((area, m["m10"] / m["m00"], m["m01"] / m["m00"]))
    if len(cands) < 4:
        raise SystemExit("לא מצאתי את 4 הריבועים השחורים בפינות. צלמי שוב כשכל הדף בתמונה.")
    # markers are the largest similar squares, one nearest each image corner
    cands.sort(reverse=True)
    pool = cands[:12]
    corners = [(0, 0), (small.shape[1], 0), (small.shape[1], small.shape[0]), (0, small.shape[0])]
    pts = []
    for cx, cy in corners:
        best = min(pool, key=lambda p: (p[1] - cx) ** 2 + (p[2] - cy) ** 2)
        pts.append((best[1] / scale, best[2] / scale))
    return np.float32(pts)


def flatten(gray):
    src = find_markers(gray)
    order = ["tl", "tr", "br", "bl"]
    dst = np.float32([[L.MARKER_CENTERS[k][0] * PX_PER_MM, L.MARKER_CENTERS[k][1] * PX_PER_MM] for k in order])
    size = (int(L.PAGE_W * PX_PER_MM), int(L.PAGE_H * PX_PER_MM))
    hx, hy = (int(v * PX_PER_MM) for v in L.MARKER_CENTERS["tl"])
    best = None
    for shift in range(4):  # the photo may be rotated; the hollow marker tells which corner is top-left
        M = cv2.getPerspectiveTransform(np.roll(src, -shift, axis=0), dst)
        page = cv2.warpPerspective(gray, M, size, flags=cv2.INTER_CUBIC, borderValue=255)
        hole = page[hy - 8 : hy + 8, hx - 8 : hx + 8].mean()
        if best is None or hole > best[0]:
            best = (hole, page)
    return best[1]


def ink_mask(page):
    """Binary mask of pen strokes, robust to uneven lighting; light-gray guides drop out."""
    bg = cv2.dilate(page, np.ones((25, 25), np.uint8))
    bg = cv2.medianBlur(bg, 31)
    norm = cv2.divide(page, bg, scale=255)
    _, mask = cv2.threshold(norm, 150, 255, cv2.THRESH_BINARY_INV)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    return mask


def clean(cell):
    n, labels, stats, _ = cv2.connectedComponentsWithStats(cell, 8)
    keep = np.zeros_like(cell)
    # drop specks: tiny in absolute terms, or tiny next to the cell's main stroke (keeps the dots of . : ! ?)
    largest = stats[1:, cv2.CC_STAT_AREA].max() if n > 1 else 0
    min_area = max(MIN_SPECK_MM2 * PX_PER_MM**2, 0.05 * largest)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= min_area:
            keep[labels == i] = 255
    return keep


def trace(cell, pen):
    """Vectorize a binary cell (255 = ink) into pen, in px with y up from the cell's bottom edge.

    Uses potracer, a pure-Python port of potrace, so nothing outside pip is needed (same on Mac and Windows).
    """
    h = cell.shape[0]
    pt = lambda p: (p.x, h - p.y)
    # potracer reads the array as brightness: False (dark) is ink
    for curve in potrace.Bitmap(cell == 0).trace(turdsize=6, alphamax=1.0, opticurve=True, opttolerance=0.4):
        pen.moveTo(pt(curve.start_point))
        for seg in curve.segments:
            if seg.is_corner:
                pen.lineTo(pt(seg.c))
                pen.lineTo(pt(seg.end_point))
            else:
                pen.curveTo(pt(seg.c1), pt(seg.c2), pt(seg.end_point))
        pen.closePath()


def align(raw, b):
    """Put letters on a common line without resizing them: for letters written floating above the guide."""
    present = lambda chars: [ch for ch in chars if ch in b]
    base = present(ALIGN_BASE)
    if not base:
        return {ch: (rec, (1.0, 0.0, 0.0)) for ch, rec in raw.items()}
    offset = float(np.median([b[ch][1] for ch in base]))  # how far above the line this page was written
    top = float(np.median([b[ch][3] - b[ch][1] for ch in base]))
    out = {}
    for ch, rec in raw.items():
        ymin, ymax = b[ch][1], b[ch][3]
        if ch in ALIGN_BASE or ch in "ל0123456789":
            ty = -ymin
        elif ch in ALIGN_HANG:  # tops line up with the body, tails go below
            ty = top - ymax
        elif ch in ".!?:":
            ty = -ymin
        elif ch == ",":  # a comma dips just under the line
            ty = -ymin - 0.4 * (ymax - ymin)
        else:  # punctuation and the rest keep their place relative to the hand's own line
            ty = -offset
        out[ch] = (rec, (1.0, 0.0, ty))
    return out


def balance(raw):
    """Even out letter sizes and baselines within each group of similar letters.

    Returns {char: (recording, (scale, dx, dy))}. Each group is pulled toward its median size; STRENGTH < 1
    keeps some of the handwriting's natural variation.
    """
    def bounds(rec):
        bp = BoundsPen(None)
        rec.replay(bp)
        return bp.bounds

    b = {ch: bounds(rec) for ch, rec in raw.items()}
    out = {ch: (rec, (1.0, 0.0, 0.0)) for ch, rec in raw.items()}
    if ALIGN_ONLY:
        return align(raw, b)
    if not BALANCE:
        return out

    def scale_to(h, target):
        return min(1.4, max(0.7, (target / h) ** STRENGTH)) if h > 0 else 1.0

    for group, mode in GROUPS:
        members = [ch for ch in group if ch in b]
        if len(members) < 2:
            continue
        heights = [b[ch][3] - b[ch][1] for ch in members]
        target = float(np.median(heights))
        depth = float(np.median([b[ch][1] for ch in members]))
        for ch, h in zip(members, heights):
            sx = scale_to(h, target)
            ymin = b[ch][1] * sx
            # base: sit on the baseline; desc: hang to the group's typical depth
            ty = -ymin if mode == "base" else depth - ymin
            out[ch] = (raw[ch], (sx, 0.0, ty))

    # single letters that should line up with the body: ל sits on the line, י hangs from the top guide
    body_top = float(np.median([b[ch][3] - b[ch][1] for ch in GROUPS[0][0] if ch in b]))
    if "ל" in b:
        out["ל"] = (raw["ל"], (1.0, 0.0, -b["ל"][1]))
    if "י" in b:
        out["י"] = (raw["י"], (1.0, 0.0, body_top - b["י"][3]))
    return out


def side_gaps(cell, left, right, base_px):
    """Mean empty space (px) between the ink's bounding box and the ink, per side, over the letter body rows."""
    top = max(0, base_px - int(L.XHEIGHT_ABOVE_BASE * PX_PER_MM))
    lg, rg = [], []
    for row in cell[top:base_px]:
        ink = np.where(row)[0]
        if len(ink):
            lg.append(ink[0] - left)
            rg.append(right - 1 - ink[-1])
    if not lg:  # marks that live outside the body zone (' " -) have no open sides
        return np.array([0.0, 0.0])
    return np.array([np.mean(lg), np.mean(rg)])


def glyph_name(ch):
    return "space" if ch == " " else f"uni{ord(ch):04X}"


def build(name, photos):
    glyphs, metrics, cmap = {}, {}, {}
    empty = TTGlyphPen(None).glyph()
    glyphs[".notdef"], metrics[".notdef"] = empty, (500, 0)
    glyphs["space"], metrics["space"], cmap[32] = empty, (SPACE_WIDTH, 0), "space"
    missing, raw, gaps = [], {}, {}
    for page_i, photo in enumerate(photos):
        mask = ink_mask(flatten(load(photo)))
        cv2.imwrite(os.path.join(os.path.dirname(os.path.abspath(photo)), f"debug_page{page_i + 1}.png"), 255 - mask)
        for ch, bx, by, bw, bh in L.cells(page_i):
            x0, y0 = int((bx + L.CROP_INSET) * PX_PER_MM), int((by + L.CROP_INSET) * PX_PER_MM)
            x1, y1 = int((bx + bw - L.CROP_INSET) * PX_PER_MM), int((by + bh - L.CROP_INSET) * PX_PER_MM)
            cell = clean(mask[y0:y1, x0:x1])
            cols = np.where(cell.any(axis=0))[0]
            if not len(cols):
                missing.append(ch)
                continue
            left, right = cols[0], cols[-1] + 1
            base_px = (by + bh - L.BASELINE_FROM_BOTTOM) * PX_PER_MM - y0
            s = UNITS_PER_MM / PX_PER_MM
            # traced outline is in px, y up from the crop bottom; move the ink's left edge to x=0 and the guide line to y=0
            rec = RecordingPen()
            trace(cell, TransformPen(rec, (s, 0, 0, s, -left * s, -(cell.shape[0] - base_px) * s)))
            raw[ch] = rec
            gaps[ch] = side_gaps(cell, left, right, int(base_px)) * s

    for ch, (rec, (sx, tx, ty)) in balance(raw).items():
        bp = BoundsPen(None)
        rec.replay(TransformPen(bp, (sx, 0, 0, sx, tx, ty)))
        xmin, _, xmax, _ = bp.bounds
        width = xmax - xmin
        base = SIDE_BEARING + (NARROW_EXTRA if width < 0.35 * BODY_HEIGHT else 0)
        # optical spacing: an open side (the left of כ or ר) already looks airy, so it gets less bearing
        lsb, rsb = (round(base - OPEN_SIDE_PULL * min(g * sx, MAX_PULL_GAP)) for g in gaps[ch])
        pen = TTGlyphPen(None)
        # potracer already winds outer contours clockwise (y up), as TrueType wants
        rec.replay(TransformPen(Cu2QuPen(pen, 1.0), (sx, 0, 0, sx, tx - xmin + lsb, ty)))
        gn = glyph_name(ch)
        glyphs[gn] = pen.glyph()
        metrics[gn] = (round(width + lsb + rsb), lsb)
        cmap[ord(ch)] = gn

    order = list(glyphs)
    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=1150, descent=-480)
    family = name.strip()
    # file/PostScript names must be ASCII; a Hebrew family name needs --ps=LatinName
    ps = PS_NAME or "".join(c for c in family if c.isalnum() and c.isascii()) or "MyHandwriting"
    # Mac-platform name records are Mac Roman and cannot hold Hebrew; the Windows (Unicode) ones are what apps read
    fb.setupNameTable({"familyName": family, "styleName": "Regular", "fullName": family, "uniqueFontIdentifier": ps + "-Regular", "psName": ps + "-Regular"}, mac=family.isascii())
    fb.setupOS2(sTypoAscender=1150, sTypoDescender=-480, usWinAscent=1150, usWinDescent=480,
                ulCodePageRange1=(1 << 0) | (1 << 5))  # Latin 1 + Hebrew
    fb.setupPost()
    for g in fb.font["glyf"].glyphs.values():
        g.recalcBounds(fb.font["glyf"])
    out = f"{ps}.ttf"
    fb.save(out)
    print("wrote", out, "glyphs:", len(cmap) - 1)
    if missing:
        print("missing (empty boxes):", " ".join(missing))
    return out


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    args = [a for a in sys.argv[1:] if a not in ("--raw", "--align") and not a.startswith("--ps=")]
    build(args[0], args[1:])
