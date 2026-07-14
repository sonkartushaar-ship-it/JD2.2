import React, { useState, useEffect, useRef, useCallback } from 'react';
import Sprite from './Sprite';

// ── Claymation room set dressing ──────────────────────────────────────────────
import roomBg    from '@assets/Gemini_Generated_Image_ngw9g6ngw9g6ngw9_1_1784006527123.png';
import sofa1     from '@assets/Adobe_Express_-_file_1784000834989.png';
import tableImg  from '@assets/generated_images/table_clay.png';
import vaseIntact  from '@assets/generated_images/vase_1_intact.png';
import vaseFalling from '@assets/generated_images/vase_2_falling.png';
import vaseBroken  from '@assets/generated_images/vase_3_broken.png';

// ── TV Cabinet set dressing ────────────────────────────────────────────────────
import cabinetIntactImg  from '@assets/generated_images/tv_cabinet_oak_2.png';
import cabinetDamagedImg from '@assets/generated_images/tv_cabinet_damaged.png';
import tvScreenImg       from '@assets/generated_images/tv_screen_clay.png';
import bookLedgeImg      from '@assets/generated_images/book_ledge_clay.png';
import soundbarImg       from '@assets/generated_images/soundbar_clay.png';
import decoBoxesImg      from '@assets/generated_images/deco_boxes_clay.png';
// Falling items
import frame1FallingImg  from '@assets/generated_images/frame_falling_1.png';
import frame2FallingImg  from '@assets/generated_images/frame_falling_2.png';
import framesBrokenImg   from '@assets/generated_images/frames_broken.png';
import remoteFallingImg  from '@assets/generated_images/remote_falling.png';
import remoteBrokenImg   from '@assets/generated_images/remote_broken.png';
import potFallingImg     from '@assets/generated_images/pot_falling.png';
import potBrokenImg      from '@assets/generated_images/pot_broken.png';

const SOFA_IMAGES = [sofa1];
type VaseStage = 'intact' | 'falling' | 'broken';
type CabStage  = 'intact' | 'falling' | 'trashed';

export type DogState = 'idle' | 'run' | 'jump' | 'sit' | 'bark';

// ── World / viewport dimensions ───────────────────────────────────────────────
const VIEWPORT_W = 1280;
const WORLD_W    = VIEWPORT_W * 11; // 14 080 px wide

// ── Physics constants ─────────────────────────────────────────────────────────
const FLOOR_H    = 90;   // px from viewport bottom → visual floor surface
const GRAVITY    = 0.45;
const JUMP_VY    = 17;
const RUN_PX_FPS = 5;
const EDGE_TOL   = 25;

// ── Props — all x positions are absolute world-px ────────────────────────────
const SOFA_H = 480;
const SOFA_X = 64;

const TABLE_H      = 190;
const TABLE_ASPECT = 736 / 592;
const TABLE_W_PX   = TABLE_H * TABLE_ASPECT;
const TABLE_X1_PX  = Math.round((57 + 35 / 1280 * 100) / 100 * VIEWPORT_W);
const TABLE_X2_PX  = TABLE_X1_PX + TABLE_W_PX;
const TABLE_CTR_PX = TABLE_X1_PX + TABLE_W_PX / 2;

// ── TV Cabinet ────────────────────────────────────────────────────────────────
const CABINET_X    = 1500;
const CABINET_H    = 480;
const CABINET_W    = 480;
// Visual offset: cabinet is drawn 80px below FLOOR_H baseline
const CAB_V_OFF    = -80;
// CSS bottom of cabinet's bottom edge:
const CAB_BOT_CSS  = FLOOR_H + CAB_V_OFF;          // 10
// CSS bottom of cabinet's TOP edge (where things rest):
const CAB_TOP_CSS  = CAB_BOT_CSS + CABINET_H;       // 490
// Physics surfaceY for cabinet top (px above floor surface):
const CAB_TOP_SURF_Y = CAB_TOP_CSS - FLOOR_H;       // 400

// Book ledge (left, single)
const CAB_BOOK_H      = 220;
const CAB_BOOK_A_LEFT = CABINET_X - 200;
// Books sit with their base at floor level, top at BOOK_H above floor
const CAB_BOOK_A_SURF_Y = CAB_BOOK_H; // 220 — top of books = their height above floor
// Wall block: dog cannot walk right past books while on floor
const BOOK_WALL_X = CABINET_X + 80;   // right edge of the book obstacle

// Soundbar — sits on cabinet top
const CAB_SB_H     = 55;
const CAB_SB_W     = 420;
const CAB_SB_LEFT  = CABINET_X + Math.round((CABINET_W - CAB_SB_W) / 2);
const CAB_SB_SURF_Y = CAB_TOP_SURF_Y + CAB_SB_H;   // 455

// TV — sits on cabinet top (bottom of TV flush with cabinet top)
const CAB_TV_H    = 320;
const CAB_TV_W    = 380;
const CAB_TV_LEFT = CABINET_X + Math.round((CABINET_W - CAB_TV_W) / 2);

// Deco boxes — visual only, on cabinet top right
const CAB_DECO_H    = 120;
const CAB_DECO_LEFT = CABINET_X + CABINET_W - 140;

// Falling items world-x positions (inside cabinet)
const CAB_ITEM_FRAME1_X  = CABINET_X + 60;
const CAB_ITEM_FRAME2_X  = CABINET_X + 310;
const CAB_ITEM_REMOTE_X  = CABINET_X + 400;
const CAB_ITEM_POT_X     = CABINET_X + 190;
// Start height (inside cabinet, mid-shelf visual)
const CAB_ITEM_START_CSS = CAB_BOT_CSS + CABINET_H * 0.55; // ~274
// End height (at floor level)
const CAB_ITEM_END_CSS   = FLOOR_H;

// ── Platforms ────────────────────────────────────────────────────────────────
const PLATFORMS = [
  { id: 'floor',        x1: 0,                    x2: WORLD_W,                surfaceY: 0                  },
  { id: 'sofa',         x1: 154,                  x2: 781,                    surfaceY: 296                },
  { id: 'sofa-back',    x1: 179,                  x2: 755,                    surfaceY: 466                },
  { id: 'table',        x1: TABLE_X1_PX,          x2: TABLE_X2_PX,            surfaceY: TABLE_H - 2        },
  // Cabinet
  { id: 'cab-book-a',   x1: CABINET_X - 200,      x2: CABINET_X + 80,         surfaceY: CAB_BOOK_A_SURF_Y  },
  { id: 'cab-top',      x1: CABINET_X,            x2: CABINET_X + CABINET_W,  surfaceY: CAB_TOP_SURF_Y     },
  { id: 'cab-soundbar', x1: CAB_SB_LEFT,          x2: CAB_SB_LEFT + CAB_SB_W, surfaceY: CAB_SB_SURF_Y     },
] as const;

// ── Physics + render state ────────────────────────────────────────────────────
interface Phys {
  x: number; y: number; vy: number;
  isAirborne: boolean;
  anim: DogState; animKey: number;
  facing: boolean; jumpFrame: number;
  sofaWear: number;
  vaseStage: VaseStage;
  cabStage: CabStage;
  sofaRunMs: number;
  platformId: string | null;
}

export default function DogScene() {
  const containerRef = useRef<HTMLDivElement>(null);

  const phys = useRef<Phys>({
    x: 281, y: 0, vy: 0,
    isAirborne: false,
    anim: 'idle', animKey: 0, facing: false, jumpFrame: 0,
    sofaWear: 0, vaseStage: 'intact', cabStage: 'intact',
    sofaRunMs: 0, platformId: null,
  });

  const heldKeys       = useRef(new Set<string>());
  const landTimeoutRef = useRef<number | null>(null);
  const vaseTimeoutRef = useRef<number | null>(null);
  const cabTimeoutRef  = useRef<number | null>(null);

  const [snap, setSnap] = useState({
    x: 281, y: 0,
    anim: 'idle' as DogState, animKey: 0,
    facing: false, jumpFrame: 0,
    sofaWear: 0,
    vaseStage: 'intact' as VaseStage,
    cabStage:  'intact' as CabStage,
    platformId: null as string | null,
  });

  useEffect(() => { containerRef.current?.focus(); }, []);

  // ── CSS transition triggers ───────────────────────────────────────────────
  const [vaseDropped, setVaseDropped] = useState(false);
  useEffect(() => {
    if (snap.vaseStage !== 'falling') return;
    setVaseDropped(false);
    const raf = requestAnimationFrame(() => setVaseDropped(true));
    return () => cancelAnimationFrame(raf);
  }, [snap.vaseStage]);

  const [cabItemsDropped, setCabItemsDropped] = useState(false);
  useEffect(() => {
    if (snap.cabStage !== 'falling') return;
    setCabItemsDropped(false);
    const raf = requestAnimationFrame(() => setCabItemsDropped(true));
    return () => cancelAnimationFrame(raf);
  }, [snap.cabStage]);

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

    const trashCabinet = () => {
      const p = phys.current;
      if (p.cabStage !== 'intact') return;
      p.cabStage = 'falling';
      if (cabTimeoutRef.current) clearTimeout(cabTimeoutRef.current);
      cabTimeoutRef.current = window.setTimeout(() => {
        phys.current.cabStage = 'trashed';
        setSnap(s => ({ ...s, cabStage: 'trashed' }));
      }, 700);
    };

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 16.66, 2.5);
      last = now;
      const p = phys.current;
      const aHeld = heldKeys.current.has('KeyA');
      const dHeld = heldKeys.current.has('KeyD');

      // ── Horizontal movement ───────────────────────────────────────────────
      if (dHeld && !aHeld) {
        p.x = Math.min(p.x + RUN_PX_FPS * dt, WORLD_W - 50);
        p.facing = false;
        if (!p.isAirborne) setAnim('run');
      } else if (aHeld && !dHeld) {
        p.x = Math.max(p.x - RUN_PX_FPS * dt, 50);
        p.facing = true;
        if (!p.isAirborne) setAnim('run');
      }

      // ── Book wall: block rightward movement at floor level ────────────────
      if (p.y < CAB_BOOK_A_SURF_Y - 10 && p.x > BOOK_WALL_X - 30) {
        p.x = BOOK_WALL_X - 30;
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
              if (pl.id === 'cab-top' || pl.id === 'cab-soundbar') trashCabinet();
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
        if (!onSurface) { p.isAirborne = true; p.platformId = null; }
        else { p.platformId = currentPlatformId; }

        if (p.anim === 'run' && (currentPlatformId === 'sofa' || currentPlatformId === 'sofa-back')) {
          p.sofaRunMs += dt * 16.66;
          if (p.sofaRunMs > 1500) { p.sofaRunMs = 0; bumpSofaWear(); }
        } else {
          p.sofaRunMs = 0;
        }

        if (currentPlatformId === 'table') breakVase();
        if (currentPlatformId === 'cab-top' || currentPlatformId === 'cab-soundbar') trashCabinet();
      }

      setSnap({
        x: p.x, y: p.y, anim: p.anim, animKey: p.animKey, facing: p.facing,
        jumpFrame: p.jumpFrame, sofaWear: p.sofaWear,
        vaseStage: p.vaseStage, cabStage: p.cabStage,
        platformId: p.platformId,
      });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      if (landTimeoutRef.current) clearTimeout(landTimeoutRef.current);
      if (vaseTimeoutRef.current) clearTimeout(vaseTimeoutRef.current);
      if (cabTimeoutRef.current)  clearTimeout(cabTimeoutRef.current);
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
      p.anim = held ? 'run' : 'idle'; p.animKey++;
      setSnap(s => ({ ...s, anim: p.anim, animKey: p.animKey }));
    }
  }, []);

  // ── Camera ────────────────────────────────────────────────────────────────
  const cameraX = Math.max(0, Math.min(snap.x - VIEWPORT_W / 2, WORLD_W - VIEWPORT_W));

  // ── Shadow ────────────────────────────────────────────────────────────────
  const shadowY = (() => {
    let best = 0;
    for (const pl of PLATFORMS) {
      if (pl.surfaceY <= snap.y + 1) {
        const px1 = pl.x1 - EDGE_TOL, px2 = pl.x2 + EDGE_TOL;
        if (snap.x >= px1 && snap.x <= px2 && pl.surfaceY > best) best = pl.surfaceY;
      }
    }
    return best;
  })();
  const shadowDist    = snap.y - shadowY;
  const shadowScale   = Math.max(0.3, 1 - shadowDist / 300);
  const shadowOpacity = Math.max(0.15, 0.6 - shadowDist / 280);
  const platformOffset = snap.platformId === 'sofa' ? 40 : 0;

  // ── Cabinet image to show ─────────────────────────────────────────────────
  const cabinetImg = snap.cabStage === 'intact' ? cabinetIntactImg : cabinetDamagedImg;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      className="relative w-full h-full overflow-hidden select-none outline-none"
    >
      {/* ══ WORLD ══════════════════════════════════════════════════════════════ */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0,
        width: WORLD_W,
        transform: `translateX(${-cameraX}px)`,
        willChange: 'transform',
      }}>

        {/* ── Background ───────────────────────────────────────────────────── */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url(${roomBg})`,
          backgroundSize: `${VIEWPORT_W}px 100%`,
          backgroundRepeat: 'repeat-x',
          backgroundPosition: 'left bottom',
        }} />

        {/* ── Sofa ─────────────────────────────────────────────────────────── */}
        <img src={SOFA_IMAGES[snap.sofaWear]} alt="" draggable={false}
          style={{ position: 'absolute', left: SOFA_X, height: SOFA_H, width: 'auto', bottom: FLOOR_H, pointerEvents: 'none', userSelect: 'none' }}
        />

        {/* ── Table ────────────────────────────────────────────────────────── */}
        <img src={tableImg} alt="" draggable={false}
          style={{ position: 'absolute', left: TABLE_X1_PX, height: TABLE_H, width: 'auto', bottom: FLOOR_H, pointerEvents: 'none', userSelect: 'none' }}
        />

        {/* ── Vase (intact) ────────────────────────────────────────────────── */}
        {snap.vaseStage === 'intact' && (
          <img src={vaseIntact} alt="" draggable={false}
            style={{ position: 'absolute', left: TABLE_CTR_PX, height: 180, width: 'auto', bottom: FLOOR_H + (TABLE_H - 2), transform: 'translateX(-50%)', pointerEvents: 'none', userSelect: 'none' }}
          />
        )}
        {/* ── Vase (falling) ───────────────────────────────────────────────── */}
        {snap.vaseStage === 'falling' && (
          <img src={vaseFalling} alt="" draggable={false}
            style={{
              position: 'absolute', left: TABLE_CTR_PX, height: 180, width: 'auto',
              bottom: vaseDropped ? FLOOR_H : FLOOR_H + (TABLE_H - 2),
              transition: 'bottom 0.45s cubic-bezier(0.5,0,1,1), transform 0.45s ease-in',
              transform: vaseDropped ? 'translateX(-50%) rotate(85deg)' : 'translateX(-50%) rotate(15deg)',
              pointerEvents: 'none', userSelect: 'none',
            }}
          />
        )}
        {/* ── Vase (broken) ────────────────────────────────────────────────── */}
        {snap.vaseStage === 'broken' && (
          <img src={vaseBroken} alt="" draggable={false}
            style={{ position: 'absolute', zIndex: 25, left: TABLE_CTR_PX, height: 180, width: 'auto', bottom: FLOOR_H - 12 - 80, transform: 'translateX(-50%)', pointerEvents: 'none', userSelect: 'none' }}
          />
        )}

        {/* ══ TV CABINET ═════════════════════════════════════════════════════ */}

        {/* ── Book ledge (obstacle + platform) ─────────────────────────────── */}
        <img src={bookLedgeImg} alt="" draggable={false}
          style={{
            position: 'absolute',
            left: CAB_BOOK_A_LEFT, height: CAB_BOOK_H, width: 'auto',
            // bottom: books sit at floor level (top = CAB_BOOK_A_SURF_Y above floor)
            bottom: FLOOR_H + CAB_BOOK_A_SURF_Y - CAB_BOOK_H,
            pointerEvents: 'none', userSelect: 'none',
          }}
        />

        {/* ── Cabinet body (swaps to damaged when dog climbs it) ────────────── */}
        <img src={cabinetImg} alt="" draggable={false}
          style={{ position: 'absolute', left: CABINET_X, height: CABINET_H, width: 'auto', bottom: CAB_BOT_CSS, pointerEvents: 'none', userSelect: 'none' }}
        />

        {/* ── TV — bottom flush with cabinet top ───────────────────────────── */}
        <img src={tvScreenImg} alt="" draggable={false}
          style={{ position: 'absolute', left: CAB_TV_LEFT, height: CAB_TV_H, width: CAB_TV_W, bottom: CAB_TOP_CSS, pointerEvents: 'none', userSelect: 'none' }}
        />

        {/* ── Soundbar — sits on cabinet top ───────────────────────────────── */}
        <img src={soundbarImg} alt="" draggable={false}
          style={{ position: 'absolute', left: CAB_SB_LEFT, height: CAB_SB_H, width: CAB_SB_W, bottom: CAB_TOP_CSS, pointerEvents: 'none', userSelect: 'none' }}
        />

        {/* ── Decorative boxes — on cabinet top right ───────────────────────── */}
        <img src={decoBoxesImg} alt="" draggable={false}
          style={{ position: 'absolute', left: CAB_DECO_LEFT, height: CAB_DECO_H, width: 'auto', bottom: CAB_TOP_CSS, pointerEvents: 'none', userSelect: 'none' }}
        />

        {/* ══ CABINET FALLING ITEMS ══════════════════════════════════════════ */}

        {/* ── Photo frame 1 ────────────────────────────────────────────────── */}
        {snap.cabStage === 'falling' && (
          <img src={frame1FallingImg} alt="" draggable={false}
            style={{
              position: 'absolute', left: CAB_ITEM_FRAME1_X, height: 140, width: 'auto',
              bottom: cabItemsDropped ? CAB_ITEM_END_CSS : CAB_ITEM_START_CSS,
              transition: 'bottom 0.55s cubic-bezier(0.4,0,1,1), transform 0.55s ease-in',
              transform: cabItemsDropped ? 'rotate(-80deg) translateX(-20px)' : 'rotate(-10deg)',
              pointerEvents: 'none', userSelect: 'none', zIndex: 22,
            }}
          />
        )}
        {/* ── Photo frame 2 ────────────────────────────────────────────────── */}
        {snap.cabStage === 'falling' && (
          <img src={frame2FallingImg} alt="" draggable={false}
            style={{
              position: 'absolute', left: CAB_ITEM_FRAME2_X, height: 130, width: 'auto',
              bottom: cabItemsDropped ? CAB_ITEM_END_CSS : CAB_ITEM_START_CSS + 30,
              transition: 'bottom 0.6s 0.05s cubic-bezier(0.4,0,1,1), transform 0.6s 0.05s ease-in',
              transform: cabItemsDropped ? 'rotate(75deg) translateX(15px)' : 'rotate(8deg)',
              pointerEvents: 'none', userSelect: 'none', zIndex: 22,
            }}
          />
        )}
        {/* ── Remote ───────────────────────────────────────────────────────── */}
        {snap.cabStage === 'falling' && (
          <img src={remoteFallingImg} alt="" draggable={false}
            style={{
              position: 'absolute', left: CAB_ITEM_REMOTE_X, height: 100, width: 'auto',
              bottom: cabItemsDropped ? CAB_ITEM_END_CSS : CAB_ITEM_START_CSS + 10,
              transition: 'bottom 0.5s 0.08s cubic-bezier(0.4,0,1,1), transform 0.5s 0.08s ease-in',
              transform: cabItemsDropped ? 'rotate(110deg)' : 'rotate(-5deg)',
              pointerEvents: 'none', userSelect: 'none', zIndex: 22,
            }}
          />
        )}
        {/* ── Plant pot ────────────────────────────────────────────────────── */}
        {snap.cabStage === 'falling' && (
          <img src={potFallingImg} alt="" draggable={false}
            style={{
              position: 'absolute', left: CAB_ITEM_POT_X, height: 120, width: 'auto',
              bottom: cabItemsDropped ? CAB_ITEM_END_CSS : CAB_ITEM_START_CSS + 20,
              transition: 'bottom 0.58s 0.03s cubic-bezier(0.4,0,1,1), transform 0.58s 0.03s ease-in',
              transform: cabItemsDropped ? 'rotate(-95deg) translateX(-10px)' : 'rotate(5deg)',
              pointerEvents: 'none', userSelect: 'none', zIndex: 22,
            }}
          />
        )}

        {/* ── Broken items on floor (after fall) ───────────────────────────── */}
        {snap.cabStage === 'trashed' && (
          <>
            <img src={framesBrokenImg} alt="" draggable={false}
              style={{ position: 'absolute', left: CAB_ITEM_FRAME1_X - 20, height: 110, width: 'auto', bottom: FLOOR_H - 30, pointerEvents: 'none', userSelect: 'none', zIndex: 22 }}
            />
            <img src={remoteBrokenImg} alt="" draggable={false}
              style={{ position: 'absolute', left: CAB_ITEM_REMOTE_X + 10, height: 80, width: 'auto', bottom: FLOOR_H - 20, pointerEvents: 'none', userSelect: 'none', zIndex: 22 }}
            />
            <img src={potBrokenImg} alt="" draggable={false}
              style={{ position: 'absolute', left: CAB_ITEM_POT_X - 10, height: 100, width: 'auto', bottom: FLOOR_H - 25, pointerEvents: 'none', userSelect: 'none', zIndex: 22 }}
            />
          </>
        )}

        {/* ── Dog shadow ───────────────────────────────────────────────────── */}
        <div style={{
          position: 'absolute', left: snap.x,
          bottom: FLOOR_H + shadowY + 2 - 20 - platformOffset,
          transform: `translateX(-50%) scaleX(${shadowScale})`,
          width: 130, height: 14,
          background: 'rgba(0,0,0,0.22)', borderRadius: '50%',
          opacity: shadowOpacity, zIndex: 18,
        }} />

        {/* ── Dog ──────────────────────────────────────────────────────────── */}
        <div style={{
          position: 'absolute', left: snap.x,
          bottom: FLOOR_H + snap.y - 20 - platformOffset,
          transform: `translateX(-50%) scaleX(${snap.facing ? -1 : 1})`,
          zIndex: 20,
        }}>
          <Sprite state={snap.anim} animKey={snap.animKey} jumpFrame={snap.jumpFrame} onComplete={onAnimComplete} />
        </div>

      </div>{/* end world */}

      {/* ══ HUD ════════════════════════════════════════════════════════════════ */}
      <div style={{ position: 'absolute', bottom: 16, left: 0, right: 0, zIndex: 50, display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, padding: '10px 20px', borderRadius: 18, background: 'rgba(80,50,30,0.22)', backdropFilter: 'blur(6px)' }}>
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
        width: label === 'TAB' ? 72 : 30, height: label === 'TAB' ? 26 : 30,
        background: active ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.18)',
        border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8,
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
