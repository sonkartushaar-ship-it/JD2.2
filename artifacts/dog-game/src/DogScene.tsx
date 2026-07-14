import React, { useState, useEffect, useRef, useCallback } from 'react';
import Sprite from './Sprite';

// ── Claymation room set dressing ──────────────────────────────────────────────
import roomBg    from '@assets/Frame_1_1784006358820.png';
import sofa1     from '@assets/Adobe_Express_-_file_1784000834989.png';
import tableImg  from '@assets/generated_images/table_clay.png';
import vaseIntact  from '@assets/generated_images/vase_1_intact.png';
import vaseFalling from '@assets/generated_images/vase_2_falling.png';
import vaseBroken  from '@assets/generated_images/vase_3_broken.png';

const SOFA_IMAGES = [sofa1];
type VaseStage = 'intact' | 'falling' | 'broken';

export type DogState = 'idle' | 'run' | 'jump' | 'sit' | 'bark';

// ── World / viewport dimensions ───────────────────────────────────────────────
const VIEWPORT_W = 1280;
const WORLD_W    = VIEWPORT_W * 10; // 12 800 px wide

// ── Physics constants ─────────────────────────────────────────────────────────
const FLOOR_H    = 90;   // px from viewport bottom → floor surface
const GRAVITY    = 0.45; // px / frame²
const JUMP_VY    = 17;   // px / frame initial upward velocity
const RUN_PX_FPS = 5;    // px / frame at 60 fps
const EDGE_TOL   = 25;   // px tolerance beyond platform edge for landing

// ── Props — all x positions are absolute world-px ────────────────────────────
const SOFA_H        = 480;
const SOFA_X        = 64;  // left edge in world-px (≈ 5 % of viewport)

const TABLE_H       = 190;
const TABLE_ASPECT  = 736 / 592;
const TABLE_W_PX    = TABLE_H * TABLE_ASPECT;              // ≈ 236 px
const TABLE_X1_PX   = Math.round((57 + 35 / 1280 * 100) / 100 * VIEWPORT_W); // ≈ 765 px
const TABLE_X2_PX   = TABLE_X1_PX + TABLE_W_PX;
const TABLE_CTR_PX  = TABLE_X1_PX + TABLE_W_PX / 2;

// ── Platforms — x1 / x2 in world-px, surfaceY in px above floor ──────────────
const PLATFORMS = [
  { id: 'floor',     x1: 0,           x2: WORLD_W,     surfaceY: 0         },
  { id: 'sofa',      x1: 154,         x2: 781,         surfaceY: 296       }, // seat cushions
  { id: 'sofa-back', x1: 179,         x2: 755,         surfaceY: 466       }, // backrest
  { id: 'table',     x1: TABLE_X1_PX, x2: TABLE_X2_PX, surfaceY: TABLE_H - 2 },
] as const;

// ── Physics + render state ────────────────────────────────────────────────────
interface Phys {
  x:          number;        // dog centre, world-px
  y:          number;        // dog feet, px above floor surface
  vy:         number;        // vertical velocity, px / frame (positive = up)
  isAirborne: boolean;
  anim:       DogState;
  animKey:    number;
  facing:     boolean;       // true = facing left
  jumpFrame:  number;        // 0-3, physics-driven jump frame
  sofaWear:   number;
  vaseStage:  VaseStage;
  sofaRunMs:  number;
  platformId: string | null;
}

export default function DogScene() {
  const containerRef = useRef<HTMLDivElement>(null);

  const phys = useRef<Phys>({
    x: 281, y: 0, vy: 0,          // start at 22 % of viewport
    isAirborne: false,
    anim: 'idle', animKey: 0, facing: false, jumpFrame: 0,
    sofaWear: 0, vaseStage: 'intact', sofaRunMs: 0, platformId: null,
  });

  const heldKeys      = useRef(new Set<string>());
  const landTimeoutRef  = useRef<number | null>(null);
  const vaseTimeoutRef  = useRef<number | null>(null);

  const [snap, setSnap] = useState({
    x: 281, y: 0,
    anim: 'idle' as DogState,
    animKey: 0,
    facing: false,
    jumpFrame: 0,
    sofaWear: 0,
    vaseStage: 'intact' as VaseStage,
    platformId: null as string | null,
  });

  // Auto-focus so keyboard works immediately
  useEffect(() => { containerRef.current?.focus(); }, []);

  // Vase fall CSS transition trigger
  const [vaseDropped, setVaseDropped] = useState(false);
  useEffect(() => {
    if (snap.vaseStage !== 'falling') return;
    setVaseDropped(false);
    const raf = requestAnimationFrame(() => setVaseDropped(true));
    return () => cancelAnimationFrame(raf);
  }, [snap.vaseStage]);

  const setAnim = (next: DogState) => {
    const p = phys.current;
    if (p.anim !== next) { p.anim = next; p.animKey++; }
  };

  // ── Main physics + movement loop ──────────────────────────────────────────
  useEffect(() => {
    let rafId: number;
    let last = performance.now();

    const finishLanding = () => {
      const p = phys.current;
      p.jumpFrame = 0;
      if (landTimeoutRef.current) clearTimeout(landTimeoutRef.current);
      landTimeoutRef.current = window.setTimeout(() => {
        const held = heldKeys.current.has('KeyA') || heldKeys.current.has('KeyD');
        setAnim(held ? 'run' : 'idle');
      }, 100);
    };

    const bumpSofaWear = () => {
      const p = phys.current;
      if (p.sofaWear < SOFA_IMAGES.length - 1) p.sofaWear++;
    };

    const breakVase = () => {
      const p = phys.current;
      if (p.vaseStage !== 'intact') return;
      p.vaseStage = 'falling';
      if (vaseTimeoutRef.current) clearTimeout(vaseTimeoutRef.current);
      vaseTimeoutRef.current = window.setTimeout(() => {
        phys.current.vaseStage = 'broken';
        setSnap(s => ({ ...s, vaseStage: 'broken' }));
      }, 450);
    };

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 16.66, 2.5);
      last = now;

      const p = phys.current;

      const aHeld = heldKeys.current.has('KeyA');
      const dHeld = heldKeys.current.has('KeyD');

      // ── Horizontal movement (world-px) ────────────────────────────────────
      if (dHeld && !aHeld) {
        p.x = Math.min(p.x + RUN_PX_FPS * dt, WORLD_W - 50);
        p.facing = false;
        if (!p.isAirborne) setAnim('run');
      } else if (aHeld && !dHeld) {
        p.x = Math.max(p.x - RUN_PX_FPS * dt, 50);
        p.facing = true;
        if (!p.isAirborne) setAnim('run');
      }

      // ── Vertical physics ──────────────────────────────────────────────────
      if (p.isAirborne) {
        const prevY = p.y;
        p.vy -= GRAVITY * dt;
        p.y  += p.vy * dt;

        if      (p.vy > 10) p.jumpFrame = 0;
        else if (p.vy > 0)  p.jumpFrame = 1;
        else if (p.vy > -8) p.jumpFrame = 2;
        else                p.jumpFrame = 3;

        if (p.vy <= 0) {
          const xPx = p.x;
          let landed = false;
          const sorted = [...PLATFORMS].sort((a, b) => b.surfaceY - a.surfaceY);
          for (const pl of sorted) {
            const px1 = pl.x1 - EDGE_TOL;
            const px2 = pl.x2 + EDGE_TOL;
            if (xPx >= px1 && xPx <= px2 && prevY >= pl.surfaceY && p.y <= pl.surfaceY) {
              p.y = pl.surfaceY;
              p.vy = 0;
              p.isAirborne = false;
              p.platformId = pl.id;
              finishLanding();
              if (pl.id === 'sofa' || pl.id === 'sofa-back') bumpSofaWear();
              if (pl.id === 'table') breakVase();
              landed = true;
              break;
            }
          }
          if (!landed && p.y < 0) {
            p.y = 0; p.vy = 0; p.isAirborne = false;
            p.platformId = 'floor';
            finishLanding();
          }
        }
      } else {
        // Grounded: check if we've walked off a ledge
        const xPx = p.x;
        let onSurface = false;
        let currentPlatformId: string | null = null;
        for (const pl of PLATFORMS) {
          const px1 = pl.x1 - EDGE_TOL;
          const px2 = pl.x2 + EDGE_TOL;
          if (xPx >= px1 && xPx <= px2 && Math.abs(p.y - pl.surfaceY) < 4) {
            onSurface = true;
            currentPlatformId = pl.id;
            break;
          }
        }
        if (!onSurface) {
          p.isAirborne = true;
          p.platformId = null;
        } else {
          p.platformId = currentPlatformId;
        }

        if (p.anim === 'run' && (currentPlatformId === 'sofa' || currentPlatformId === 'sofa-back')) {
          p.sofaRunMs += dt * 16.66;
          if (p.sofaRunMs > 1500) { p.sofaRunMs = 0; bumpSofaWear(); }
        } else {
          p.sofaRunMs = 0;
        }

        if (currentPlatformId === 'table') breakVase();
      }

      setSnap({
        x: p.x, y: p.y, anim: p.anim, animKey: p.animKey, facing: p.facing,
        jumpFrame: p.jumpFrame, sofaWear: p.sofaWear, vaseStage: p.vaseStage,
        platformId: p.platformId,
      });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      if (landTimeoutRef.current) clearTimeout(landTimeoutRef.current);
      if (vaseTimeoutRef.current) clearTimeout(vaseTimeoutRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard handlers ─────────────────────────────────────────────────────
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.code === 'Tab') e.preventDefault();
    if (heldKeys.current.has(e.code)) return;
    heldKeys.current.add(e.code);
    const p = phys.current;
    if (e.code === 'KeyS' && !p.isAirborne) setAnim('sit');
    if (e.code === 'Tab'  && !p.isAirborne) setAnim('bark');
    if (e.code === 'KeyW' && !p.isAirborne) {
      p.vy = JUMP_VY; p.isAirborne = true; p.jumpFrame = 0; setAnim('jump');
    }
  }, []);

  const onKeyUp = useCallback((e: React.KeyboardEvent) => {
    heldKeys.current.delete(e.code);
    const p = phys.current;
    if ((e.code === 'KeyA' || e.code === 'KeyD') && !p.isAirborne) {
      if (!heldKeys.current.has('KeyA') && !heldKeys.current.has('KeyD')) setAnim('idle');
    }
  }, []);

  const onAnimComplete = useCallback(() => {
    const p = phys.current;
    if (p.anim === 'bark') {
      const held = heldKeys.current.has('KeyA') || heldKeys.current.has('KeyD');
      p.anim = held ? 'run' : 'idle';
      p.animKey++;
      setSnap(s => ({ ...s, anim: p.anim, animKey: p.animKey }));
    }
  }, []);

  // ── Camera: keep dog centred in viewport ─────────────────────────────────
  const cameraX = Math.max(0, Math.min(snap.x - VIEWPORT_W / 2, WORLD_W - VIEWPORT_W));

  // ── Shadow ────────────────────────────────────────────────────────────────
  const shadowY = (() => {
    let best = 0;
    for (const pl of PLATFORMS) {
      if (pl.surfaceY <= snap.y + 1) {
        const px1 = pl.x1 - EDGE_TOL;
        const px2 = pl.x2 + EDGE_TOL;
        if (snap.x >= px1 && snap.x <= px2 && pl.surfaceY > best) best = pl.surfaceY;
      }
    }
    return best;
  })();
  const shadowDist    = snap.y - shadowY;
  const shadowScale   = Math.max(0.3, 1 - shadowDist / 300);
  const shadowOpacity = Math.max(0.15, 0.6 - shadowDist / 280);

  // ── Per-platform visual offset ────────────────────────────────────────────
  const platformOffset = snap.platformId === 'sofa' ? 40 : 0;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      className="relative w-full h-full overflow-hidden select-none outline-none"
    >

      {/* ══ WORLD (10× wide, scrolled by camera) ══════════════════════════════ */}
      <div style={{
        position: 'absolute',
        top: 0, bottom: 0,
        width: WORLD_W,
        transform: `translateX(${-cameraX}px)`,
        willChange: 'transform',
      }}>

        {/* ── Background — clean BG tiled 10× ─────────────────────────────── */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url(${roomBg})`,
          backgroundSize: `${VIEWPORT_W}px 100%`,
          backgroundRepeat: 'repeat-x',
          backgroundPosition: 'left bottom',
        }} />

        {/* ── Sofa ────────────────────────────────────────────────────────── */}
        <img
          src={SOFA_IMAGES[snap.sofaWear]}
          alt="" draggable={false}
          style={{
            position: 'absolute',
            left: SOFA_X, height: SOFA_H, width: 'auto',
            bottom: FLOOR_H,
            pointerEvents: 'none', userSelect: 'none',
          }}
        />

        {/* ── Table ───────────────────────────────────────────────────────── */}
        <img
          src={tableImg}
          alt="" draggable={false}
          style={{
            position: 'absolute',
            left: TABLE_X1_PX, height: TABLE_H, width: 'auto',
            bottom: FLOOR_H,
            pointerEvents: 'none', userSelect: 'none',
          }}
        />

        {/* ── Vase (intact) ───────────────────────────────────────────────── */}
        {snap.vaseStage === 'intact' && (
          <img src={vaseIntact} alt="" draggable={false}
            style={{
              position: 'absolute',
              left: TABLE_CTR_PX, height: 180, width: 'auto',
              bottom: FLOOR_H + (TABLE_H - 2),
              transform: 'translateX(-50%)',
              pointerEvents: 'none', userSelect: 'none',
            }}
          />
        )}

        {/* ── Vase (falling) ──────────────────────────────────────────────── */}
        {snap.vaseStage === 'falling' && (
          <img src={vaseFalling} alt="" draggable={false}
            style={{
              position: 'absolute',
              left: TABLE_CTR_PX, height: 180, width: 'auto',
              bottom: vaseDropped ? FLOOR_H : FLOOR_H + (TABLE_H - 2),
              transition: 'bottom 0.45s cubic-bezier(0.5,0,1,1), transform 0.45s ease-in',
              transform: vaseDropped ? 'translateX(-50%) rotate(85deg)' : 'translateX(-50%) rotate(15deg)',
              pointerEvents: 'none', userSelect: 'none',
            }}
          />
        )}

        {/* ── Vase (broken) ───────────────────────────────────────────────── */}
        {snap.vaseStage === 'broken' && (
          <img src={vaseBroken} alt="" draggable={false}
            style={{
              position: 'absolute',
              zIndex: 25,
              left: TABLE_CTR_PX, height: 180, width: 'auto',
              bottom: FLOOR_H - 12 - 80,
              transform: 'translateX(-50%)',
              pointerEvents: 'none', userSelect: 'none',
            }}
          />
        )}

        {/* ── Dog shadow ──────────────────────────────────────────────────── */}
        <div style={{
          position: 'absolute',
          left: snap.x,
          bottom: FLOOR_H + shadowY + 2 - 20 - platformOffset,
          transform: `translateX(-50%) scaleX(${shadowScale})`,
          width: 130, height: 14,
          background: 'rgba(0,0,0,0.22)',
          borderRadius: '50%',
          opacity: shadowOpacity,
          zIndex: 18,
        }} />

        {/* ── Dog ─────────────────────────────────────────────────────────── */}
        <div style={{
          position: 'absolute',
          left: snap.x,
          bottom: FLOOR_H + snap.y - 20 - platformOffset,
          transform: `translateX(-50%) scaleX(${snap.facing ? -1 : 1})`,
          zIndex: 20,
        }}>
          <Sprite state={snap.anim} animKey={snap.animKey} jumpFrame={snap.jumpFrame} onComplete={onAnimComplete} />
        </div>

      </div>{/* end world */}

      {/* ══ HUD — fixed in viewport space ═════════════════════════════════════ */}
      <div style={{
        position: 'absolute', bottom: 16, left: 0, right: 0,
        zIndex: 50,
        display: 'flex', justifyContent: 'center',
      }}>
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 20,
          padding: '10px 20px', borderRadius: 18,
          background: 'rgba(80,50,30,0.22)',
          backdropFilter: 'blur(6px)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <Key label="W" sub="jump" active={snap.anim === 'jump'} />
            <div style={{ display: 'flex', gap: 4 }}>
              <Key label="A" sub="←" active={snap.anim === 'run' && snap.facing} />
              <Key label="S" sub="sit" active={snap.anim === 'sit'} />
              <Key label="D" sub="→" active={snap.anim === 'run' && !snap.facing} />
            </div>
          </div>
          <div style={{ width: 1, height: 40, background: 'rgba(255,255,255,0.2)' }} />
          <Key label="TAB" sub="bark" active={snap.anim === 'bark'} />
        </div>
      </div>

    </div>
  );
}

function Key({ label, sub, active }: { label: string; sub: string; active?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: label === 'TAB' ? 72 : 30,
        height: label === 'TAB' ? 26 : 30,
        background: active ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.18)',
        border: '1px solid rgba(255,255,255,0.3)',
        borderRadius: 8,
        fontWeight: 700, fontSize: 11, letterSpacing: 1,
        color: active ? '#fff' : 'rgba(255,255,255,0.75)',
        boxShadow: active ? 'none' : '0 3px 0 rgba(0,0,0,0.25)',
        transform: active ? 'translateY(3px)' : 'none',
        transition: 'all 0.08s',
      }}>{label}</div>
      <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>{sub}</span>
    </div>
  );
}
