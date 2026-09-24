/* Ronig.ai — קורס החלפת רקעים */
(function(){
  'use strict';

  /* ============================================================
     הגדרות שרוני צריכה למלא לפני הפרסום
     ------------------------------------------------------------
     PAY_URL      — קישור התשלום ב-Grow. מוחל על כפתורי .js-pay (כרטיס
                    המחיר). כל עוד הוא '#pricing' הכפתורים רק מגלגלים
                    לכרטיס המחיר.
     LAUNCH_START — תחילת חלון ההשקה (119 ₪). פורמט ISO עם אזור זמן ישראל.
     LAUNCH_END   — סיום חלון ההשקה. אחריו הדף מציג 169 ₪ אוטומטית.
     כל עוד התאריכים מכילים 'XX' הדף מציג את מצב ההשקה (לצורך בדיקה).
     שימו לב: זה משנה רק תצוגה. המחיר שנגבה בפועל נקבע ב-Grow.
     ============================================================ */
  var PAY_URL      = 'https://pay.grow.link/ODg3NjU~f71d834055b0cbdc3955f5df7ac1a33d-NDAxNDU4MQ';
  var LAUNCH_START = '2026-09-20T00:00:00+03:00';
  var LAUNCH_END   = '2026-09-28T23:59:59+03:00';   // יום שני, 12 בלילה
  var PRICE_LAUNCH = 119;
  var PRICE_FULL   = 169;

  /* ---------- קישור תשלום ---------- */
  if (PAY_URL && PAY_URL !== '#pricing') {
    document.querySelectorAll('.js-pay').forEach(function(a){
      a.href = PAY_URL;
      a.target = '_blank';
      a.rel = 'noopener';
    });
  }

  /* ---------- מצב מחיר לפי תאריך ---------- */
  var datesSet = LAUNCH_START.indexOf('XX') === -1 && LAUNCH_END.indexOf('XX') === -1;
  var inLaunch = true;
  if (datesSet) {
    var now = Date.now();
    var start = Date.parse(LAUNCH_START), end = Date.parse(LAUNCH_END);
    inLaunch = !isNaN(start) && !isNaN(end) && now >= start && now <= end;
  }
  var price = inLaunch ? PRICE_LAUNCH : PRICE_FULL;
  document.querySelectorAll('[data-price-now]').forEach(function(el){ el.textContent = price; });
  document.querySelectorAll('[data-launch-only]').forEach(function(el){ el.hidden = !inLaunch; });

  /* ---------- ספירת ימים לסיום ההשקה (בכפתור הצף) ---------- */
  var countdown = document.getElementById('launch-countdown');
  if (countdown && inLaunch && datesSet) {
    var dayOf = function(t){
      return Date.parse(new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Jerusalem'}).format(t));
    };
    var daysLeft = Math.round((dayOf(Date.parse(LAUNCH_END)) - dayOf(Date.now())) / 864e5);
    countdown.textContent =
      daysLeft <= 0 ? '🔥 היום האחרון ב-' + PRICE_LAUNCH + ' ₪ · מחר ' + PRICE_FULL + ' ₪' :
      daysLeft === 1 ? '⏳ מחר יום אחרון ב-' + PRICE_LAUNCH + ' ₪ · אחר כך ' + PRICE_FULL + ' ₪' :
      '⏳ עוד ' + (daysLeft === 2 ? 'יומיים' : daysLeft + ' ימים') + ' המחיר עולה ל-' + PRICE_FULL + ' ₪';
    countdown.hidden = false;
  }
  /* ---------- אקורדיונים (סילבוס + FAQ) ---------- */
  function setOpen(item, open){
    item.classList.toggle('open', open);
    var btn = item.querySelector('.acc-btn');
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  document.querySelectorAll('.acc-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      var item = btn.closest('.acc-item');
      setOpen(item, !item.classList.contains('open'));
    });
  });
  /* קישור "פירוט בשאלות הנפוצות" — מגלגל ופותח את שאלת העלויות */
  document.querySelectorAll('.js-open-faq').forEach(function(a){
    a.addEventListener('click', function(){
      var item = document.getElementById('faq-cost');
      if (item) setOpen(item, true);
    });
  });

  /* ---------- המלצות נוספות ---------- */
  var moreBtn = document.getElementById('testimonials-more-btn');
  var extra = document.getElementById('testimonials-extra');
  if (moreBtn && extra) {
    moreBtn.addEventListener('click', function(){
      var open = extra.classList.toggle('open');
      moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      moreBtn.textContent = open ? 'להסתרת ההמלצות הנוספות −' : 'להמלצות נוספות +';
    });
  }

  /* ---------- וידאו: טעינת הנגן רק בלחיצה ---------- */
  document.querySelectorAll('.video-facade').forEach(function(facade){
    facade.addEventListener('click', function(){
      var id = facade.getAttribute('data-vimeo-id');
      if (!id) return;
      var iframe = document.createElement('iframe');
      iframe.src = 'https://player.vimeo.com/video/' + id + '?autoplay=1&dnt=1&title=0&byline=0&portrait=0&playsinline=1';
      iframe.allow = 'autoplay; fullscreen; picture-in-picture';
      iframe.allowFullscreen = true;
      iframe.title = facade.getAttribute('aria-label') || 'נגן וידאו';
      facade.replaceWith(iframe);
    });
  });

  /* ---------- Sticky CTA במובייל ---------- */
  var sticky = document.getElementById('sticky-cta');
    var pricing = document.getElementById('pricing');
  if (sticky && pricing && 'IntersectionObserver' in window) {
    var pricingVisible = false;
    var update = function(){
      var show = !pricingVisible && window.innerWidth < 768;
      sticky.classList.toggle('show', show);
      sticky.setAttribute('aria-hidden', show ? 'false' : 'true');
      sticky.querySelector('a').tabIndex = show ? 0 : -1;
    };
    new IntersectionObserver(function(entries){
      pricingVisible = entries[0].isIntersecting;
      update();
    }, {threshold: 0.05}).observe(pricing);
    window.addEventListener('resize', update);
  }

  /* ---------- Reveal עדין בגלילה ---------- */
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, {rootMargin: '0px 0px -8% 0px', threshold: 0.05});
    revealEls.forEach(function(el){ io.observe(el); });
    setTimeout(function(){
      revealEls.forEach(function(el){ el.classList.add('in'); });
    }, 2500);
  } else {
    revealEls.forEach(function(el){ el.classList.add('in'); });
  }

  /* ---------- מעקב CTA (Meta Pixel + GA4) ---------- */
  function trackCTA(name){
    if (typeof fbq === 'function') fbq('track', 'InitiateCheckout', {content_name: 'backgrounds-' + name});
    if (typeof gtag === 'function') gtag('event', 'begin_checkout', {content_name: 'backgrounds-' + name});
  }
  document.querySelectorAll('[data-track-cta]').forEach(function(el){
    el.addEventListener('click', function(){
      trackCTA(el.getAttribute('data-track-cta'));
    });
  });
})();
