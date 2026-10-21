/* Site interactions. Plain JS, no dependencies.
   Everything here is an enhancement: the page reads fine without it.

   One idea runs through every detail: things appear the way a masked diffusion model
   writes. Units (word pieces, photo tiles, figure tiles, nav segments, even the tab title
   and the favicon) start masked and unmask in random order, with the unmasked share
   following the cosine schedule of MaskGIT-style decoders. */
(() => {
  'use strict';

  const root = document.documentElement;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const plainClick = (e) => e.button === 0 && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);

  /* ── The schedule ───────────────────────────────────── */
  const shuffled = (n) => {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const unmaskedAfter = (step, steps, n) =>
    step >= steps ? n : Math.round(n * (1 - Math.cos((Math.PI / 2) * (step / steps))));

  // Reveal n units in random order over `steps` steps: reveal(i) is called for each unit
  // as the cosine schedule lets it through. Returns a function that cancels the rest.
  function schedule(n, { steps, stepMs, delay = 0 }, reveal, done) {
    const order = shuffled(n);
    let step = 0;
    let shown = 0;
    let timer = 0;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      step += 1;
      const target = unmaskedAfter(step, steps, n);
      for (; shown < target; shown++) reveal(order[shown]);
      if (step < steps) timer = setTimeout(tick, stepMs);
      else if (done) done();
    };
    timer = setTimeout(tick, delay);
    return () => { cancelled = true; clearTimeout(timer); };
  }

  /* ── Toast (only when something needs explaining) and copy ── */
  const toast = $('#toast');
  let toastTimer = 0;
  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2400);
  }
  function selectContents(el) {
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
  // Call from inside a click handler so the clipboard permission applies.
  function copy(text, fallbackEl, confirm) {
    const fail = () => {
      selectContents(fallbackEl);
      showToast(fallbackEl ? 'Copy was blocked. The text is selected, so press ⌘C or Ctrl+C.' : `Copy was blocked: ${text}`);
    };
    if (!navigator.clipboard || !window.isSecureContext) return fail();
    navigator.clipboard.writeText(text).then(confirm, fail);
  }
  // Confirm in place: the control itself turns into a check or a short label for a moment.
  function flashDone(btn, label) {
    if (label) {
      if (btn.__label === undefined) btn.__label = btn.textContent;
      btn.textContent = label;
    }
    btn.classList.add('is-done');
    clearTimeout(btn.__doneTimer);
    btn.__doneTimer = setTimeout(() => {
      btn.classList.remove('is-done');
      if (btn.__label !== undefined) btn.textContent = btn.__label;
    }, 1600);
  }

  /* ── Theme: the new theme is unmasked cell by cell ───── */
  const themeBtn = $('#theme-toggle');
  const themeMeta = $('#theme-color');
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const currentTheme = () => root.getAttribute('data-theme') || (darkQuery.matches ? 'dark' : 'light');

  function syncTheme() {
    const theme = currentTheme();
    if (themeBtn) {
      themeBtn.dataset.mode = theme;
      themeBtn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    }
    if (themeMeta) themeMeta.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim());
  }
  function toggleTheme() {
    const apply = () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (_) { /* storage unavailable */ }
      syncTheme();
    };
    if (reducedMotion || !document.startViewTransition) return apply();
    if (themeBtn) {
      themeBtn.classList.add('is-turning');
      setTimeout(() => themeBtn.classList.remove('is-turning'), 450);
    }
    document.startViewTransition(apply); // style.css masks the new view with a cosine-schedule mosaic
  }
  themeBtn?.addEventListener('click', toggleTheme);
  darkQuery.addEventListener?.('change', syncTheme);
  syncTheme();

  /* ── Decoding text and tiles ────────────────────────── */
  function mask(units) {
    const claim = {};
    units.forEach((u) => {
      u.__decode = claim; // an older decode stops revealing this unit
      u.classList.add('is-masked');
      u.classList.remove('is-fresh');
    });
  }
  function decode(groups, opts) {
    groups = groups.filter((g) => g.length);
    const run = {};
    groups.forEach((g) => g.forEach((u) => {
      u.__decode = run;
      u.classList.add('is-masked');
      u.classList.remove('is-fresh');
    }));
    groups.forEach((g) => schedule(g.length, opts, (i) => {
      const unit = g[i];
      if (unit.__decode !== run) return;
      unit.classList.remove('is-masked');
      unit.classList.add('is-fresh');
    }));
  }

  const introTokens = $$('#about .tok');
  const tiles = $$('#photo-tiles .ptile');
  const INTRO = { steps: 14, stepMs: 80, delay: 220 };
  const TITLE = { steps: 7, stepMs: 60, delay: 40 };
  const decodeIntro = (delay = INTRO.delay) => decode([introTokens, tiles], { ...INTRO, delay });

  // The browser tab decodes along with the page: its title and its icon.
  function decodeTabTitle() {
    const final = document.title;
    const chars = Array.from(final);
    const slots = chars.map((c, i) => (c.trim() ? i : -1)).filter((i) => i >= 0);
    const shown = chars.map((c) => (c.trim() ? '▒' : c));
    document.title = shown.join('');
    schedule(slots.length, INTRO, (k) => {
      shown[slots[k]] = chars[slots[k]];
      document.title = shown.join('');
    }, () => { document.title = final; });
  }
  function decodeFavicon() {
    const link = $('link[rel="icon"]');
    const canvas = document.createElement('canvas');
    const g = canvas.getContext && canvas.getContext('2d');
    if (!link || !g) return;
    const original = link.getAttribute('href');
    canvas.width = canvas.height = 64;
    // Same drawing as assets/favicon.svg; every bar starts as a mask.
    const MASK = '#3A4254';
    const bars = [
      { x: 11, y: 20, w: 24, color: '#93A6FF' },
      { x: 39, y: 20, w: 14, color: MASK },
      { x: 11, y: 34, w: 14, color: MASK },
      { x: 29, y: 34, w: 24, color: '#E8EBF1' },
    ];
    const done = new Set();
    const box = (x, y, w, h, r) => {
      g.beginPath();
      if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
      g.fill();
    };
    const draw = () => {
      g.clearRect(0, 0, 64, 64);
      g.fillStyle = '#0E1116';
      box(0, 0, 64, 64, 15);
      bars.forEach((b, i) => { g.fillStyle = done.has(i) ? b.color : MASK; box(b.x, b.y, b.w, 10, 3); });
      link.setAttribute('href', canvas.toDataURL('image/png'));
    };
    draw();
    schedule(bars.length, INTRO, (i) => { done.add(i); draw(); }, () => {
      setTimeout(() => link.setAttribute('href', original), 300);
    });
  }

  if (root.getAttribute('data-intro-masked') === 'true') {
    window.__decodeStarted = true;
    const units = [...introTokens, ...tiles];
    if (reducedMotion) {
      units.forEach((u) => u.classList.remove('is-masked'));
    } else if (document.hidden) {
      // Loaded out of sight (a background tab or a hidden pane): show the finished page,
      // then play the decode the first time it actually comes into view.
      units.forEach((u) => u.classList.remove('is-masked'));
      const onVisible = () => {
        if (document.hidden) return;
        document.removeEventListener('visibilitychange', onVisible);
        if (window.scrollY < window.innerHeight * 0.6) decodeIntro();
      };
      document.addEventListener('visibilitychange', onVisible);
    } else {
      const img = $('#photo img');
      const loaded = img && !img.complete
        ? new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        })
        : Promise.resolve();
      Promise.race([loaded, new Promise((r) => setTimeout(r, 1200))]).then(() => {
        decodeIntro();
        decodeTabTitle();
        decodeFavicon();
      });
    }
  }

  // Section titles decode the first time they scroll into view.
  const titleTokens = (title) => {
    if (!$('.tok', title) && typeof window.__tokenize === 'function') window.__tokenize(title);
    return $$('.tok', title);
  };
  let titleObserver = null;
  if (!reducedMotion && typeof window.__tokenize === 'function' && 'IntersectionObserver' in window) {
    const fold = window.innerHeight;
    titleObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        titleObserver.unobserve(entry.target);
        decode([titleTokens(entry.target)], TITLE);
      });
    }, { rootMargin: '0px 0px -12% 0px' });
    $$('[data-decode="view"]').forEach((el) => {
      if (el.getBoundingClientRect().top < fold) return;
      mask(titleTokens(el));
      titleObserver.observe(el);
    });
  }

  /* ── Header: scrolled state, back-to-top, mobile menu ── */
  const header = $('.site-header');
  const menuBtn = $('#menu-toggle');
  const toTop = $('#to-top');
  let scrollTicking = false;
  const onScroll = () => {
    const y = window.scrollY;
    header?.classList.toggle('is-scrolled', y > 8);
    toTop?.classList.toggle('is-visible', y > 700);
    scrollTicking = false;
  };
  window.addEventListener('scroll', () => {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(onScroll);
  }, { passive: true });
  onScroll();

  function setMenu(open) {
    if (!header || !menuBtn) return;
    header.classList.toggle('is-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  menuBtn?.addEventListener('click', () => setMenu(!header.classList.contains('is-open')));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
  document.addEventListener('click', (e) => {
    if (header?.classList.contains('is-open') && !header.contains(e.target)) setMenu(false);
  });

  /* ── Nav: each item carries a five-segment token ─────── */
  const navLinks = $$('.nav a[href^="#"]');
  navLinks.forEach((a) => {
    const token = document.createElement('span');
    token.className = 'nav-token';
    token.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 5; i++) token.appendChild(document.createElement('i'));
    a.appendChild(token);
  });
  const linkFor = (id) => navLinks.find((a) => a.hash.slice(1) === id) || null;
  let currentId = null;
  let spyPausedUntil = 0;

  // Segments switch on (or off) in random order, five steps of 45 ms.
  function setToken(link, on) {
    if (!link) return;
    const segs = $$('.nav-token i', link);
    link.__tokenRun?.();
    if (reducedMotion) { segs.forEach((s) => s.classList.toggle('is-on', on)); return; }
    link.__tokenRun = schedule(segs.length, { steps: 5, stepMs: 45 }, (i) => segs[i].classList.toggle('is-on', on));
  }
  function setCurrent(id) {
    if (id === currentId) return;
    const prev = linkFor(currentId);
    const next = linkFor(id);
    currentId = id;
    navLinks.forEach((a) => {
      if (a === next) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
    setToken(prev, false);
    setToken(next, true);
  }

  // The current section is the one crossing a band at 40–45% of the viewport height.
  const sections = $$('main > section[id]');
  const navIds = new Set(navLinks.map((a) => a.hash.slice(1)));
  const setCurrentSection = (id) => setCurrent(navIds.has(id) ? id : null);
  function spyNow() {
    const h = window.innerHeight;
    const hit = sections.find((s) => {
      const r = s.getBoundingClientRect();
      return r.top < h * 0.45 && r.bottom > h * 0.4;
    });
    if (hit) setCurrentSection(hit.id);
  }
  if ('IntersectionObserver' in window) {
    const spy = new IntersectionObserver((entries) => {
      if (performance.now() < spyPausedUntil) return;
      entries.forEach((entry) => { if (entry.isIntersecting) setCurrentSection(entry.target.id); });
    }, { rootMargin: '-40% 0px -55% 0px' });
    sections.forEach((section) => spy.observe(section));
  }

  /* ── Jumping: the menu token flies to the title it opens ──
     The page scrolls on an ease-in-out curve while the token, split into one piece per
     word piece of the destination title, travels to where that title will be. The pieces
     land on the title's masks the moment the scroll ends, and the title decodes. */
  let scrollRaf = 0;
  let scrollDone = null;
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const EASE_IN_OUT_CUBIC = 'cubic-bezier(0.65, 0, 0.35, 1)'; // the same curve, for WAAPI

  function stopScroll() {
    if (!scrollRaf) return;
    cancelAnimationFrame(scrollRaf);
    scrollRaf = 0;
    root.style.scrollBehavior = '';
    const done = scrollDone;
    scrollDone = null;
    if (done) done(false);
  }
  // Resolves true when the scroll arrives, false when something interrupts it.
  function animateScroll(toY, duration) {
    stopScroll();
    root.style.scrollBehavior = 'auto'; // CSS smooth scrolling would fight every frame
    if (duration <= 0) {
      window.scrollTo(0, toY);
      root.style.scrollBehavior = '';
      return Promise.resolve(true);
    }
    const fromY = window.scrollY;
    return new Promise((resolve) => {
      scrollDone = resolve;
      const start = performance.now();
      const frame = (now) => {
        const t = Math.min(1, (now - start) / duration);
        window.scrollTo(0, fromY + (toY - fromY) * easeInOutCubic(t));
        if (t < 1) { scrollRaf = requestAnimationFrame(frame); return; }
        scrollRaf = 0;
        scrollDone = null;
        root.style.scrollBehavior = '';
        resolve(true);
      };
      scrollRaf = requestAnimationFrame(frame);
    });
  }
  const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
  window.addEventListener('wheel', stopScroll, { passive: true });
  window.addEventListener('touchstart', stopScroll, { passive: true });
  window.addEventListener('keydown', (e) => { if (SCROLL_KEYS.has(e.key)) stopScroll(); });

  const scrollTargetY = (el) => {
    const padding = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
    const maxY = root.scrollHeight - window.innerHeight;
    return Math.round(clamp(window.scrollY + el.getBoundingClientRect().top - padding, 0, maxY));
  };
  const scrollDuration = (toY) => (reducedMotion ? 0 : clamp(Math.abs(toY - window.scrollY) * 0.3, 460, 900));
  const rectOf = (el) => {
    const r = el ? el.getBoundingClientRect() : null;
    return r && r.width && r.height ? r : null;
  };

  // Where the masks on the title's first line will sit in the viewport once the page is
  // at destY. Read from each token's ::after, so the pieces land exactly on the masks.
  function landingBoxes(title, destY) {
    const toks = $$('.tok', title);
    if (!toks.length) return [];
    const dy = destY - window.scrollY;
    const first = toks[0].getBoundingClientRect();
    return toks
      .map((t) => ({ t, r: t.getBoundingClientRect() }))
      .filter(({ r }) => {
        const mid = (r.top + r.bottom) / 2;
        return mid > first.top && mid < first.bottom;
      })
      .map(({ t, r }) => {
        const cs = getComputedStyle(t, '::after');
        const top = parseFloat(cs.top) || 0;
        const right = parseFloat(cs.right) || 0;
        const bottom = parseFloat(cs.bottom) || 0;
        const left = parseFloat(cs.left) || 0;
        return {
          left: r.left + left,
          top: r.top - dy + top,
          width: Math.max(2, r.width - left - right),
          height: Math.max(2, r.height - top - bottom),
          radius: parseFloat(cs.borderTopLeftRadius) || 2,
        };
      });
  }

  function launch(from, boxes, duration) {
    const color = getComputedStyle(root).getPropertyValue('--mask').trim();
    const n = boxes.length;
    const gap = n > 1 ? Math.min(2, (from.width * 0.25) / (n - 1)) : 0; // pieces stay within the source
    const w = (from.width - gap * (n - 1)) / n;
    return boxes.map((to, i) => {
      const el = document.createElement('div');
      el.className = 'flier';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
      const delay = Math.min(i * 24, duration * 0.2); // peel off left to right, land together
      const anim = el.animate([
        { left: `${from.left + i * (w + gap)}px`, top: `${from.top}px`, width: `${w}px`, height: `${from.height}px`, borderRadius: '1px' },
        { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, borderRadius: `${to.radius}px`, backgroundColor: color },
      ], { duration: duration - delay, delay, easing: EASE_IN_OUT_CUBIC, fill: 'both' });
      return { el, anim };
    });
  }
  function dissolve(flight, ms) {
    flight.forEach(({ el, anim }) => {
      anim.pause();
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'ease-out', fill: 'forwards' })
        .onfinish = () => el.remove();
    });
  }

  let activeJump = null;
  function jumpTo(section, from) {
    if (!section) return;
    const id = section.id;
    const destY = scrollTargetY(section);
    const duration = scrollDuration(destY);
    if (linkFor(id)) setCurrent(id);
    // The top needs no hash, so a reload from there plays the intro again.
    history.replaceState?.(null, '', id === 'about' ? location.pathname + location.search : `#${id}`);
    if (reducedMotion) { animateScroll(destY, 0); return; }

    const jump = {};
    activeJump = jump;
    spyPausedUntil = Infinity;

    const isIntro = id === 'about';
    const title = isIntro ? $('#name') : $('[data-decode="view"]', section);
    if (title && !isIntro) titleObserver?.unobserve(title); // it decodes on landing instead
    const groups = isIntro ? [introTokens, tiles] : title ? [titleTokens(title)] : [];
    mask(groups.flat());
    groups.flat().forEach((u) => { u.__jump = jump; });

    const boxes = from && title ? landingBoxes(title, destY) : [];
    const flight = boxes.length ? launch(from, boxes, duration) : [];

    animateScroll(destY, duration).then((arrived) => {
      if (activeJump === jump) {
        activeJump = null;
        spyPausedUntil = performance.now() + 150; // let the last scroll's observer entries pass
        if (!arrived) setTimeout(spyNow, 160); // stopped short: mark where the page actually is
      }
      dissolve(flight, arrived ? 200 : 120);
      // Decode whatever a newer jump has not claimed in the meantime.
      const mine = groups.map((g) => g.filter((u) => u.__jump === jump));
      decode(mine, isIntro ? { ...INTRO, delay: 60 } : TITLE);
    });
  }

  navLinks.forEach((a) => a.addEventListener('click', (e) => {
    const section = document.getElementById(a.hash.slice(1));
    if (!section || !plainClick(e)) return;
    e.preventDefault();
    const from = rectOf($('.nav-token', a)); // measured before the mobile menu closes
    setMenu(false);
    jumpTo(section, from);
  }));
  $('.wordmark')?.addEventListener('click', (e) => {
    if (!plainClick(e)) return;
    e.preventDefault();
    jumpTo($('#about'), rectOf($('.wordmark .mk-a'))); // the mark's accent bar flies to the name
  });
  if (toTop) {
    toTop.hidden = false;
    toTop.addEventListener('click', () => animateScroll(0, scrollDuration(0)));
  }

  /* ── Section anchors: a quiet "#" that copies a link to the section ── */
  $$('main > section[id] h2.section-title').forEach((h2) => {
    const id = h2.closest('section').id;
    const a = document.createElement('a');
    a.className = 'anchor';
    a.href = `#${id}`;
    a.textContent = '#';
    a.title = 'Copy link';
    a.setAttribute('aria-label', `Copy a link to ${h2.textContent.trim()}`);
    a.addEventListener('click', (e) => {
      e.preventDefault();
      copy(`${location.origin}${location.pathname}#${id}`, null, () => flashDone(a, '✓'));
    });
    h2.appendChild(a);
  });

  /* ── Thumbnails: on hover the second figure decodes tile by tile, through noise ── */
  const T_COLS = 8;
  const T_ROWS = 5; // on a 16:10 box, 8 × 5 gives square tiles

  // Where an <img> with object-fit, object-position and padding draws inside its box.
  function fitBox(img, W, H) {
    const cs = getComputedStyle(img);
    const pl = parseFloat(cs.paddingLeft) || 0;
    const pt = parseFloat(cs.paddingTop) || 0;
    const cw = W - pl - (parseFloat(cs.paddingRight) || 0);
    const ch = H - pt - (parseFloat(cs.paddingBottom) || 0);
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const scale = cs.objectFit === 'contain' ? Math.min(cw / iw, ch / ih) : Math.max(cw / iw, ch / ih);
    const rw = iw * scale;
    const rh = ih * scale;
    const at = (v, free) => (v.endsWith('%') ? (parseFloat(v) / 100) * free : parseFloat(v) || 0);
    const [px = '50%', py = '50%'] = cs.objectPosition.split(' ');
    return { rw, rh, ox: pl + at(px, cw - rw), oy: pt + at(py, ch - rh) };
  }

  if (finePointer && !reducedMotion) {
    $$('a.pub-thumb').forEach((thumb) => {
      const alt = $('.thumb-alt', thumb);
      if (!alt) return;
      const pub = thumb.closest('.pub') || thumb;
      const grid = document.createElement('span');
      grid.className = 'thumb-tiles';
      grid.setAttribute('aria-hidden', 'true');
      grid.style.setProperty('--cols', T_COLS);
      grid.style.setProperty('--rows', T_ROWS);
      grid.style.setProperty('--img', `url("${alt.src}")`);
      const cells = Array.from({ length: T_COLS * T_ROWS }, () => {
        const c = document.createElement('span');
        c.className = 'tile';
        c.style.setProperty('--d', `${(-Math.random() * 0.36).toFixed(2)}s`); // desync the static
        return grid.appendChild(c);
      });
      thumb.appendChild(grid);
      thumb.classList.add('has-tiles');

      const ready = () => alt.complete && alt.naturalWidth > 0;
      let laidOut = '';
      const layout = () => {
        const W = thumb.clientWidth;
        const H = thumb.clientHeight;
        if (!W || !H || !ready() || laidOut === `${W}x${H}`) return;
        laidOut = `${W}x${H}`;
        const box = fitBox(alt, W, H);
        cells.forEach((c, i) => {
          c.style.setProperty('--bs', `${box.rw}px ${box.rh}px`);
          c.style.setProperty('--bp', `${box.ox - (i % T_COLS) * (W / T_COLS)}px ${box.oy - Math.floor(i / T_COLS) * (H / T_ROWS)}px`);
        });
      };

      let cancel = null;
      const swap = (toB) => {
        if (cancel) cancel();
        const timers = new Set();
        const stop = schedule(cells.length, { steps: 8, stepMs: 34 }, (i) => {
          const c = cells[i];
          if (c.classList.contains('is-b') === toB) return;
          c.classList.add('is-noise');
          const t = setTimeout(() => {
            timers.delete(t);
            c.classList.remove('is-noise');
            c.classList.toggle('is-b', toB);
          }, 90);
          timers.add(t);
        });
        cancel = () => {
          stop();
          timers.forEach(clearTimeout);
          cells.forEach((c) => c.classList.remove('is-noise'));
        };
      };

      let hovering = false;
      pub.addEventListener('pointerenter', () => {
        hovering = true;
        if (!ready()) return;
        layout();
        swap(true);
      });
      pub.addEventListener('pointerleave', () => {
        hovering = false;
        swap(false);
      });
      alt.addEventListener('load', () => {
        layout();
        if (hovering) swap(true);
      });
      window.addEventListener('resize', () => { laidOut = ''; layout(); }, { passive: true });
      layout();
    });
  }

  /* ── Thumbnails fade in once their figure has loaded ── */
  $$('.pub-thumb img:not(.thumb-alt)').forEach((img) => {
    if (img.complete) return;
    img.classList.add('is-loading');
    const done = () => img.classList.remove('is-loading');
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
  });

  /* ── TL;DR and BibTeX panels ────────────────────────── */
  $$('.toggle-btn').forEach((btn) => {
    const panel = document.getElementById(btn.getAttribute('aria-controls'));
    if (!panel) return;
    btn.hidden = false;
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      panel.hidden = open;
    });
  });
  $$('.bib-copy').forEach((btn) => btn.addEventListener('click', () => {
    const code = btn.closest('.bib')?.querySelector('code');
    if (code) copy(code.textContent.trim(), code, () => flashDone(btn, 'Copied'));
  }));

  /* ── Figure viewer: every paper figure, browsable with ← → ── */
  const viewer = $('#viewer');
  const viewerImg = $('#viewer-img');
  const viewerCaption = $('#viewer-caption');
  const viewerCount = $('#viewer-count');
  const clickedInside = (dialog, e) => {
    const box = dialog.getBoundingClientRect();
    return e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom;
  };
  if (viewer && typeof viewer.showModal === 'function') {
    const figures = [];
    const firstIndex = new Map();
    $$('a[data-figure]').forEach((link) => {
      const thumb = $('img', link);
      firstIndex.set(link, figures.length);
      figures.push({ src: link.getAttribute('href'), alt: thumb ? thumb.alt : '', caption: link.dataset.caption || '' });
      if (link.dataset.alt) figures.push({ src: link.dataset.alt, alt: '', caption: link.dataset.altCaption || '' });
    });
    let current = 0;
    const show = (i) => {
      current = (i + figures.length) % figures.length;
      const fig = figures[current];
      viewerImg.src = fig.src;
      viewerImg.alt = fig.alt || fig.caption;
      viewerCaption.textContent = fig.caption;
      if (viewerCount) viewerCount.textContent = `${current + 1} / ${figures.length}`;
    };
    $$('a[data-figure]').forEach((link) => {
      link.addEventListener('click', (e) => {
        if (!plainClick(e)) return;
        e.preventDefault();
        show(firstIndex.get(link));
        viewer.showModal();
      });
    });
    $('#viewer-prev')?.addEventListener('click', () => show(current - 1));
    $('#viewer-next')?.addEventListener('click', () => show(current + 1));
    $('#viewer-close')?.addEventListener('click', () => viewer.close());
    viewer.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(current - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); show(current + 1); }
    });
    viewer.addEventListener('click', (e) => { if (!clickedInside(viewer, e)) viewer.close(); });
  }

  /* ── Email: assembled here to keep it away from scrapers ── */
  let emailAddress = '';
  let emailText = null;
  $$('[data-u][data-d]').forEach((link) => {
    emailAddress = `${link.dataset.u}@${link.dataset.d}`;
    link.href = `mailto:${emailAddress}`;
    emailText = $('.email-text', link);
    if (emailText) emailText.textContent = emailAddress;
    const copyBtn = $('[data-copy-email]', link.parentElement);
    if (copyBtn) {
      copyBtn.hidden = false;
      copyBtn.addEventListener('click', () => copy(emailAddress, emailText, () => flashDone(copyBtn)));
    }
  });

  /* ── Seoul time in the footer ───────────────────────── */
  const clock = $('#clock');
  const clockTime = $('#seoul-time');
  if (clock && clockTime && window.Intl) {
    try {
      const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      const tick = () => { clockTime.textContent = fmt.format(new Date()); };
      tick();
      setInterval(tick, 20000);
      clock.hidden = false;
    } catch (_) { /* time zone data unavailable */ }
  }

  /* ── Search (⌘K, Ctrl K or /) ───────────────────────── */
  const palette = $('#palette');
  const paletteInput = $('#palette-input');
  const paletteList = $('#palette-list');
  const searchBtn = $('#search-open');
  const flash = (el) => {
    el.classList.add('is-flash');
    setTimeout(() => el.classList.remove('is-flash'), 1400);
  };

  if (palette && typeof palette.showModal === 'function' && paletteInput && paletteList) {
    const items = [];
    $$('main > section[id]').forEach((section) => {
      const heading = $('h2 [data-decode]', section) || $('h2', section);
      const label = section.id === 'about' ? 'About' : heading?.textContent.trim();
      if (!label) return;
      items.push({
        type: 'Section',
        label,
        run: () => {
          const link = linkFor(section.id);
          jumpTo(section, link ? rectOf($('.nav-token', link)) : null);
        },
      });
    });
    $$('.pub').forEach((pub) => {
      const title = $('.pub-title', pub)?.textContent.trim();
      if (!title) return;
      items.push({
        type: 'Paper',
        label: title,
        run: () => {
          const y = scrollTargetY(pub);
          animateScroll(y, scrollDuration(y)).then(() => flash(pub));
        },
      });
    });
    if (emailAddress) {
      items.push({ type: 'Contact', label: `Copy email address (${emailAddress})`, run: () => copy(emailAddress, emailText, () => showToast('Email address copied')) });
    }
    $$('.links a[href^="http"]').forEach((a) => {
      items.push({ type: 'Link', label: a.textContent.trim(), run: () => window.open(a.href, '_blank', 'noopener') });
    });
    items.push({ type: 'Action', label: 'Switch between light and dark theme', run: toggleTheme });

    let results = items;
    let active = 0;
    const sync = () => {
      $$('.palette-item', paletteList).forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
      const current = $(`#palette-opt-${active}`);
      if (current) {
        paletteInput.setAttribute('aria-activedescendant', current.id);
        current.scrollIntoView({ block: 'nearest' });
      }
    };
    const choose = (i) => {
      const it = results[i];
      if (!it) return;
      palette.close();
      it.run();
    };
    const render = () => {
      const q = paletteInput.value.trim().toLowerCase();
      results = q ? items.filter((it) => `${it.type} ${it.label}`.toLowerCase().includes(q)) : items;
      active = Math.min(active, Math.max(results.length - 1, 0));
      paletteList.textContent = '';
      if (!results.length) {
        const empty = document.createElement('li');
        empty.className = 'palette-empty';
        empty.textContent = `No matches for “${paletteInput.value.trim()}”.`;
        paletteList.appendChild(empty);
        paletteInput.removeAttribute('aria-activedescendant');
        return;
      }
      results.forEach((it, i) => {
        const li = document.createElement('li');
        li.className = 'palette-item';
        li.id = `palette-opt-${i}`;
        li.setAttribute('role', 'option');
        const type = document.createElement('span');
        type.className = 'palette-type';
        type.textContent = it.type;
        const label = document.createElement('span');
        label.className = 'palette-label';
        label.textContent = it.label;
        li.append(type, label);
        li.addEventListener('mousemove', () => { if (active !== i) { active = i; sync(); } });
        li.addEventListener('click', () => choose(i));
        paletteList.appendChild(li);
      });
      sync();
    };
    const openPalette = () => {
      if (palette.open) return;
      paletteInput.value = '';
      active = 0;
      render();
      palette.showModal();
      paletteInput.focus();
    };
    paletteInput.addEventListener('input', () => { active = 0; render(); });
    paletteInput.addEventListener('keydown', (e) => {
      const n = Math.max(results.length, 1);
      if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % n; sync(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + n) % n; sync(); }
      else if (e.key === 'Enter') { e.preventDefault(); choose(active); }
    });
    palette.addEventListener('click', (e) => { if (!clickedInside(palette, e)) palette.close(); });
    document.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName || '';
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || document.activeElement?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
      else if (e.key === '/' && !typing && !viewer?.open) { e.preventDefault(); openPalette(); }
    });
    if (searchBtn) {
      searchBtn.hidden = false;
      if (!/Mac|iPhone|iPad/.test(navigator.platform)) {
        searchBtn.title = 'Search (Ctrl K)';
        searchBtn.setAttribute('aria-label', 'Search the page (Ctrl K)');
      }
      searchBtn.addEventListener('click', openPalette);
    }
  }
})();
