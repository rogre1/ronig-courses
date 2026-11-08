"""Shared geometry for the printable template and the font builder (all units in mm, A4, origin top-left)."""

PAGE_W, PAGE_H = 210.0, 297.0

# Corner markers: black squares, centers known. Top-left one has a white hole so rotation can be detected.
MARKER = 10.0
MARKER_CENTERS = {
    "tl": (15.0, 15.0),
    "tr": (PAGE_W - 15.0, 15.0),
    "br": (PAGE_W - 15.0, PAGE_H - 15.0),
    "bl": (15.0, PAGE_H - 15.0),
}
MARKER_HOLE = 4.0

GRID_TOP = 33.0
LABEL_H = 4.5
BOX_H = 24.0
ROW_GAP = 1.5
BASELINE_FROM_BOTTOM = 7.0  # descenders live below this line
XHEIGHT_ABOVE_BASE = 11.0  # where most letters end; ל and capitals may go above
CROP_INSET = 1.3  # ignore the printed box border

PAGES = [
    {
        "title": "הפונט שלי · עמוד 1 מתוך 2",
        "hint": "טוש שחור · אות אחת בכל משבצת · האות יושבת על הקו התחתון",
        "rtl": True,
        "cols": 6,
        "chars": list("אבגדהוזחטיכךלמםנןסעפףצץקרשת")
        + list("0123456789")
        + list(".,!?-'\":()/"),
    },
    {
        "title": "My font · page 2 of 2 (English, optional)",
        "hint": "Black marker · one letter per box · sit letters on the lower line",
        "rtl": False,
        "cols": 7,
        "chars": [chr(c) for c in range(ord("A"), ord("Z") + 1)]
        + [chr(c) for c in range(ord("a"), ord("z") + 1)]
        + list("&%₪+"),
    },
]


def cells(page_index):
    """Yield (char, x, y, w, h) of each writing box in mm."""
    page = PAGES[page_index]
    cols = page["cols"]
    grid_w = PAGE_W - 30.0
    w = grid_w / cols
    for i, ch in enumerate(page["chars"]):
        row, col = divmod(i, cols)
        if page["rtl"]:
            col = cols - 1 - col
        x = 15.0 + col * w
        y = GRID_TOP + row * (LABEL_H + BOX_H + ROW_GAP) + LABEL_H
        yield ch, x, y, w, BOX_H
