#!/usr/bin/env python3
"""The companion's home helper. Does the fixed steps the same way every time, so the home
works like Roni's own home: every page is a copy kept next to the home and published with it.

  python3 home.py rebuild  <home.html> <template.html>   new template, same details, tools fixed
  python3 home.py add-page <home.html> <lesson> <source.html> <name> [title] [sub] [icon] [link]
  python3 home.py files    <home.html>                    the `files` map to publish with (JSON)
  python3 home.py add-file <home.html> <published path> <source>   a data file a page reads (for example data.json)
  python3 home.py check    <home.html>                    says OK or lists what is wrong
"""
import json, os, re, shutil, sys

PAGES_DIR = "הבית שלי - עמודים"
INFO_LESSONS = {"c0l4", "c0l5"}          # only the brain and the brand kit open as a small window
PAGE_LESSONS = {"c0l6"}                  # these must open inside the home
BLOCK = re.compile(r'(<script id="home-data" type="application/json">)(.*?)(</script>)', re.S)


def load(home):
    s = open(home, encoding="utf-8").read()
    m = BLOCK.search(s)
    if not m:
        sys.exit("לא מצאתי את הבלוק home-data בבית")
    return s, m, json.loads(m.group(2))


def save(home, s, m, data):
    txt = json.dumps(data, ensure_ascii=False, indent=2).replace("</", "<\\/")
    s = s[:m.start(2)] + "\n" + txt + "\n" + s[m.end(2):]
    open(home, "w", encoding="utf-8").write(s)


def pages_dir(home):
    return os.path.join(os.path.dirname(os.path.abspath(home)), PAGES_DIR)


def tidy(data):
    for t in data.get("tools") or []:
        if t.get("page"):
            t.pop("info", None)
    return data


def rebuild(home, template):
    _, _, data = load(home)
    old = open(home, encoding="utf-8").read()
    title = re.search(r"<title>(.*?)</title>", old, re.S)
    t = open(template, encoding="utf-8").read()
    if title:
        t = re.sub(r"<title>.*?</title>", lambda _: title.group(0), t, count=1, flags=re.S)
    m = BLOCK.search(t)
    if not m:
        sys.exit("בתבנית אין בלוק home-data")
    save(home, t, m, tidy(data))
    print("הבית נבנה מחדש מהתבנית, עם אותם פרטים.")


def add_page(home, lesson, src, name, title=None, sub=None, icon=None, link=None):
    if not os.path.isfile(src):
        sys.exit("לא מצאתי את הקובץ: " + src)
    name = re.sub(r"[^a-z0-9-]", "", name.lower()) or "page"
    d = pages_dir(home)
    os.makedirs(d, exist_ok=True)
    dest = os.path.join(d, name + ".html")
    if os.path.abspath(src) != os.path.abspath(dest):
        shutil.copyfile(src, dest)
    s, m, data = load(home)
    tools = data.setdefault("tools", [])
    t = next((x for x in tools if x.get("lesson") == lesson), None)
    if t is None:
        t = {"lesson": lesson}
        tools.append(t)
    t["page"] = "tools/" + name + ".html"
    t.pop("info", None)
    for k, v in (("title", title), ("sub", sub), ("icon", icon), ("link", link)):
        if v:
            t[k] = v
    save(home, s, m, data)
    print("העמוד נוסף לבית: " + t["page"])
    files(home)


def extras_path(home):
    return os.path.join(pages_dir(home), "files.json")


def extras(home):
    try:
        return json.load(open(extras_path(home), encoding="utf-8"))
    except Exception:
        return {}


def add_file(home, path, src):
    if not os.path.isfile(src):
        sys.exit("לא מצאתי את הקובץ: " + src)
    path = path.lstrip("/")
    d = pages_dir(home)
    os.makedirs(d, exist_ok=True)
    dest = os.path.join(d, "file-" + re.sub(r"[^A-Za-z0-9._-]", "_", path))
    shutil.copyfile(src, dest)
    e = extras(home)
    e[path] = dest
    json.dump(e, open(extras_path(home), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("הקובץ נוסף לפרסום: " + path)


def uses_db(f):
    try:
        t = open(f, encoding="utf-8", errors="ignore").read()
    except Exception:
        return False
    return bool(re.search(r"""use\(\s*['"]db['"]""", t))


def files(home):
    _, _, data = load(home)
    d = pages_dir(home)
    out = {}
    for t in data.get("tools") or []:
        p = t.get("page")
        if p:
            f = os.path.join(d, os.path.basename(p))
            if not os.path.isfile(f):
                sys.exit("חסר הקובץ של " + p + ". צריך להוסיף אותו שוב עם add-page.")
            out[p] = f
    for k, v in extras(home).items():
        if os.path.isfile(v):
            out[k] = v
    print(json.dumps(out, ensure_ascii=False))


def check(home):
    _, _, data = load(home)
    d = pages_dir(home)
    bad = []
    for t in data.get("tools") or []:
        name = t.get("title") or t.get("lesson")
        if t.get("lesson") in PAGE_LESSONS and not t.get("page"):
            bad.append(f"'{name}' צריך להיפתח בתוך הבית ואין לו עמוד. להוסיף עם add-page.")
        if t.get("page") and not os.path.isfile(os.path.join(d, os.path.basename(t["page"]))):
            bad.append(f"חסר הקובץ של '{name}'.")
        if t.get("page") and uses_db(os.path.join(d, os.path.basename(t["page"]))) and not t.get("data"):
            bad.append(f"'{name}' שומר את הנתונים שלו במאגר. צריך להעתיק את הנתונים מה-Artifact המקורי למאגר של הבית, ואז לכתוב בכלי \"data\": true.")
        if t.get("page") and t.get("info"):
            bad.append(f"ל'{name}' יש גם עמוד וגם חלון קטן.")
        if t.get("info") and t.get("lesson") not in INFO_LESSONS:
            bad.append(f"'{name}' נפתח בחלון קטן, ורק המוח של העסק וערכת המותג נפתחים כך.")
    if any(t.get("lesson") == "c0l5" and t.get("info") and not t["info"].get("logo") for t in data.get("tools") or []):
        print("הערה: בערכת המותג אין תמונת לוגו (info.logo). אם יש לוגו, כדאי להוסיף.")
    if bad:
        print("יש מה לתקן:\n- " + "\n- ".join(bad))
        sys.exit(1)
    print("OK")


if __name__ == "__main__":
    a = sys.argv[1:]
    cmds = {"rebuild": (rebuild, 2), "add-page": (add_page, 4), "add-file": (add_file, 3), "files": (files, 1), "check": (check, 1)}
    if not a or a[0] not in cmds or len(a) - 1 < cmds[a[0]][1]:
        sys.exit(__doc__)
    cmds[a[0]][0](*a[1:])
