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
    document.dispatchEvent(new Event('themechange')); // canvas drawings pick up the new colors
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
  const decodeIntro = (delay = INTRO.delay) => {
    decode([introTokens, tiles], { ...INTRO, delay });
    field?.decode({ ...INTRO, delay });
  };

  /* ── The field behind the photo ─────────────────────────
     Dots sit on the photo's own 8 × 8 tile grid, extended outward, and each carries a fixed
     Gaussian noise vector ε: a dot is drawn at x₀ + σ(1 − a)·ε for a signal level a. At rest
     the field is partly noisy (a = 0.7). It denoises in the same steps as the intro, and
     around the cursor it denoises fully, as if the pointer were the denoiser. It redraws only
     when something changes, so an idle page costs nothing. */
  const field = (() => {
    const intro = $('#about');
    const photo = $('#photo');
    const text = $('.intro-text');
    const canvas = document.createElement('canvas');
    const g = canvas.getContext && canvas.getContext('2d');
    if (!intro || !photo || !text || !g) return null;
    canvas.className = 'field';
    canvas.setAttribute('aria-hidden', 'true');
    intro.prepend(canvas);

    const REST = 0.7;
    const smoothstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
    // One seeded generator per grid point, so a resize keeps every dot's noise.
    const seeded = (seed) => () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

    const masked = root.getAttribute('data-intro-masked') === 'true' && !reducedMotion && !document.hidden;
    let level = masked ? 0 : REST; // drawn signal level, eased toward target
    let target = level;
    let decoding = false;
    let stepTimer = 0;
    let dots = [];
    let cell = 25;
    let area = { x: 0, y: 0, w: 0, h: 0 };
    let color = '';
    const lens = { x: 0, y: 0, tx: 0, ty: 0, k: 0, kt: 0 };
    let raf = 0;
    let last = 0;

    function layout() {
      const ir = intro.getBoundingClientRect();
      const pr = photo.getBoundingClientRect();
      const tr = text.getBoundingClientRect();
      if (!pr.width) return;
      cell = pr.width / 8;
      const P = { l: pr.left - ir.left, t: pr.top - ir.top, r: pr.right - ir.left, b: pr.bottom - ir.top };
      const stacked = tr.top >= pr.bottom - 1; // phones: the photo sits above the text
      // Keep clear of the text: right of it on wide screens, above the name on phones.
      const x0 = stacked ? 0 : tr.right - ir.left + cell * 0.5;
      area = { x: x0, y: 0, w: ir.width - x0, h: stacked ? Math.min(ir.height, P.b + cell * 0.8) : ir.height };
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      Object.assign(canvas.style, { left: `${area.x}px`, top: `${area.y}px`, width: `${area.w}px`, height: `${area.h}px` });
      canvas.width = Math.max(1, Math.round(area.w * dpr));
      canvas.height = Math.max(1, Math.round(area.h * dpr));
      g.setTransform(dpr, 0, 0, dpr, -area.x * dpr, -area.y * dpr); // draw in intro coordinates

      const reach = (stacked ? 3.5 : 5.5) * cell;
      const K = Math.ceil(reach / cell);
      dots = [];
      for (let j = -K; j <= 8 + K; j++) {
        for (let i = -K; i <= 8 + K; i++) {
          const x = P.l + i * cell;
          const y = P.t + j * cell;
          const d = Math.hypot(Math.max(P.l - x, 0, x - P.r), Math.max(P.t - y, 0, y - P.b));
          if (d === 0) continue; // under the photo
          let w = 1 - smoothstep(d / reach);
          // fade out toward the side that faces the text
          w *= stacked
            ? 1 - smoothstep((y - (area.y + area.h - cell * 1.5)) / (cell * 1.5))
            : smoothstep((x - area.x) / (cell * 1.5));
          if (w < 0.02) continue;
          const r = seeded((i + 97) * 7919 + (j + 97) * 104729);
          dots.push({ x, y, ex: gauss(r), ey: gauss(r), w });
        }
      }
      color = getComputedStyle(root).getPropertyValue('--field').trim() || color;
      draw();
    }

    function draw() {
      g.clearRect(area.x, area.y, area.w, area.h);
      g.fillStyle = color;
      const sigma = 0.85 * cell;
      const R = 4.5 * cell;
      const size = Math.max(1, cell / 18);
      for (const d of dots) {
        let near = 0;
        if (lens.k > 0.002) {
          const t = 1 - Math.hypot(d.x - lens.x, d.y - lens.y) / R;
          if (t > 0) near = t * t * (3 - 2 * t) * lens.k;
        }
        const off = sigma * (1 - (level + (1 - level) * near));
        g.globalAlpha = d.w * (0.7 + 0.3 * near);
        g.beginPath();
        g.arc(d.x + d.ex * off, d.y + d.ey * off, size * (1 + 0.25 * near), 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }

    function frame(now) {
      const dt = last ? Math.min(now - last, 64) : 16;
      last = now;
      const follow = (tau) => 1 - Math.exp(-dt / tau);
      lens.x += (lens.tx - lens.x) * follow(80);
      lens.y += (lens.ty - lens.y) * follow(80);
      lens.k += (lens.kt - lens.k) * follow(lens.kt ? 160 : 320);
      level += (target - level) * follow(45);
      draw();
      const settled = !decoding
        && Math.abs(target - level) < 0.001
        && Math.abs(lens.kt - lens.k) < 0.002
        && (lens.k < 0.002 || Math.hypot(lens.tx - lens.x, lens.ty - lens.y) < 0.25);
      if (!settled) { raf = requestAnimationFrame(frame); return; }
      raf = 0;
      last = 0;
    }
    const wake = () => { if (!raf) raf = requestAnimationFrame(frame); };

    if (finePointer && !reducedMotion) {
      intro.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch') return;
        const ir = intro.getBoundingClientRect();
        lens.tx = e.clientX - ir.left;
        lens.ty = e.clientY - ir.top;
        if (lens.k < 0.02) { lens.x = lens.tx; lens.y = lens.ty; } // appear where the pointer is
        lens.kt = 1;
        wake();
      }, { passive: true });
      intro.addEventListener('pointerleave', () => { lens.kt = 0; wake(); });
    }
    document.addEventListener('themechange', () => {
      color = getComputedStyle(root).getPropertyValue('--field').trim() || color;
      draw();
    });
    if ('ResizeObserver' in window) new ResizeObserver(layout).observe(intro);
    else window.addEventListener('resize', layout, { passive: true });
    layout();

    return {
      // Back to pure noise, as when the intro is masked again.
      mask() {
        clearTimeout(stepTimer);
        decoding = false;
        level = target = 0;
        draw();
      },
      // Denoise to rest in the intro's steps, on the same cosine schedule as its tokens.
      decode({ steps, stepMs, delay = 0 }) {
        clearTimeout(stepTimer);
        level = target = 0;
        decoding = true;
        let step = 0;
        const tick = () => {
          step += 1;
          target = REST * (1 - Math.cos((Math.PI / 2) * (step / steps)));
          if (step < steps) stepTimer = setTimeout(tick, stepMs);
          else decoding = false;
          wake();
        };
        stepTimer = setTimeout(tick, delay);
        draw();
        wake();
      },
    };
  })();

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

  // The current section is the last one whose top has passed a reading line at 40% of the
  // viewport height; once the page is scrolled to the bottom, it is the last section.
  const sections = $$('main > section[id]');
  const navIds = new Set(navLinks.map((a) => a.hash.slice(1)));
  function spyNow() {
    if (!sections.length || performance.now() < spyPausedUntil) return;
    const line = window.innerHeight * 0.4;
    let hit = sections[0];
    if (window.scrollY + window.innerHeight >= root.scrollHeight - 2) hit = sections[sections.length - 1];
    else sections.forEach((s) => { if (s.getBoundingClientRect().top <= line) hit = s; });
    setCurrent(navIds.has(hit.id) ? hit.id : null);
  }
  let spyTicking = false;
  window.addEventListener('scroll', () => {
    if (spyTicking) return;
    spyTicking = true;
    requestAnimationFrame(() => { spyTicking = false; spyNow(); });
  }, { passive: true });
  window.addEventListener('resize', spyNow, { passive: true });
  spyNow();

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
    if (isIntro) field?.mask();

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
      if (isIntro && mine.some((g) => g.length)) field?.decode({ ...INTRO, delay: 60 });
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
      const grid = document.createElement('span');
      grid.className = 'thumb-tiles';
      grid.setAttribute('aria-hidden', 'true');
      grid.style.setProperty('--cols', T_COLS);
      grid.style.setProperty('--rows', T_ROWS);
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
      let url = '';
      // Paint the figure once at the thumbnail's exact pixel size, laid out the way the <img>
      // would be (object-fit, object-position, padding). Tiles then slice it 1:1, so thin chart
      // lines stay as crisp as in the image itself instead of being resampled per tile.
      const layout = () => {
        const W = thumb.clientWidth;
        const H = thumb.clientHeight;
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        if (!W || !H || !ready() || laidOut === `${W}x${H}@${dpr}`) return;
        laidOut = `${W}x${H}@${dpr}`;
        const box = fitBox(alt, W, H);
        const paper = document.createElement('canvas');
        paper.width = Math.round(W * dpr);
        paper.height = Math.round(H * dpr);
        const pg = paper.getContext('2d');
        if (!pg) return;
        // Halve in steps first: one large downscale aliases thin lines even at high quality.
        let src = alt;
        let sw = alt.naturalWidth;
        let sh = alt.naturalHeight;
        while (sw / 2 > box.rw * dpr) {
          const step = document.createElement('canvas');
          step.width = Math.round(sw / 2);
          step.height = Math.round(sh / 2);
          const sg = step.getContext('2d');
          sg.imageSmoothingQuality = 'high';
          sg.drawImage(src, 0, 0, step.width, step.height);
          src = step;
          sw = step.width;
          sh = step.height;
        }
        pg.imageSmoothingQuality = 'high';
        pg.drawImage(src, box.ox * dpr, box.oy * dpr, box.rw * dpr, box.rh * dpr);
        paper.toBlob((blob) => {
          if (!blob) return;
          if (url) URL.revokeObjectURL(url);
          url = URL.createObjectURL(blob);
          grid.style.setProperty('--img', `url("${url}")`);
        });
        cells.forEach((c, i) => {
          c.style.setProperty('--bs', `${W}px ${H}px`);
          c.style.setProperty('--bp', `${-(i % T_COLS) * (W / T_COLS)}px ${-Math.floor(i / T_COLS) * (H / T_ROWS)}px`);
        });
      };

      // Decoding in passes each tile through noise; going back is quicker and quiet, so
      // leaving one thumbnail for the next never draws the eye back to it.
      let cancel = null;
      const swap = (toB) => {
        if (cancel) cancel();
        const timers = new Set();
        const stop = schedule(cells.length, toB ? { steps: 8, stepMs: 34 } : { steps: 4, stepMs: 28 }, (i) => {
          const c = cells[i];
          if (c.classList.contains('is-b') === toB) return;
          if (!toB) { c.classList.remove('is-b'); return; }
          c.classList.add('is-noise');
          const t = setTimeout(() => {
            timers.delete(t);
            c.classList.remove('is-noise');
            c.classList.add('is-b');
          }, 90);
          timers.add(t);
        });
        cancel = () => {
          stop();
          timers.forEach(clearTimeout);
          cells.forEach((c) => c.classList.remove('is-noise'));
        };
      };

      // Only the thumbnail itself listens, so passing over a row's text decodes nothing.
      let hovering = false;
      thumb.addEventListener('pointerenter', () => {
        hovering = true;
        if (!ready()) return;
        layout();
        swap(true);
      });
      thumb.addEventListener('pointerleave', () => {
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
