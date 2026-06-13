/* =========================================================================
   LipCake Factory — Interactions
   ========================================================================= */

(function () {
  'use strict';

  // ----- Navigation: scroll state -----
  const nav = document.querySelector('.nav');
  if (nav) {
    const setScrolled = () => {
      if (window.scrollY > 40) nav.classList.add('scrolled');
      else nav.classList.remove('scrolled');
    };
    setScrolled();
    window.addEventListener('scroll', setScrolled, { passive: true });
  }

  // ----- Mobile menu toggle -----
  const navToggle = document.querySelector('.nav-toggle');
  if (navToggle && nav) {
    navToggle.addEventListener('click', () => {
      const open = nav.classList.toggle('menu-open');
      navToggle.classList.toggle('open', open);
      document.body.style.overflow = open ? 'hidden' : '';
    });
    document.querySelectorAll('.nav-menu a').forEach(a => {
      a.addEventListener('click', () => {
        nav.classList.remove('menu-open');
        navToggle.classList.remove('open');
        document.body.style.overflow = '';
      });
    });
  }

  // ----- Scroll reveal (IntersectionObserver) -----
  window.__lipReveal = true; // signal to the head fallback that JS is running
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));
  } else {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
  }

  // ----- Hero image carousel (3 váltakozó kép) -----
  const heroCarousel = document.querySelector('[data-hero-carousel]');
  if (heroCarousel) {
    const slides = heroCarousel.querySelectorAll('.hero-slide');
    if (slides.length > 1) {
      let active = 0;
      setInterval(() => {
        slides[active].classList.remove('is-active');
        active = (active + 1) % slides.length;
        slides[active].classList.add('is-active');
      }, 6000);
    }
  }

  // ----- Lightbox -----
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = '<button class="lightbox-close" aria-label="Bezárás">×</button><img alt="" />';
  document.body.appendChild(lb);
  const lbImg = lb.querySelector('img');
  const lbClose = lb.querySelector('.lightbox-close');

  document.querySelectorAll('[data-lightbox]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const src = el.getAttribute('data-lightbox') || el.querySelector('img')?.src;
      if (!src) return;
      lbImg.src = src;
      lb.classList.add('open');
      document.body.style.overflow = 'hidden';
    });
  });
  const closeLb = () => {
    lb.classList.remove('open');
    document.body.style.overflow = '';
  };
  lb.addEventListener('click', (e) => {
    if (e.target === lb || e.target === lbClose) closeLb();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLb();
  });

  // ----- Cookie banner -----
  const cookieAccepted = () => {
    try { return localStorage.getItem('lc_cookie') === '1'; } catch { return false; }
  };
  if (!cookieAccepted()) {
    const c = document.createElement('div');
    c.className = 'cookie';
    c.innerHTML = `
      <p>Sütiket használunk a felhasználói élmény fokozására. Részletek az <a href="#" style="border-bottom:1px solid currentColor">adatkezelési tájékoztatóban</a>.</p>
      <button type="button">Elfogadom</button>`;
    document.body.appendChild(c);
    setTimeout(() => c.classList.add('show'), 800);
    c.querySelector('button').addEventListener('click', () => {
      try { localStorage.setItem('lc_cookie', '1'); } catch {}
      c.classList.remove('show');
      setTimeout(() => c.remove(), 600);
    });
  }

  // ----- Gallery filter (galéria oldal) -----
  const chips = document.querySelectorAll('.chip[data-filter]');
  if (chips.length) {
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const filter = chip.dataset.filter;
        document.querySelectorAll('.masonry figure').forEach(fig => {
          const match = filter === 'all' || fig.dataset.cat === filter;
          fig.style.display = match ? '' : 'none';
        });
      });
    });
  }

  // =========================================================================
  // Rendelés (order) page logic
  // =========================================================================

  const orderRoot = document.querySelector('[data-order-form]');
  if (orderRoot) initOrderFlow(orderRoot);

  function initOrderFlow(root) {
    const steps      = root.querySelectorAll('.step');
    const panels     = root.querySelectorAll('.step-panel');
    const nextBtns   = root.querySelectorAll('[data-next]');
    const prevBtns   = root.querySelectorAll('[data-prev]');
    const productOpts= root.querySelectorAll('.product-option');
    const state = {
      step: 1,
      product: null,
      date: null,
      data: {}
    };

    const goTo = (n) => {
      if (n < 1 || n > steps.length) return;
      state.step = n;
      steps.forEach((s, i) => {
        s.classList.toggle('active', i + 1 === n);
        s.classList.toggle('completed', i + 1 < n);
      });
      panels.forEach((p, i) => p.classList.toggle('active', i + 1 === n));
      window.scrollTo({ top: root.offsetTop - 80, behavior: 'smooth' });
      if (n === 4) updateSummary();
    };

    nextBtns.forEach(b => b.addEventListener('click', () => {
      if (!validateStep(state.step)) return;
      goTo(state.step + 1);
    }));
    prevBtns.forEach(b => b.addEventListener('click', () => goTo(state.step - 1)));

    productOpts.forEach(opt => {
      opt.addEventListener('click', () => {
        productOpts.forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        state.product = opt.dataset.product;
      });
    });

    function validateStep(n) {
      if (n === 1 && !state.product) {
        flash('Válassz egy terméktípust a folytatáshoz');
        return false;
      }
      if (n === 2 && !state.date) {
        flash('Válassz egy szabad dátumot a naptárból');
        return false;
      }
      if (n === 3) {
        const required = root.querySelectorAll('[data-required]');
        for (const f of required) {
          if (!f.value.trim()) {
            f.focus();
            flash('Töltsd ki a kötelező mezőket');
            return false;
          }
        }
        required.forEach(f => state.data[f.name] = f.value);
      }
      return true;
    }

    function flash(msg) {
      let t = document.querySelector('.flash');
      if (!t) {
        t = document.createElement('div');
        t.className = 'flash';
        t.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:var(--burgundy);color:var(--ivory);padding:1rem 2rem;font-size:.8rem;letter-spacing:.15em;text-transform:uppercase;z-index:300;opacity:0;transition:opacity .3s ease';
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.style.opacity = '1';
      clearTimeout(t._tm);
      t._tm = setTimeout(() => { t.style.opacity = '0'; }, 2600);
    }

    // ----- Calendar -----
    initCalendar(root, state);

    function updateSummary() {
      const productLabel = {
        wedding:  'Esküvői torta',
        birthday: 'Születésnapi torta',
        allergy:  'Mentes torta',
        other:    'Egyedi torta'
      }[state.product] || '—';
      const sumProd = root.querySelector('[data-sum-product]');
      const sumDate = root.querySelector('[data-sum-date]');
      const sumName = root.querySelector('[data-sum-name]');
      if (sumProd) sumProd.textContent = productLabel;
      if (sumDate) sumDate.textContent = state.date ? formatDate(state.date) : '—';
      if (sumName) sumName.textContent = state.data.name || '—';
    }
  }

  function formatDate(d) {
    const months = ['január','február','március','április','május','június',
                    'július','augusztus','szeptember','október','november','december'];
    return `${d.getFullYear()}. ${months[d.getMonth()]} ${d.getDate()}.`;
  }

  function initCalendar(root, state) {
    const cal = root.querySelector('.calendar');
    if (!cal) return;

    const head = cal.querySelector('.cal-head h3');
    const grid = cal.querySelector('.cal-grid');
    const prev = cal.querySelector('.cal-prev');
    const next = cal.querySelector('.cal-next');

    let view = new Date();
    view.setDate(1);

    // demo: a few "booked" days each month
    const booked = new Set();
    const seed = (y, m) => {
      const key = `${y}-${m}`;
      if (booked.has(key + ':done')) return;
      booked.add(key + ':done');
      const days = new Date(y, m + 1, 0).getDate();
      // pseudo-random
      [3, 8, 14, 19, 22, 27].forEach(offset => {
        const d = ((offset + m * 3 + y) % (days - 2)) + 1;
        booked.add(`${y}-${m}-${d}`);
      });
    };

    const render = () => {
      const y = view.getFullYear();
      const m = view.getMonth();
      seed(y, m);
      const months = ['Január','Február','Március','Április','Május','Június',
                      'Július','Augusztus','Szeptember','Október','November','December'];
      head.textContent = `${months[m]} ${y}`;

      grid.innerHTML = '';
      ['H','K','Sz','Cs','P','Sz','V'].forEach(d => {
        const el = document.createElement('div');
        el.className = 'cal-dow';
        el.textContent = d;
        grid.appendChild(el);
      });

      // Monday as first day
      let firstDay = new Date(y, m, 1).getDay();
      firstDay = firstDay === 0 ? 6 : firstDay - 1;
      const totalDays = new Date(y, m + 1, 0).getDate();
      const today = new Date(); today.setHours(0,0,0,0);
      const minDate = new Date(today);
      minDate.setDate(minDate.getDate() + 14); // 2 weeks minimum lead time

      for (let i = 0; i < firstDay; i++) {
        const e = document.createElement('div');
        e.className = 'cal-day empty';
        grid.appendChild(e);
      }
      for (let d = 1; d <= totalDays; d++) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'cal-day';
        el.textContent = d;
        const cellDate = new Date(y, m, d);
        const isPast = cellDate < minDate;
        const isBooked = booked.has(`${y}-${m}-${d}`);
        if (isPast)   el.classList.add('disabled');
        if (isBooked) el.classList.add('booked');
        if (!isPast && !isBooked) {
          el.addEventListener('click', () => {
            grid.querySelectorAll('.cal-day.selected').forEach(s => s.classList.remove('selected'));
            el.classList.add('selected');
            state.date = cellDate;
          });
        }
        if (state.date &&
            state.date.getFullYear() === y &&
            state.date.getMonth() === m &&
            state.date.getDate() === d) {
          el.classList.add('selected');
        }
        grid.appendChild(el);
      }
    };

    prev.addEventListener('click', () => {
      view.setMonth(view.getMonth() - 1);
      const minMonth = new Date(); minMonth.setDate(1);
      if (view < minMonth) view = minMonth;
      render();
    });
    next.addEventListener('click', () => {
      view.setMonth(view.getMonth() + 1);
      render();
    });

    render();
  }

})();
