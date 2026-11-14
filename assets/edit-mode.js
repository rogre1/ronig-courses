/* Edit mode for roni-green.com
 * Open any page with ?edit to change its texts and images in place and save straight to GitHub.
 * The page is rebuilt from its source file (not from the live DOM), so effects added by the
 * page's own scripts never get baked into the saved file.
 * The GitHub token lives only in this browser (localStorage), never in the site's code.
 */
(function () {
  if (!/[?&]edit\b/.test(location.search)) return;

  var REPO = 'rogre1/ronig-courses';
  var API = 'https://api.github.com/repos/' + REPO + '/contents/';
  var TOKEN_KEY = 'ronig-edit-token';
  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

  var TEXT_SEL = 'h1,h2,h3,h4,h5,h6,p,li,pre,figcaption,blockquote,td,th,dt,dd,' +
    '.hero-badge,.prompt-label,.eyebrow,.lbl,.prompt,.btn,.badge,.tag,.chip';
  var SKIP_INSIDE = 'header,footer,nav,script,style,svg,noscript,[data-ed-ui]';

  // which file in the repo this page is
  var path = decodeURIComponent(location.pathname);
  if (LOCAL) path = path.replace(/^\/ronig-courses-push/, '');
  path = path.replace(/^\//, '');
  if (!path || /\/$/.test(path)) path += 'index.html';
  var dir = path.replace(/[^\/]*$/, '');

  var sha = null, source = '', doctype = '', edits = [], images = [], dirty = 0, bar, countEl;

  /* ── helpers ───────────────────────────────────────── */
  function token() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {} }
  function b64ToText(b64) {
    var bin = atob(b64.replace(/\s/g, '')), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function bytesToB64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function gh(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ Authorization: 'Bearer ' + token(), Accept: 'application/vnd.github+json' }, opts.headers || {});
    return fetch(API + url, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.message || r.status); e.status = r.status; throw e; } return j; });
    });
  }
  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (html != null) e.innerHTML = html;
    return e;
  }

  /* ── styles of the editor itself ───────────────────── */
  var CSS = '' +
    '[data-ed]{outline:1.5px dashed transparent;outline-offset:4px;border-radius:4px;transition:outline-color .15s;cursor:text}' +
    '[data-ed]:hover{outline-color:rgba(79,180,170,.55)}' +
    '[data-ed]:focus{outline:2px solid #3FB8AC;outline-offset:4px}' +
    '[data-ed].ed-changed{outline-color:rgba(232,160,60,.75)}' +
    'img[data-ed-img]{cursor:pointer;outline:2px dashed rgba(79,180,170,.6);outline-offset:3px}' +
    'img[data-ed-img]:hover{outline-color:#3FB8AC;filter:brightness(.92)}' +
    '.rv{opacity:1!important;transform:none!important}' +
    'body{padding-bottom:96px!important}' +
    '[data-ed-ui]{font-family:Assistant,system-ui,sans-serif;direction:rtl;box-sizing:border-box}' +
    '[data-ed-ui] *{box-sizing:border-box;font-family:inherit}' +
    '.ed-bar{position:fixed;inset:auto 16px 16px 16px;margin:0 auto;max-width:640px;z-index:2147483000;' +
      'background:#fff;color:#14264A;border:1px solid #D6E3EF;border-radius:16px;box-shadow:0 10px 40px rgba(20,38,74,.18);' +
      'display:flex;align-items:center;gap:10px;padding:10px 12px 10px 16px;font-size:15px}' +
    '.ed-bar .ed-dot{width:9px;height:9px;border-radius:50%;background:#3FB8AC;flex:none}' +
    '.ed-bar .ed-title{font-weight:800}' +
    '.ed-bar .ed-count{color:#5B6E8C;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.ed-btn{border:0;border-radius:10px;padding:9px 16px;font-size:15px;font-weight:700;cursor:pointer;background:#EEF4F9;color:#14264A}' +
    '.ed-btn.pri{background:#14264A;color:#fff}' +
    '.ed-btn:disabled{opacity:.45;cursor:default}' +
    '.ed-modal{position:fixed;inset:0;z-index:2147483001;background:rgba(20,38,74,.35);display:flex;align-items:center;justify-content:center;padding:16px}' +
    '.ed-card{background:#fff;color:#14264A;border-radius:18px;max-width:460px;width:100%;padding:24px;box-shadow:0 20px 60px rgba(20,38,74,.25);font-size:16px;line-height:1.6}' +
    '.ed-card h3{margin:0 0 8px;font-size:22px;font-weight:800}' +
    '.ed-card p{margin:0 0 12px;color:#3D4F6C}' +
    '.ed-card ol{margin:0 0 14px;padding-inline-start:20px;color:#3D4F6C}' +
    '.ed-card a{color:#2A8F86;font-weight:700}' +
    '.ed-card input{width:100%;direction:ltr;border:1px solid #C9D7E5;border-radius:10px;padding:10px 12px;font-size:15px;margin-bottom:12px}' +
    '.ed-card .ed-row{display:flex;gap:8px;justify-content:flex-start}' +
    '.ed-card .ed-err{color:#C0392B;font-weight:700;min-height:1.4em;margin-bottom:8px}' +
    '.ed-toast{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483002;background:#14264A;color:#fff;' +
      'padding:10px 18px;border-radius:12px;font-size:15px;box-shadow:0 8px 30px rgba(20,38,74,.25)}' +
    '@media (max-width:520px){.ed-bar .ed-title{display:none}.ed-btn{padding:9px 12px}}';

  function addStyle() { var s = el('style', { 'data-ed-ui': '' }, CSS); document.head.appendChild(s); }

  function toast(msg, ms) {
    var t = el('div', { 'data-ed-ui': '', class: 'ed-toast' }); t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, ms || 3500);
  }

  /* ── token dialog ──────────────────────────────────── */
  function askToken(errMsg) {
    return new Promise(function (resolve) {
      var m = el('div', { 'data-ed-ui': '', class: 'ed-modal' },
        '<div class="ed-card"><h3>מצב עריכה</h3>' +
        '<p>כדי לשמור שינויים צריך מפתח מ-GitHub. מדביקים אותו פעם אחת, והוא נשמר רק בדפדפן הזה.</p>' +
        '<ol><li><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">פותחים את דף יצירת המפתח ב-GitHub</a></li>' +
        '<li>Repository access: בוחרים <b>Only select repositories</b> ואז <b>ronig-courses</b></li>' +
        '<li>Permissions: ב-<b>Contents</b> בוחרים <b>Read and write</b></li>' +
        '<li>לוחצים Generate token, מעתיקים ומדביקים כאן</li></ol>' +
        '<input type="password" placeholder="github_pat_..." autocomplete="off">' +
        '<div class="ed-err"></div>' +
        '<div class="ed-row"><button class="ed-btn pri" data-ok>להתחיל לערוך</button><button class="ed-btn" data-cancel>יציאה</button></div></div>');
      var input = m.querySelector('input'), err = m.querySelector('.ed-err');
      if (errMsg) err.textContent = errMsg;
      m.querySelector('[data-ok]').onclick = function () {
        var v = input.value.trim(); if (!v) { err.textContent = 'צריך להדביק מפתח'; return; }
        setToken(v); m.remove(); resolve(true);
      };
      m.querySelector('[data-cancel]').onclick = function () { m.remove(); exitEdit(); };
      input.onkeydown = function (e) { if (e.key === 'Enter') m.querySelector('[data-ok]').click(); };
      document.body.appendChild(m); input.focus();
    });
  }

  /* ── load the source file ─────────────────────────── */
  function loadSource() {
    if (LOCAL) return fetch(location.pathname, { cache: 'no-store' }).then(function (r) { return r.text(); });
    var go = function () {
      return gh(path + '?t=' + Date.now()).then(function (j) { sha = j.sha; return b64ToText(j.content); });
    };
    if (!token()) return askToken().then(go).catch(retry);
    return go().catch(retry);
    function retry(e) {
      if (e && (e.status === 401 || e.status === 403 || e.status === 404)) {
        setToken('');
        return askToken('המפתח לא עבד. כדאי לבדוק שנבחר המאגר ronig-courses ושיש הרשאת Contents: Read and write.').then(go).catch(retry);
      }
      throw e;
    }
  }

  /* ── turn the page into an editable page ─────────── */
  function mount(src) {
    source = src;
    var m = src.match(/^[\s\S]*?(?=<html[\s>])/i);
    doctype = m ? m[0] : '<!DOCTYPE html>\n';
    var doc = new DOMParser().parseFromString(src, 'text/html');   // scripts in it never run
    document.replaceChild(document.adoptNode(doc.documentElement), document.documentElement);
    addStyle();

    var all = Array.prototype.slice.call(document.body.querySelectorAll(TEXT_SEL));
    all.forEach(function (n) {
      if (n.closest(SKIP_INSIDE)) return;
      if (n.parentElement && n.parentElement.closest('[data-ed]')) return;   // a parent is already editable
      if (n.querySelector('button,input,select,textarea,img,svg,video,iframe')) {
        // a box with a button inside (like a prompt box): edit only its own text, not the button
        if (!n.matches('.prompt')) return;
        var span = null;
        Array.prototype.slice.call(n.childNodes).forEach(function (c) {
          if (c.nodeType === 3 || (c.nodeType === 1 && !c.matches('button,.lbl,.copy,.expand'))) {
            if (!span) { span = el('span', { 'data-ed-wrap': '' }); n.insertBefore(span, c); }
            span.appendChild(c);
          }
        });
        if (span) markText(span);
        return;
      }
      markText(n);
    });

    Array.prototype.slice.call(document.body.querySelectorAll('img')).forEach(function (img) {
      if (img.closest('header,footer,[data-ed-ui]')) return;
      img.setAttribute('data-ed-img', '');
      img.title = 'לחיצה להחלפת התמונה';
    });

    // in edit mode links and buttons do nothing, so a click only edits
    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-ed-ui]')) return;
      var img = e.target.closest('img[data-ed-img]');
      if (img) { e.preventDefault(); pickImage(img); return; }
      if (e.target.closest('a,button')) e.preventDefault();
    }, true);

    buildBar();
    window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  }

  function markText(n) {
    n.setAttribute('data-ed', '');
    n.setAttribute('contenteditable', 'true');
    n.setAttribute('spellcheck', 'false');
    var rec = { node: n, before: n.innerHTML, orig: n.innerHTML };
    edits.push(rec);
    n.addEventListener('input', function () { n.classList.toggle('ed-changed', n.innerHTML !== rec.before); recount(); });
    n.addEventListener('paste', function (e) {           // paste plain text only
      e.preventDefault();
      var t = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, t);
    });
    n.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (getComputedStyle(n).whiteSpace.indexOf('pre') !== 0) { document.execCommand('insertLineBreak'); return; }
      // in a prompt box a new line is a real line break, not <br>
      var sel = getSelection(); if (!sel.rangeCount) return;
      var rg = sel.getRangeAt(0); rg.deleteContents();
      var rest = document.createRange(); rest.setStart(rg.endContainer, rg.endOffset); rest.setEnd(n, n.childNodes.length);
      var t = document.createTextNode(rest.toString() ? '\n' : '\n\n');   // at the very end a second one makes the line show
      rg.insertNode(t); rg.setStart(t, 1); rg.collapse(true); sel.removeAllRanges(); sel.addRange(rg);
      n.dispatchEvent(new Event('input'));
    });
  }

  /* ── images ────────────────────────────────────────── */
  function pickImage(img) {
    var input = el('input', { type: 'file', accept: 'image/*' });
    input.onchange = function () {
      var f = input.files[0]; if (!f) return;
      if (f.size > 8 * 1024 * 1024) { toast('התמונה גדולה מדי (מעל 8MB). כדאי להקטין אותה קודם.'); return; }
      var reader = new FileReader();
      reader.onload = function () {
        var name = f.name.toLowerCase().replace(/[^a-z0-9.\-_]+/g, '-').replace(/^-+/, '') || 'image.jpg';
        name = Date.now().toString(36) + '-' + name;
        var rec = images.filter(function (r) { return r.img === img; })[0];
        if (!rec) { rec = { img: img, origSrc: img.getAttribute('src'), origSrcset: img.getAttribute('srcset') }; images.push(rec); }
        rec.file = 'img/' + name;
        rec.bytes = new Uint8Array(reader.result);
        img.src = URL.createObjectURL(f);
        img.removeAttribute('srcset');
        img.classList.add('ed-changed');
        recount();
      };
      reader.readAsArrayBuffer(f);
    };
    input.click();
  }

  /* ── bottom bar ────────────────────────────────────── */
  function buildBar() {
    bar = el('div', { 'data-ed-ui': '', class: 'ed-bar' },
      '<span class="ed-dot"></span><span class="ed-title">מצב עריכה</span>' +
      '<span class="ed-count"></span>' +
      '<button class="ed-btn pri" data-save disabled>שמירה</button>' +
      '<button class="ed-btn" data-exit>יציאה</button>');
    countEl = bar.querySelector('.ed-count');
    bar.querySelector('[data-save]').onclick = save;
    bar.querySelector('[data-exit]').onclick = function () {
      if (dirty && !confirm('יש שינויים שלא נשמרו. לצאת בלי לשמור?')) return;
      dirty = 0; exitEdit();
    };
    document.body.appendChild(bar);
    recount();
  }

  function recount() {
    dirty = edits.filter(function (r) { return r.node.innerHTML !== r.before; }).length + images.length;
    countEl.textContent = dirty ? (dirty === 1 ? 'שינוי אחד שלא נשמר' : dirty + ' שינויים שלא נשמרו')
                                : 'לוחצים על טקסט כדי לשנות אותו' + (document.querySelector('img[data-ed-img]') ? ', או על תמונה כדי להחליף' : '');
    bar.querySelector('[data-save]').disabled = !dirty;
  }

  function exitEdit() {
    location.href = location.pathname + location.search.replace(/([?&])edit\b(=[^&]*)?&?/, '$1').replace(/[?&]$/, '') + location.hash;
  }

  /* ── turn the page back into a file ──────────────── */
  // First choice: swap only the changed pieces inside the original file, so nothing else moves.
  function variants(h) {
    var v = [h, h.replace(/&amp;/g, '&'), h.replace(/&nbsp;/g, '\u00a0'), h.replace(/<br>/g, '<br/>'), h.replace(/<br>/g, '<br />')];
    return v.filter(function (x, i) { return v.indexOf(x) === i; });
  }
  // the browser types spaces as &nbsp; – keep them as plain spaces unless the original used them
  function tidy(h, orig) {
    if (orig.indexOf('&nbsp;') < 0) h = h.replace(/&nbsp;/g, ' ');
    h = h.replace(/(<br>)+\s*$/, '');
    // keep the line breaks and indentation the file had around the text
    return orig.match(/^\s*/)[0] + h.trim() + orig.match(/\s*$/)[0];
  }
  function patch() {
    var out = source, cursor = out.search(/<body[\s>]/i);
    if (cursor < 0) return null;
    for (var k = 0; k < edits.length; k++) {
      var r = edits[k], changed = r.node.innerHTML !== r.before, at = -1, len = 0;
      variants(r.orig).some(function (v) { var i = out.indexOf(v, cursor); if (i > -1) { at = i; len = v.length; return true; } });
      if (at < 0) { if (changed) return null; continue; }
      var now = changed ? tidy(r.node.innerHTML, r.orig) : out.substr(at, len);
      out = out.slice(0, at) + now + out.slice(at + len);
      cursor = at + now.length;
    }
    for (var j = 0; j < images.length; j++) {
      var im = images[j], a = 'src="' + im.origSrc + '"', b = out.search(/<body[\s>]/i);
      if (out.indexOf(a, b) < 0 || out.indexOf(a, b) !== out.lastIndexOf(a)) return null;
      out = out.replace(a, 'src="' + im.file + '"');
      if (im.origSrcset) {
        var ss = ' srcset="' + im.origSrcset + '"';
        if (out.indexOf(ss) < 0 || out.indexOf(ss) !== out.lastIndexOf(ss)) return null;
        out = out.replace(ss, '');
      }
    }
    return out;
  }

  // Fallback: write the whole page out again (looks the same, the file just gets reformatted)
  function serialize() {
    var root = document.documentElement.cloneNode(true);
    Array.prototype.slice.call(root.querySelectorAll('[data-ed-ui]')).forEach(function (n) { n.remove(); });
    Array.prototype.slice.call(root.querySelectorAll('[data-ed-wrap]')).forEach(function (n) {
      while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n);
      n.remove();
    });
    Array.prototype.slice.call(root.querySelectorAll('[data-ed]')).forEach(function (n) {
      n.removeAttribute('data-ed'); n.removeAttribute('contenteditable'); n.removeAttribute('spellcheck');
    });
    Array.prototype.slice.call(root.querySelectorAll('[data-ed-img]')).forEach(function (n) {
      n.removeAttribute('data-ed-img'); n.removeAttribute('title');
    });
    Array.prototype.slice.call(root.querySelectorAll('.ed-changed')).forEach(function (n) {
      n.classList.remove('ed-changed'); if (!n.getAttribute('class')) n.removeAttribute('class');
    });
    // replaced images point at their new file
    var live = Array.prototype.slice.call(document.querySelectorAll('img'));
    var copy = Array.prototype.slice.call(root.querySelectorAll('img'));
    images.forEach(function (r) { var i = live.indexOf(r.img); if (i > -1) copy[i].setAttribute('src', r.file); });
    return doctype + root.outerHTML + '\n';
  }

  /* ── save ──────────────────────────────────────────── */
  function save() {
    var btn = bar.querySelector('[data-save]');
    btn.disabled = true; btn.textContent = 'שומרת...';
    var html = patch() || serialize();

    if (LOCAL) {   // local check: nothing is sent anywhere
      window.__editResult = html;
      done('מצב בדיקה מקומי: השינויים לא נשלחו לאתר');
      return;
    }

    var chain = Promise.resolve();
    images.forEach(function (r) {
      chain = chain.then(function () {
        return gh(dir + r.file, { method: 'PUT', body: JSON.stringify({ message: 'Edit mode: new image for ' + path, content: bytesToB64(r.bytes) }) });
      });
    });
    chain.then(function () {
      var bytes = new TextEncoder().encode(html);
      return gh(path, { method: 'PUT', body: JSON.stringify({ message: 'Edit mode: text changes in ' + path, content: bytesToB64(bytes), sha: sha }) });
    }).then(function (j) {
      sha = j.content.sha;
      done('נשמר! האתר יתעדכן תוך דקה-שתיים');
    }).catch(function (e) {
      btn.textContent = 'שמירה'; btn.disabled = false;
      if (e.status === 409) toast('הדף השתנה בינתיים במקום אחר. כדאי להעתיק את השינויים, לרענן ולנסות שוב.', 7000);
      else if (e.status === 401 || e.status === 403) { setToken(''); toast('המפתח לא עבד או פג תוקפו. ננסה שוב עם מפתח חדש.', 6000); askToken(); }
      else toast('השמירה נכשלה: ' + e.message, 7000);
    });

    function done(msg) {
      source = html;
      edits.forEach(function (r) { r.orig = tidy(r.node.innerHTML, r.orig); r.before = r.node.innerHTML; r.node.classList.remove('ed-changed'); });
      images.forEach(function (r) { r.img.classList.remove('ed-changed'); });
      images = [];
      btn.textContent = 'שמירה';
      recount();
      toast(msg, 5000);
    }
  }

  /* ── start ─────────────────────────────────────────── */
  function start() {
    addStyle();
    loadSource().then(mount).catch(function (e) { toast('לא הצלחתי לפתוח את מצב העריכה: ' + e.message, 8000); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
