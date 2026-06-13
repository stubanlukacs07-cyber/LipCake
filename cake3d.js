/* =========================================================================
   LipCake Factory — 3D Cake Builder v3 (refined)
   - Harmonious flower palette derived from user color (boosted saturation)
   - Dynamic color label (no more "Krém" everywhere)
   - Realistic strawberry (LatheGeometry profile + seeded surface)
   - Blueberry clusters as fruit variation
   - Improved twin cherries with curved stems
   - Chocolate with shavings + varied drips
   - Layered rose petals with curled tips
   ========================================================================= */

(function () {
  'use strict';

  const canvas = document.getElementById('cake3d-canvas');
  const loading = document.getElementById('cake3d-loading');
  if (!canvas) return;

  // Mobilon kisebb árnyéktérkép → gyorsabb, simább render (a stílus változatlan marad)
  const SHADOW_SIZE = Math.min(window.innerWidth, window.innerHeight) < 800 ? 1024 : 2048;

  /* -------- Tier geometry presets -------- */
  const TIER_SPECS = [
    { r: 2.5,  h: 1.20 },
    { r: 1.95, h: 1.05 },
    { r: 1.45, h: 0.95 },
    { r: 1.00, h: 0.85 }
  ];
  const SINGLE_TIER = { r: 1.7, h: 1.15 };

  const PRESETS = {
    cream:    { hue: 35,  sat: 30, light: 92, label: 'Krém' },
    rose:     { hue: 8,   sat: 40, light: 86, label: 'Rózsa' },
    sage:     { hue: 85,  sat: 20, light: 72, label: 'Sage' },
    burgundy: { hue: 345, sat: 35, light: 42, label: 'Burgundi' },
    dark:     { hue: 25,  sat: 22, light: 26, label: 'Mély'  }
  };

  /* -------- HSL helpers -------- */
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(100, s)) / 100;
    l = Math.max(0, Math.min(100, l)) / 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const r = Math.round(f(0) * 255);
    const g = Math.round(f(8) * 255);
    const b = Math.round(f(4) * 255);
    return (r << 16) | (g << 8) | b;
  }
  function lightnessFromHex(hex) {
    const r = ((hex >> 16) & 0xff) / 255;
    const g = ((hex >> 8) & 0xff) / 255;
    const b = (hex & 0xff) / 255;
    return Math.max(r, g, b);
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[c]);
  }
  function colorLabel(cfg) {
    for (const key of Object.keys(PRESETS)) {
      const p = PRESETS[key];
      if (Math.abs(p.hue - cfg.hue) < 3 &&
          Math.abs(p.light - cfg.light) < 3 &&
          Math.abs(p.sat - cfg.sat) < 5) return p.label;
    }
    const h = cfg.hue;
    let name;
    if (h < 15 || h >= 345) name = 'piros';
    else if (h < 35) name = 'barack';
    else if (h < 55) name = 'mustár';
    else if (h < 80) name = 'lime';
    else if (h < 160) name = 'zöld';
    else if (h < 195) name = 'türkiz';
    else if (h < 245) name = 'kék';
    else if (h < 290) name = 'lila';
    else if (h < 330) name = 'rózsaszín';
    else name = 'magenta';
    let prefix;
    if (cfg.light > 82) prefix = 'Halvány ';
    else if (cfg.light > 55) prefix = '';
    else if (cfg.light > 38) prefix = 'Mély ';
    else prefix = 'Sötét ';
    return prefix + name;
  }

  /* -------- State -------- */
  const initial = () => ({
    frosting: 'naked',
    hue: PRESETS.cream.hue,
    sat: PRESETS.cream.sat,
    light: PRESETS.cream.light,
    decor: ['flowers']
  });
  const state = {
    tiers: 3,
    perTier: false,
    activeTier: 0,
    global: initial(),
    tierData: [initial(), initial(), initial(), initial()]
  };

  /* -------- Watchdog for Three.js -------- */
  let booted = false;
  const watchdog = setTimeout(() => {
    if (!booted) showError(
      'A 3D modul nem töltődött be',
      'Ellenőrizd az internetkapcsolatot. A Three.js a unpkg.com CDN-ről jön.'
    );
  }, 8000);

  const wait = () => {
    if (typeof THREE === 'undefined' || typeof THREE.OrbitControls === 'undefined') {
      requestAnimationFrame(wait);
      return;
    }
    booted = true;
    clearTimeout(watchdog);
    try { boot(); }
    catch (err) {
      console.error('[cake3d] init failed:', err);
      showError('Megjelenítési hiba', err && err.message ? err.message : String(err));
    }
  };
  wait();

  function hideLoading() { if (loading) loading.classList.add('hidden'); }
  function showError(title, detail) {
    hideLoading();
    const wrap = canvas.parentElement;
    if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
    const e = document.createElement('div');
    e.className = 'cake3d-error';
    e.innerHTML = '<h4>' + esc(title) + '</h4><p>' + esc(detail) + '</p>';
    wrap.appendChild(e);
    canvas.style.display = 'none';
  }

  function activeConfig() { return state.perTier ? state.tierData[state.activeTier] : state.global; }
  function tierConfig(idx) { return state.perTier ? state.tierData[idx] : state.global; }
  function cfgColorHex(cfg) { return hslToHex(cfg.hue, cfg.sat, cfg.light); }
  function getTierSpecs(count) {
    count = Math.max(1, Math.min(3, count));   // max 3 emelet
    if (count === 1) return [SINGLE_TIER];
    return TIER_SPECS.slice(4 - count);
  }

  /* =========================================================================
     Harmonious flower palette — based on user color, with BOOSTED saturation
     so that even pastel cakes have vivid flower clusters.
     ========================================================================= */
  function harmonyPalette(baseHex) {
    const base = new THREE.Color(baseHex);
    const hsl = {}; base.getHSL(hsl);
    // Saturation boost: flowers always more vivid than cake
    const sat = Math.max(0.45, Math.min(0.75, hsl.s * 2.4));
    // Lightness band around base
    const L = Math.max(0.4, Math.min(0.78, hsl.l));
    const colors = [
      new THREE.Color().setHSL(hsl.h,                    sat,          L),
      new THREE.Color().setHSL(hsl.h,                    sat * 0.85,   Math.min(0.88, L + 0.12)),
      new THREE.Color().setHSL(hsl.h,                    sat,          Math.max(0.32, L - 0.14)),
      new THREE.Color().setHSL((hsl.h + 0.045) % 1,      sat * 0.9,    L + 0.04),
      new THREE.Color().setHSL((hsl.h - 0.04 + 1) % 1,   sat * 0.85,   L + 0.02),
      new THREE.Color(0xFFF0DC)  // single warm cream accent (never pure white)
    ];
    return colors;
  }

  /* =========================================================================
     BOOT
     ========================================================================= */
  function boot() {
    const scene = new THREE.Scene();
    const getSize = () => ({
      w: Math.max(canvas.clientWidth, 320),
      h: Math.max(canvas.clientHeight, 320)
    });
    let s = getSize();

    const camera = new THREE.PerspectiveCamera(34, s.w / s.h, 0.1, 100);
    camera.position.set(7.8, 5.8, 11);

    const renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(s.w, s.h, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    /* -- Environment map (studio gradient) for realistic PBR reflections -- */
    let envMap = null;
    try {
      const envCanvas = document.createElement('canvas');
      envCanvas.width = 64; envCanvas.height = 256;
      const ex = envCanvas.getContext('2d');
      const grad = ex.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0.0, '#fffbf4');
      grad.addColorStop(0.35, '#fbefe4');
      grad.addColorStop(0.62, '#efddd0');
      grad.addColorStop(1.0, '#c4ac9e');
      ex.fillStyle = grad;
      ex.fillRect(0, 0, 64, 256);
      // soft window highlight (gives gold/fondant a believable specular streak)
      const spot = ex.createRadialGradient(32, 58, 2, 32, 58, 46);
      spot.addColorStop(0, 'rgba(255,255,255,0.95)');
      spot.addColorStop(1, 'rgba(255,255,255,0)');
      ex.fillStyle = spot;
      ex.fillRect(0, 0, 64, 130);
      const envTex = new THREE.CanvasTexture(envCanvas);
      envTex.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      envMap = pmrem.fromEquirectangular(envTex).texture;
      scene.environment = envMap;
      envTex.dispose();
      pmrem.dispose();
    } catch (e) {
      console.warn('[cake3d] env map unavailable, continuing without:', e);
    }

    /* -- Lighting -- */
    scene.add(new THREE.AmbientLight(0xfff2e6, 0.38));
    const hemi = new THREE.HemisphereLight(0xfff8ee, 0xf0d8c8, 0.42);
    hemi.position.set(0, 8, 0);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff4dc, 1.55);
    key.position.set(6, 9, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
    key.shadow.camera.near = 0.5; key.shadow.camera.far = 30;
    key.shadow.camera.left = -8; key.shadow.camera.right = 8;
    key.shadow.camera.top = 8; key.shadow.camera.bottom = -8;
    key.shadow.bias = -0.0008; key.shadow.radius = 8;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xf8dcd0, 0.65);
    fill.position.set(-5, 3, 6);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffb888, 0.45);
    rim.position.set(-2, 5, -7);
    scene.add(rim);

    /* -- Stand -- */
    const standMat = new THREE.MeshStandardMaterial({
      color: 0xEFE5DC, roughness: 0.4, metalness: 0.1
    });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.2, 0.12, 64), standMat);
    disc.position.y = 0.06; disc.receiveShadow = true;
    scene.add(disc);

    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.6, 32), standMat);
    pedestal.position.y = -0.3;
    pedestal.castShadow = pedestal.receiveShadow = true;
    scene.add(pedestal);

    const pBase = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.18, 64), standMat);
    pBase.position.y = -0.65;
    pBase.castShadow = pBase.receiveShadow = true;
    scene.add(pBase);

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.ShadowMaterial({ opacity: 0.2 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.745;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);

    const cakeGroup = new THREE.Group();
    scene.add(cakeGroup);

    function clearCake() {
      const dispose = (obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      };
      while (cakeGroup.children.length) {
        const ch = cakeGroup.children[0];
        cakeGroup.remove(ch);
        ch.traverse(dispose);
      }
    }

    /* =====================================================================
       FROSTING TIER BUILDERS
       ===================================================================== */

    function buildNakedTier(tier, hex) {
      const group = new THREE.Group();
      const cream = new THREE.Color(hex);
      const sponge = new THREE.Color(hex).multiplyScalar(0.55);
      const creamLighter = new THREE.Color(hex).multiplyScalar(1.05);

      const segments = 4;
      const layerH = tier.h / segments;
      const spongeH = layerH * 0.32;
      const creamH = layerH - spongeH;

      for (let i = 0; i < segments; i++) {
        const layerCenterY = tier.y - tier.h / 2 + layerH * i + layerH / 2;
        // Sponge band (inset)
        const sp = new THREE.Mesh(
          new THREE.CylinderGeometry(tier.r * 0.985, tier.r * 0.985, spongeH, 96),
          new THREE.MeshStandardMaterial({ color: sponge, roughness: 0.95 })
        );
        sp.position.y = layerCenterY - layerH / 2 + spongeH / 2;
        sp.castShadow = sp.receiveShadow = true;
        group.add(sp);
        // Cream band
        const cr = new THREE.Mesh(
          new THREE.CylinderGeometry(tier.r, tier.r, creamH, 96),
          new THREE.MeshStandardMaterial({ color: cream, roughness: 0.88 })
        );
        cr.position.y = layerCenterY - layerH / 2 + spongeH + creamH / 2;
        cr.castShadow = cr.receiveShadow = true;
        group.add(cr);
        // Highlight stripe
        if (i < segments - 1) {
          const hl = new THREE.Mesh(
            new THREE.TorusGeometry(tier.r + 0.005, 0.012, 6, 64),
            new THREE.MeshStandardMaterial({ color: creamLighter, roughness: 0.7 })
          );
          hl.rotation.x = Math.PI / 2;
          hl.position.y = cr.position.y + creamH / 2 - 0.01;
          group.add(hl);
        }
      }
      // Top "swoosh"
      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(tier.r * 1.005, tier.r, 0.06, 96),
        new THREE.MeshStandardMaterial({ color: cream, roughness: 0.85 })
      );
      top.position.y = tier.y + tier.h / 2 + 0.03;
      top.castShadow = top.receiveShadow = true;
      group.add(top);
      return group;
    }

    function buildFondantTier(tier, hex) {
      const group = new THREE.Group();
      const c = new THREE.Color(hex);
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(tier.r, tier.r, tier.h, 96),
        new THREE.MeshStandardMaterial({
          color: c, roughness: 0.1, metalness: 0.04, envMapIntensity: 1.15
        })
      );
      body.position.y = tier.y;
      body.castShadow = body.receiveShadow = true;
      group.add(body);
      // Smooth rounded top edge
      const edge = new THREE.Mesh(
        new THREE.TorusGeometry(tier.r - 0.02, 0.04, 8, 64),
        new THREE.MeshStandardMaterial({ color: c, roughness: 0.08, metalness: 0.05, envMapIntensity: 1.2 })
      );
      edge.rotation.x = Math.PI / 2;
      edge.position.y = tier.y + tier.h / 2;
      group.add(edge);
      return group;
    }

    function buildChocolateTier(tier) {
      const group = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x4A2A18, roughness: 0.38
      });
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(tier.r, tier.r, tier.h, 96), bodyMat
      );
      body.position.y = tier.y;
      body.castShadow = body.receiveShadow = true;
      group.add(body);

      // Glossy chocolate top
      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(tier.r * 1.01, tier.r * 1.01, 0.08, 96),
        new THREE.MeshStandardMaterial({
          color: 0x3a1e10, roughness: 0.22, metalness: 0.12
        })
      );
      top.position.y = tier.y + tier.h / 2 + 0.02;
      top.castShadow = top.receiveShadow = true;
      group.add(top);

      // Varied drips
      const dripMat = new THREE.MeshStandardMaterial({
        color: 0x3a1e10, roughness: 0.22, metalness: 0.12
      });
      const dripCount = 16;
      for (let i = 0; i < dripCount; i++) {
        const angle = (i / dripCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
        const dripLen = 0.18 + Math.random() * 0.65;
        const dripWidth = 0.05 + Math.random() * 0.06;
        const widthVar = 0.65 + Math.random() * 0.3;
        const drip = new THREE.Mesh(
          new THREE.CylinderGeometry(dripWidth * widthVar, dripWidth, dripLen, 12),
          dripMat
        );
        drip.position.set(
          Math.cos(angle) * (tier.r + 0.005),
          tier.y + tier.h / 2 - dripLen / 2 + 0.06,
          Math.sin(angle) * (tier.r + 0.005)
        );
        drip.castShadow = true;
        group.add(drip);
        const dripEnd = new THREE.Mesh(
          new THREE.SphereGeometry(dripWidth, 12, 12),
          dripMat
        );
        dripEnd.position.set(
          Math.cos(angle) * (tier.r + 0.005),
          tier.y + tier.h / 2 - dripLen + 0.06,
          Math.sin(angle) * (tier.r + 0.005)
        );
        group.add(dripEnd);
      }

      // Chocolate shavings/curls on top (only on top tier — handled by caller)
      // Stored as a metadata flag we return so the top tier knows it's chocolate
      group.userData.isChocolate = true;
      return group;
    }

    function addChocolateShavings(parent, tier) {
      const shavingMat = new THREE.MeshStandardMaterial({
        color: 0x5a3220, roughness: 0.28, metalness: 0.15
      });
      const milkMat = new THREE.MeshStandardMaterial({
        color: 0x8b5e3c, roughness: 0.32, metalness: 0.1
      });
      const count = 9;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * tier.r * 0.6;
        const mat = Math.random() > 0.5 ? shavingMat : milkMat;
        // Curl-like: small torus segment
        const curl = new THREE.Mesh(
          new THREE.TorusGeometry(0.05 + Math.random() * 0.04, 0.012, 6, 14, Math.PI * 1.4),
          mat
        );
        curl.position.set(
          Math.cos(angle) * r,
          0.03 + Math.random() * 0.04,
          Math.sin(angle) * r
        );
        curl.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.6;
        curl.rotation.y = Math.random() * Math.PI * 2;
        curl.rotation.z = (Math.random() - 0.5) * 0.5;
        curl.castShadow = true;
        parent.add(curl);
      }
    }

    function buildGoldTier(tier) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(tier.r, tier.r, tier.h, 96),
        new THREE.MeshStandardMaterial({
          color: 0xE8B43A, roughness: 0.16, metalness: 1.0,
          emissive: 0x4A2E08, emissiveIntensity: 0.2, envMapIntensity: 1.6
        })
      );
      body.position.y = tier.y;
      body.castShadow = body.receiveShadow = true;
      group.add(body);
      const edge = new THREE.Mesh(
        new THREE.TorusGeometry(tier.r - 0.015, 0.035, 10, 64),
        new THREE.MeshStandardMaterial({
          color: 0xFFD86E, roughness: 0.1, metalness: 1.0,
          emissive: 0x6A4A12, emissiveIntensity: 0.22, envMapIntensity: 1.8
        })
      );
      edge.rotation.x = Math.PI / 2;
      edge.position.y = tier.y + tier.h / 2;
      group.add(edge);
      return group;
    }

    /* =====================================================================
       ROSE — multi-layer petals with curled tips
       ===================================================================== */
    function makePetalGeometry(width, height, curlStrength) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.bezierCurveTo(width * 0.55, height * 0.10, width * 0.55, height * 0.65, width * 0.18, height);
      shape.bezierCurveTo(width * 0.05, height * 1.05, -width * 0.05, height * 1.05, -width * 0.18, height);
      shape.bezierCurveTo(-width * 0.55, height * 0.65, -width * 0.55, height * 0.10, 0, 0);

      const geom = new THREE.ExtrudeGeometry(shape, {
        depth: 0.008,
        bevelEnabled: false,
        curveSegments: 6,
        steps: 1
      });
      // Curl the tip backward (z displacement based on y)
      const pos = geom.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const t = Math.max(0, y / height);
        const curl = t * t * curlStrength;
        pos.setZ(i, z + curl);
      }
      pos.needsUpdate = true;
      geom.computeVertexNormals();
      geom.translate(0, 0, -0.004);
      return geom;
    }

    function createRose(baseColor, scale = 1) {
      const group = new THREE.Group();
      const base = baseColor.clone();
      const hsl = {}; base.getHSL(hsl);
      const deeper = new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 1.15), Math.max(0.18, hsl.l * 0.78));
      const lighter = new THREE.Color().setHSL(hsl.h, hsl.s * 0.85, Math.min(0.95, hsl.l * 1.15));

      const matOuter = new THREE.MeshStandardMaterial({
        color: lighter, roughness: 0.55, metalness: 0.02, side: THREE.DoubleSide
      });
      const matMid = new THREE.MeshStandardMaterial({
        color: base, roughness: 0.55, metalness: 0.02, side: THREE.DoubleSide
      });
      const matInner = new THREE.MeshStandardMaterial({
        color: deeper, roughness: 0.6, metalness: 0.02, side: THREE.DoubleSide
      });

      // Center bud — small cone
      const bud = new THREE.Mesh(
        new THREE.ConeGeometry(0.04 * scale, 0.08 * scale, 10, 1, false),
        matInner
      );
      bud.position.y = 0.04 * scale;
      bud.castShadow = true;
      group.add(bud);

      // Petal geometries (different sizes)
      const gOuter = makePetalGeometry(0.13 * scale, 0.18 * scale, 0.18);
      const gMid   = makePetalGeometry(0.10 * scale, 0.14 * scale, 0.13);
      const gInner = makePetalGeometry(0.075 * scale, 0.10 * scale, 0.08);

      // Layer 1: 7 large open petals
      for (let i = 0; i < 7; i++) {
        const p = new THREE.Mesh(gOuter, matOuter);
        const angle = (i / 7) * Math.PI * 2;
        p.position.set(0, 0, 0);
        p.rotation.y = -angle;
        p.rotation.x = -0.5;
        p.translateY(0);
        // Move outward then rotate (so petal radiates from center)
        const offset = new THREE.Vector3(0, 0, 0.05 * scale);
        offset.applyEuler(p.rotation);
        p.position.add(offset);
        p.castShadow = true;
        group.add(p);
      }
      // Layer 2: 6 medium petals — angled tighter
      for (let i = 0; i < 6; i++) {
        const p = new THREE.Mesh(gMid, matMid);
        const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
        p.rotation.y = -angle;
        p.rotation.x = -0.85;
        const offset = new THREE.Vector3(0, 0.03 * scale, 0.035 * scale);
        offset.applyEuler(p.rotation);
        p.position.copy(offset);
        p.castShadow = true;
        group.add(p);
      }
      // Layer 3: 5 inner petals tightly curled
      for (let i = 0; i < 5; i++) {
        const p = new THREE.Mesh(gInner, matInner);
        const angle = (i / 5) * Math.PI * 2 + Math.PI / 5;
        p.rotation.y = -angle;
        p.rotation.x = -1.1;
        const offset = new THREE.Vector3(0, 0.05 * scale, 0.022 * scale);
        offset.applyEuler(p.rotation);
        p.position.copy(offset);
        p.castShadow = true;
        group.add(p);
      }
      return group;
    }

    /* =====================================================================
       FILLERS — baby's breath + eucalyptus leaves
       ===================================================================== */
    function createBabysBreath() {
      const group = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({
        color: 0xFFF6E8, roughness: 0.55, metalness: 0
      });
      for (let i = 0; i < 8; i++) {
        const bud = new THREE.Mesh(
          new THREE.SphereGeometry(0.028 + Math.random() * 0.022, 8, 8),
          mat
        );
        bud.position.set(
          (Math.random() - 0.5) * 0.22,
          (Math.random() - 0.5) * 0.14,
          (Math.random() - 0.5) * 0.22
        );
        bud.castShadow = true;
        group.add(bud);
      }
      return group;
    }
    function createLeaf(big = false) {
      const group = new THREE.Group();
      const mats = [
        new THREE.MeshStandardMaterial({ color: 0x8AA275, roughness: 0.7, side: THREE.DoubleSide }),
        new THREE.MeshStandardMaterial({ color: 0x6B8A5C, roughness: 0.72, side: THREE.DoubleSide }),
        new THREE.MeshStandardMaterial({ color: 0x9CB088, roughness: 0.68, side: THREE.DoubleSide })
      ];
      const count = big ? 5 : 3;
      for (let i = 0; i < count; i++) {
        const leaf = new THREE.Mesh(
          new THREE.SphereGeometry(big ? 0.07 : 0.05, 10, 10, 0, Math.PI, 0, Math.PI),
          mats[i % mats.length]
        );
        leaf.scale.set(2.2, 0.18, 1);
        const angle = (i / count) * Math.PI * 0.9 - Math.PI * 0.45;
        leaf.position.set(Math.cos(angle) * 0.08, 0, Math.sin(angle) * 0.08);
        leaf.rotation.y = -angle;
        leaf.rotation.x = -0.3;
        leaf.castShadow = true;
        group.add(leaf);
      }
      return group;
    }

    /* =====================================================================
       FLOWER PLACEMENT
       ===================================================================== */
    function addFlowers(parent, tier, isTop, hex) {
      const palette = harmonyPalette(hex);
      const pickColor = () => palette[Math.floor(Math.random() * palette.length)];

      const count = isTop ? 8 : 4;
      for (let i = 0; i < count; i++) {
        const scale = 0.95 + Math.random() * 0.45;
        const rose = createRose(pickColor(), scale);
        let x, y, z;
        if (isTop) {
          const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
          const radius = i === 0 ? 0 : 0.15 + Math.random() * 0.5;
          x = Math.cos(angle) * radius;
          z = Math.sin(angle) * radius;
          y = 0.05 + Math.random() * 0.18;
        } else {
          const baseAngle = Math.PI * 0.7;
          const spread = Math.PI * 0.5;
          const angle = baseAngle + (i / count) * spread + (Math.random() - 0.5) * 0.3;
          const r = tier.r * (0.88 + Math.random() * 0.08);
          x = Math.cos(angle) * r;
          z = Math.sin(angle) * r;
          y = -0.04 + Math.random() * 0.14;
        }
        rose.position.set(x, y, z);
        rose.rotation.y = Math.random() * Math.PI * 2;
        rose.rotation.x = (Math.random() - 0.5) * 0.25;
        parent.add(rose);
      }
      // Baby's breath fillers
      const bbCount = isTop ? 5 : 2;
      for (let i = 0; i < bbCount; i++) {
        const bb = createBabysBreath();
        let x, y, z;
        if (isTop) {
          const angle = Math.random() * Math.PI * 2;
          const r = 0.12 + Math.random() * 0.55;
          x = Math.cos(angle) * r;
          z = Math.sin(angle) * r;
          y = 0.1 + Math.random() * 0.2;
        } else {
          const baseAngle = Math.PI * 0.7 + Math.random() * (Math.PI * 0.55);
          x = Math.cos(baseAngle) * tier.r * 0.9;
          z = Math.sin(baseAngle) * tier.r * 0.9;
          y = 0;
        }
        bb.position.set(x, y, z);
        parent.add(bb);
      }
      // Eucalyptus
      const leafCount = isTop ? 4 : 2;
      for (let i = 0; i < leafCount; i++) {
        const leaf = createLeaf(isTop);
        let x, y, z;
        if (isTop) {
          const angle = (i / leafCount) * Math.PI * 2 + 0.3;
          const r = 0.42 + Math.random() * 0.2;
          x = Math.cos(angle) * r;
          z = Math.sin(angle) * r;
          y = 0;
        } else {
          const baseAngle = Math.PI * 0.65 + Math.random() * (Math.PI * 0.55);
          x = Math.cos(baseAngle) * tier.r * 0.9;
          z = Math.sin(baseAngle) * tier.r * 0.9;
          y = -0.04;
        }
        leaf.position.set(x, y, z);
        leaf.rotation.y = Math.random() * Math.PI * 2;
        parent.add(leaf);
      }
    }

    /* =====================================================================
       STRAWBERRY (LatheGeometry profile)
       ===================================================================== */
    function createStrawberry() {
      const group = new THREE.Group();
      // Strawberry profile — wide top, tapering bottom point
      const profile = [
        new THREE.Vector2(0.000, -0.150),
        new THREE.Vector2(0.035, -0.130),
        new THREE.Vector2(0.065, -0.100),
        new THREE.Vector2(0.090, -0.060),
        new THREE.Vector2(0.108, -0.015),
        new THREE.Vector2(0.115,  0.030),
        new THREE.Vector2(0.110,  0.075),
        new THREE.Vector2(0.090,  0.110),
        new THREE.Vector2(0.060,  0.130),
        new THREE.Vector2(0.030,  0.140),
        new THREE.Vector2(0.000,  0.142)
      ];
      const bodyGeom = new THREE.LatheGeometry(profile, 22);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0xCC2D2D, roughness: 0.4, metalness: 0.1
      });
      const body = new THREE.Mesh(bodyGeom, bodyMat);
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      // Seeds — tiny pale dots scattered on the surface
      const seedMat = new THREE.MeshStandardMaterial({
        color: 0xF8E8B0, roughness: 0.55, metalness: 0
      });
      const seedCount = 28;
      for (let i = 0; i < seedCount; i++) {
        const seed = new THREE.Mesh(
          new THREE.SphereGeometry(0.0085, 6, 6), seedMat
        );
        // Sample point on lathe surface
        const u = Math.random();
        const v = Math.random();
        const theta = 2 * Math.PI * u;
        // Pick a y position weighted toward middle/bottom (more seeds there)
        const idx = Math.floor(Math.pow(v, 1.4) * (profile.length - 1));
        const p = profile[idx];
        const rR = p.x * 1.005;
        const yY = p.y;
        seed.position.set(
          Math.cos(theta) * rR,
          yY,
          Math.sin(theta) * rR
        );
        group.add(seed);
      }

      // Crown — 6 small star leaves
      const crownMat = new THREE.MeshStandardMaterial({
        color: 0x4A7530, roughness: 0.7, side: THREE.DoubleSide
      });
      for (let i = 0; i < 6; i++) {
        const leaf = new THREE.Mesh(
          new THREE.ConeGeometry(0.045, 0.10, 6, 1, true),
          crownMat
        );
        const angle = (i / 6) * Math.PI * 2;
        leaf.position.set(
          Math.cos(angle) * 0.035,
          0.182,
          Math.sin(angle) * 0.035
        );
        leaf.rotation.z = Math.cos(angle) * 0.55;
        leaf.rotation.x = Math.sin(angle) * 0.55;
        group.add(leaf);
      }
      // Small stem
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.011, 0.014, 0.055, 6),
        new THREE.MeshStandardMaterial({ color: 0x5B7A3F })
      );
      stem.position.y = 0.218;
      group.add(stem);

      return group;
    }

    /* =====================================================================
       CHERRY PAIR — asymmetric twins with curved stems
       ===================================================================== */
    function createCherryPair() {
      const group = new THREE.Group();
      const cherryMat1 = new THREE.MeshStandardMaterial({
        color: 0x7A0F1F, roughness: 0.2, metalness: 0.3,
        emissive: 0x2A0408, emissiveIntensity: 0.12
      });
      const cherryMat2 = new THREE.MeshStandardMaterial({
        color: 0xB22030, roughness: 0.15, metalness: 0.32,
        emissive: 0x3A050A, emissiveIntensity: 0.18
      });
      const stemMat = new THREE.MeshStandardMaterial({
        color: 0x6B5630, roughness: 0.65
      });

      // Two cherries at slight depth offset (asymmetric)
      const c1 = new THREE.Mesh(new THREE.SphereGeometry(0.095, 18, 18), cherryMat1);
      c1.position.set(-0.085, -0.005, -0.015);
      c1.castShadow = true;
      group.add(c1);
      // Subtle highlight bump
      const hl1 = new THREE.Mesh(
        new THREE.SphereGeometry(0.018, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xFFC8B0, roughness: 0.2, metalness: 0.5, transparent: true, opacity: 0.6 })
      );
      hl1.position.set(-0.105, 0.045, 0.03);
      group.add(hl1);

      const c2 = new THREE.Mesh(new THREE.SphereGeometry(0.095, 18, 18), cherryMat2);
      c2.position.set(0.085, 0.025, 0.020);
      c2.castShadow = true;
      group.add(c2);
      const hl2 = new THREE.Mesh(
        new THREE.SphereGeometry(0.020, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xFFD0B8, roughness: 0.2, metalness: 0.5, transparent: true, opacity: 0.6 })
      );
      hl2.position.set(0.065, 0.075, 0.06);
      group.add(hl2);

      // Curved stems meeting at top
      const stem1 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.011, 0.18, 6), stemMat
      );
      stem1.position.set(-0.06, 0.10, 0);
      stem1.rotation.z = 0.32;
      group.add(stem1);

      const stem2 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.011, 0.16, 6), stemMat
      );
      stem2.position.set(0.05, 0.115, 0.01);
      stem2.rotation.z = -0.28;
      group.add(stem2);

      // Tiny leaf at junction
      const leaf = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 8, 8, 0, Math.PI, 0, Math.PI),
        new THREE.MeshStandardMaterial({ color: 0x5B7A3F, side: THREE.DoubleSide })
      );
      leaf.scale.set(1.8, 0.3, 1.2);
      leaf.position.set(-0.005, 0.195, 0.02);
      leaf.rotation.x = -0.4;
      leaf.rotation.z = 0.3;
      group.add(leaf);

      return group;
    }

    /* =====================================================================
       BLUEBERRY CLUSTER
       ===================================================================== */
    function createBlueberryCluster() {
      const group = new THREE.Group();
      const bMat = new THREE.MeshStandardMaterial({
        color: 0x3a4f7a, roughness: 0.42, metalness: 0.18
      });
      const bMatDeep = new THREE.MeshStandardMaterial({
        color: 0x2a3a60, roughness: 0.45, metalness: 0.2
      });
      // Bloom highlight material (whitish, semi-transparent)
      const bloomMat = new THREE.MeshStandardMaterial({
        color: 0xc8d4e6, roughness: 0.5, metalness: 0,
        transparent: true, opacity: 0.65
      });
      const positions = [
        { x: -0.06, y: 0.00, z: -0.02, r: 0.062, deep: false },
        { x:  0.05, y: 0.01, z: -0.04, r: 0.058, deep: true },
        { x:  0.00, y: 0.02, z:  0.05, r: 0.064, deep: false },
        { x: -0.04, y: 0.04, z:  0.05, r: 0.054, deep: true },
        { x:  0.06, y: 0.05, z:  0.02, r: 0.058, deep: false },
        { x:  0.00, y: 0.07, z: -0.01, r: 0.052, deep: true },
      ];
      positions.forEach(p => {
        const berry = new THREE.Mesh(
          new THREE.SphereGeometry(p.r, 14, 14),
          p.deep ? bMatDeep : bMat
        );
        berry.position.set(p.x, p.y, p.z);
        berry.castShadow = true;
        group.add(berry);
        // Tiny crown/calyx — small flat star at top
        const crown = new THREE.Mesh(
          new THREE.SphereGeometry(p.r * 0.35, 6, 6, 0, Math.PI * 2, 0, Math.PI * 0.4),
          new THREE.MeshStandardMaterial({ color: 0x2a3650, roughness: 0.6 })
        );
        crown.position.set(p.x, p.y + p.r * 0.85, p.z);
        crown.scale.set(1, 0.3, 1);
        group.add(crown);
        // Bloom highlight on side
        const bloom = new THREE.Mesh(
          new THREE.SphereGeometry(p.r * 0.5, 8, 8),
          bloomMat
        );
        bloom.position.set(p.x - p.r * 0.4, p.y + p.r * 0.2, p.z + p.r * 0.4);
        bloom.scale.set(1, 1, 0.15);
        group.add(bloom);
      });
      return group;
    }

    /* =====================================================================
       FRUIT PLACEMENT
       ===================================================================== */
    function addFruits(parent, tier) {
      const fruitCount = 14;
      const ringR = tier.r * 0.88;
      for (let i = 0; i < fruitCount; i++) {
        const angle = (i / fruitCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.22;
        const x = Math.cos(angle) * (ringR + (Math.random() - 0.4) * 0.12);
        const z = Math.sin(angle) * (ringR + (Math.random() - 0.4) * 0.12);
        const drape = Math.random() > 0.55 ? -0.12 : 0;
        const v = Math.random();

        let fruit;
        if (v > 0.6) {
          fruit = createStrawberry();
          fruit.position.set(x, 0.04 + drape, z);
          fruit.rotation.y = Math.random() * Math.PI * 2;
          fruit.rotation.z = (Math.random() - 0.5) * 0.5;
          fruit.scale.setScalar(0.9 + Math.random() * 0.25);
        } else if (v > 0.3) {
          fruit = createCherryPair();
          fruit.position.set(x, 0.05 + drape, z);
          fruit.rotation.y = Math.random() * Math.PI * 2;
          fruit.scale.setScalar(0.85 + Math.random() * 0.3);
        } else {
          fruit = createBlueberryCluster();
          fruit.position.set(x, 0.03 + drape, z);
          fruit.rotation.y = Math.random() * Math.PI * 2;
          fruit.scale.setScalar(0.95 + Math.random() * 0.3);
        }
        parent.add(fruit);
      }
    }

    /* =====================================================================
       BUILD CAKE
       ===================================================================== */
    function buildCake() {
      clearCake();
      const specs = getTierSpecs(state.tiers);

      let yCursor = 0.12;
      const tiers = specs.map(sp => {
        const y = yCursor + sp.h / 2;
        yCursor += sp.h;
        return { ...sp, y };
      });

      tiers.forEach((tier, idx) => {
        const cfg = tierConfig(idx);
        const hex = cfgColorHex(cfg);

        let tb;
        switch (cfg.frosting) {
          case 'naked':     tb = buildNakedTier(tier, hex); break;
          case 'fondant':   tb = buildFondantTier(tier, hex); break;
          case 'chocolate': tb = buildChocolateTier(tier); break;
          case 'gold':      tb = buildGoldTier(tier); break;
          default:          tb = buildFondantTier(tier, hex);
        }
        cakeGroup.add(tb);

        const isTop = idx === tiers.length - 1;

        // Gold ring between tiers
        if (!isTop) {
          const goldMat = new THREE.MeshStandardMaterial({
            color: 0xC9886F, roughness: 0.32, metalness: 0.85
          });
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(tier.r + 0.012, 0.025, 12, 96), goldMat
          );
          ring.rotation.x = Math.PI / 2;
          ring.position.y = tier.y + tier.h / 2 + 0.015;
          ring.castShadow = true;
          cakeGroup.add(ring);
        }

        // Decorations
        const decor = new THREE.Group();
        decor.position.set(0, tier.y + tier.h / 2 + (isTop ? 0.05 : 0.02), 0);
        if (cfg.decor.includes('flowers')) addFlowers(decor, tier, isTop, hex);
        if (cfg.decor.includes('fruits'))  addFruits(decor, tier);
        // Chocolate shavings on top of top tier when frosting=chocolate
        if (isTop && cfg.frosting === 'chocolate') addChocolateShavings(decor, tier);
        cakeGroup.add(decor);
      });

      if (controls) {
        const totalH = tiers.length
          ? (tiers[tiers.length - 1].y + tiers[tiers.length - 1].h / 2)
          : 1.5;
        controls.target.set(0, totalH * 0.5, 0);
      }
    }

    /* -- Controls -- */
    const controls = new THREE.OrbitControls(camera, canvas);
    controls.target.set(0, 1.6, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 7;
    controls.maxDistance = 18;
    controls.minPolarAngle = Math.PI * 0.18;
    controls.maxPolarAngle = Math.PI * 0.55;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.55;
    controls.update();

    let idleTimer = null;
    const onInteract = () => {
      controls.autoRotate = false;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { controls.autoRotate = true; }, 4500);
    };
    canvas.addEventListener('pointerdown', onInteract);
    canvas.addEventListener('wheel', onInteract, { passive: true });

    const onResize = () => {
      const s = getSize();
      camera.aspect = s.w / s.h;
      camera.updateProjectionMatrix();
      renderer.setSize(s.w, s.h, false);
    };
    window.addEventListener('resize', onResize);
    setTimeout(onResize, 50);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      controls.autoRotate = false;
    }

    let inView = true;
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(e => { inView = e.isIntersecting; });
      }, { threshold: 0.01 });
      io.observe(canvas);
    }

    const animate = () => {
      if (inView) {
        controls.update();
        renderer.render(scene, camera);
      }
      requestAnimationFrame(animate);
    };

    buildCake();
    animate();
    requestAnimationFrame(() => requestAnimationFrame(hideLoading));

    bindUI(buildCake);
  }

  /* =========================================================================
     UI BINDING
     ========================================================================= */
  function bindUI(rebuild) {
    document.querySelectorAll('[data-tiers]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.tiers = parseInt(btn.dataset.tiers, 10);
        if (state.activeTier >= state.tiers) state.activeTier = state.tiers - 1;
        syncUI();
        rebuild();
      });
    });

    const ptToggle = document.querySelector('[data-pertier-toggle]');
    if (ptToggle) {
      ptToggle.addEventListener('change', () => {
        if (ptToggle.checked) {
          state.tierData = state.tierData.map(() => ({
            frosting: state.global.frosting,
            hue: state.global.hue, sat: state.global.sat, light: state.global.light,
            decor: state.global.decor.slice()
          }));
        } else {
          const t = state.tierData[state.activeTier];
          state.global = {
            frosting: t.frosting,
            hue: t.hue, sat: t.sat, light: t.light,
            decor: t.decor.slice()
          };
        }
        state.perTier = ptToggle.checked;
        syncUI();
        rebuild();
      });
    }

    document.querySelectorAll('[data-tier-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        const idx = parseInt(tab.dataset.tierTab, 10);
        if (idx >= state.tiers) return;
        state.activeTier = idx;
        syncUI();
      });
    });

    document.querySelectorAll('[data-frosting]').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.frosting;
        if (state.perTier) state.tierData[state.activeTier].frosting = v;
        else state.global.frosting = v;
        syncUI();
        rebuild();
      });
    });

    const hueInput = document.querySelector('[data-color-hue]');
    const lightInput = document.querySelector('[data-color-light]');
    const onColorSlider = () => {
      const h = parseInt(hueInput.value, 10);
      const l = parseInt(lightInput.value, 10);
      const cfg = activeConfig();
      cfg.hue = h;
      cfg.light = l;
      cfg.sat = l > 78 ? 32 : (l > 55 ? 42 : (l > 35 ? 38 : 28));
      syncUI();
      rebuild();
    };
    if (hueInput && lightInput) {
      hueInput.addEventListener('input', onColorSlider);
      lightInput.addEventListener('input', onColorSlider);
    }

    document.querySelectorAll('[data-color-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.colorPreset;
        const p = PRESETS[key];
        if (!p) return;
        const cfg = activeConfig();
        cfg.hue = p.hue; cfg.sat = p.sat; cfg.light = p.light;
        if (hueInput) hueInput.value = p.hue;
        if (lightInput) lightInput.value = p.light;
        syncUI();
        rebuild();
      });
    });

    document.querySelectorAll('[data-decor]').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.decor;
        const cfg = activeConfig();
        const i = cfg.decor.indexOf(v);
        if (i === -1) cfg.decor.push(v); else cfg.decor.splice(i, 1);
        syncUI();
        rebuild();
      });
    });

    const randomBtn = document.querySelector('[data-random]');
    if (randomBtn) {
      randomBtn.addEventListener('click', () => {
        const frostings = ['naked', 'fondant', 'chocolate', 'gold'];
        const decorOpts = [['flowers'], ['fruits'], ['flowers', 'fruits'], []];
        const keys = Object.keys(PRESETS);
        const rnd = arr => arr[Math.floor(Math.random() * arr.length)];
        const rollOne = () => {
          const p = PRESETS[rnd(keys)];
          return {
            frosting: rnd(frostings),
            hue: p.hue, sat: p.sat, light: p.light,
            decor: rnd(decorOpts).slice()
          };
        };
        if (state.perTier) state.tierData = state.tierData.map(rollOne);
        else state.global = rollOne();
        syncUI();
        rebuild();
      });
    }

    const resetBtn = document.querySelector('[data-reset]');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        state.tiers = 3;
        state.perTier = false;
        state.activeTier = 0;
        const fresh = {
          frosting: 'naked',
          hue: PRESETS.cream.hue, sat: PRESETS.cream.sat, light: PRESETS.cream.light,
          decor: ['flowers']
        };
        state.global = { ...fresh };
        state.tierData = state.tierData.map(() => ({ ...fresh, decor: ['flowers'] }));
        if (hueInput) hueInput.value = fresh.hue;
        if (lightInput) lightInput.value = fresh.light;
        syncUI();
        rebuild();
      });
    }

    syncUI();
  }

  function syncUI() {
    document.querySelectorAll('[data-tiers]').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.tiers, 10) === state.tiers);
    });
    const ptToggle = document.querySelector('[data-pertier-toggle]');
    if (ptToggle) ptToggle.checked = state.perTier;
    const tabs = document.querySelector('[data-tier-tabs]');
    if (tabs) {
      tabs.classList.toggle('visible', state.perTier && state.tiers > 1);
      tabs.querySelectorAll('[data-tier-tab]').forEach(tab => {
        const idx = parseInt(tab.dataset.tierTab, 10);
        tab.style.display = idx < state.tiers ? '' : 'none';
        tab.classList.toggle('active', idx === state.activeTier);
      });
    }

    const cfg = activeConfig();
    const editLabel = document.querySelector('[data-edit-label]');
    if (editLabel) {
      editLabel.textContent = state.perTier && state.tiers > 1
        ? `${state.activeTier + 1}. szint szerkesztése`
        : 'Egységes dizájn';
    }

    document.querySelectorAll('[data-frosting]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.frosting === cfg.frosting);
    });
    document.querySelectorAll('[data-decor]').forEach(btn => {
      btn.classList.toggle('active', cfg.decor.includes(btn.dataset.decor));
    });

    const hex = cfgColorHex(cfg);
    const hexStr = '#' + hex.toString(16).padStart(6, '0');
    const preview = document.querySelector('[data-color-preview]');
    if (preview) {
      preview.style.background = hexStr;
      // Dynamic label — finally!
      preview.dataset.label = colorLabel(cfg);
      const ltn = lightnessFromHex(hex);
      preview.style.color = ltn > 0.55 ? '#3c2a30' : '#fff5e8';
    }

    const hueInput = document.querySelector('[data-color-hue]');
    const lightInput = document.querySelector('[data-color-light]');
    if (hueInput && parseInt(hueInput.value, 10) !== cfg.hue) hueInput.value = cfg.hue;
    if (lightInput && parseInt(lightInput.value, 10) !== cfg.light) lightInput.value = cfg.light;
    if (lightInput) {
      lightInput.style.background =
        `linear-gradient(to right, hsl(${cfg.hue},${cfg.sat}%,20%), hsl(${cfg.hue},${cfg.sat}%,55%), hsl(${cfg.hue},${cfg.sat}%,95%))`;
    }

    document.querySelectorAll('[data-color-preset]').forEach(btn => {
      const p = PRESETS[btn.dataset.colorPreset];
      const match = p &&
        Math.abs(p.hue - cfg.hue) < 2 &&
        Math.abs(p.light - cfg.light) < 2 &&
        Math.abs(p.sat - cfg.sat) < 3;
      btn.classList.toggle('active', !!match);
    });
  }
})();
