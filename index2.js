/* Ronig.ai — index2 (גרסת ניסוי) */
(function(){
  'use strict';

  /* ---------- תפריט מובייל ---------- */
  var menuBtn = document.querySelector('.menu-toggle');
  var mobileMenu = document.getElementById('mobile-menu');
  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener('click', function(){
      var open = mobileMenu.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      menuBtn.setAttribute('aria-label', open ? 'סגירת תפריט' : 'פתיחת תפריט');
    });
    mobileMenu.addEventListener('click', function(e){
      if (e.target.tagName === 'A') {
        mobileMenu.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------- אקורדיונים (סילבוס + FAQ) ---------- */
  document.querySelectorAll('.acc-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      var item = btn.closest('.acc-item');
      var open = item.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
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
      iframe.src = 'https://player.vimeo.com/video/' + id + '?autoplay=1&dnt=1&title=0&byline=0&portrait=0';
      iframe.allow = 'autoplay; fullscreen; picture-in-picture';
      iframe.allowFullscreen = true;
      iframe.title = facade.getAttribute('aria-label') || 'נגן וידאו';
      facade.replaceWith(iframe);
    });
  });

  /* ---------- Sticky CTA במובייל ---------- */
  var sticky = document.getElementById('sticky-cta');
  var hero = document.querySelector('.hero');
  var pricing = document.getElementById('pricing');
  if (sticky && hero && pricing && 'IntersectionObserver' in window) {
    var pastHero = false, pricingVisible = false;
    var update = function(){
      var show = pastHero && !pricingVisible && window.innerWidth < 768;
      sticky.classList.toggle('show', show);
      sticky.setAttribute('aria-hidden', show ? 'false' : 'true');
      sticky.querySelector('a').tabIndex = show ? 0 : -1;
    };
    new IntersectionObserver(function(entries){
      pastHero = !entries[0].isIntersecting;
      update();
    }, {rootMargin: '-80px 0px 0px 0px'}).observe(hero);
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
    /* רשת ביטחון: אם משהו מונע מה-Observer לפעול, התוכן נחשף בכל מקרה */
    setTimeout(function(){
      revealEls.forEach(function(el){ el.classList.add('in'); });
    }, 2500);
  } else {
    revealEls.forEach(function(el){ el.classList.add('in'); });
  }

  /* ---------- מעקב CTA (Meta Pixel + GA4) — זהה לדף הראשי ---------- */
  function trackCTA(name){
    if (typeof fbq === 'function') fbq('track', 'InitiateCheckout', {content_name: name});
    if (typeof gtag === 'function') gtag('event', 'begin_checkout', {content_name: name});
  }
  document.querySelectorAll('[data-track-cta]').forEach(function(el){
    el.addEventListener('click', function(){
      trackCTA(el.getAttribute('data-track-cta'));
    });
  });
})();
