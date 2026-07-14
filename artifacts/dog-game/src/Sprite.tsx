/**
 * Sprite renderer for individual-frame PNG animations.
 *
 * Each animation is a set of separate PNG files (not a sprite sheet).
 * Frame dimensions and maxY (last row with alpha > 20 = feet position)
 * were measured directly from the PNG alpha channel.
 *
 * Alignment strategy
 * ──────────────────
 * • canvasH = max(frame.maxY) × SCALE   — tallest "feet" position across all frames
 * • canvasW = max(frame.w)   × SCALE
 * • Each frame <img> is positioned `absolute bottom:0 left:50% translateX(-50%)`
 *   inside the canvas.  Because the canvas bottom is pinned to the ground by the
 *   parent in DogScene, the dog's feet land on the ground whenever maxY equals
 *   the canvasH reference.  Frames where maxY is smaller (e.g. jump peak-frame)
 *   naturally appear in the air — the arc is encoded in the sprite geometry.
 */

import React, { useState, useEffect, useRef } from 'react';
import type { DogState } from './DogScene';

// ── IDLE (265×265, 4 frames) ─────────────────────────────────────────────────
import idle1 from '@assets/Idle_1.png';
import idle2 from '@assets/Idle_2.png';
import idle3 from '@assets/Idle_3.png';
import idle4 from '@assets/Idle_4.png';

// ── RUN (314×265, 4 frames — new sprites) ────────────────────────────────────
import run1 from '@assets/RUN_2_1783976179128.png';
import run2 from '@assets/RUN_3_1783976179130.png';
import run3 from '@assets/RUN_4_1783976179130.png';
import run4 from '@assets/RUN_5_1783976179131.png';

// ── JUMP (265×410, 4 frames — new sprites) ───────────────────────────────────
import jump1 from '@assets/JUMP_1_1783976524467.png';
import jump2 from '@assets/JUMP_2_1783976524466.png';
import jump3 from '@assets/JUMP_3_1783976524466.png';
import jump4 from '@assets/JUMP_4_1783976524464.png';

// ── SIT (265×281, 3 frames) ──────────────────────────────────────────────────
import sit1 from '@assets/SIT_1_1783989322970.png';
import sit2 from '@assets/SIT_2_1783989322972.png';
import sit3 from '@assets/SIT_3_1783989322972.png';

// ── BARK (265×265, 3 frames) ─────────────────────────────────────────────────
import bark1 from '@assets/BARK_1.png';
import bark2 from '@assets/BARK_2.png';
import bark3 from '@assets/BARK_3.png';

// ─────────────────────────────────────────────────────────────────────────────

const SCALE = 0.85;

interface FrameDef {
  url: string;
  w: number;   // natural PNG width  (px)
  h: number;   // natural PNG height (px)
  maxY: number; // last row with alpha — where the feet are in the original
}

interface AnimDef {
  frames: FrameDef[];
  fps: number;
  loop: boolean;
  /** After the last frame, hold the last frame instead of resetting */
  holdLast?: boolean;
}

// Alpha-channel measurements (from node script on the actual PNGs)
const ANIMS: Record<DogState, AnimDef> = {
  idle: {
    fps: 6,
    loop: true,
    frames: [
      { url: idle1, w: 265, h: 265, maxY: 260 },
      { url: idle2, w: 265, h: 265, maxY: 260 },
      { url: idle3, w: 265, h: 265, maxY: 261 },
      { url: idle4, w: 265, h: 265, maxY: 263 },
    ],
  },
  run: {
    fps: 12,
    loop: true,
    frames: [
      { url: run1, w: 314, h: 265, maxY: 216 },
      { url: run2, w: 314, h: 265, maxY: 244 },
      { url: run3, w: 314, h: 265, maxY: 244 },
      { url: run4, w: 314, h: 265, maxY: 226 },
    ],
  },
  jump: {
    fps: 8,
    loop: false,
    holdLast: false,
    frames: [
      { url: jump1, w: 265, h: 410, maxY: 409 },
      { url: jump2, w: 265, h: 410, maxY: 362 },
      { url: jump3, w: 265, h: 410, maxY: 276 }, // peak — dog is highest here
      { url: jump4, w: 265, h: 410, maxY: 397 },
    ],
  },
  sit: {
    fps: 4,
    loop: true,
    frames: [
      { url: sit1, w: 265, h: 281, maxY: 278 },
      { url: sit2, w: 265, h: 281, maxY: 279 },
      { url: sit3, w: 265, h: 281, maxY: 280 },
    ],
  },
  bark: {
    fps: 8,
    loop: false,
    frames: [
      { url: bark1, w: 265, h: 265, maxY: 264 },
      { url: bark2, w: 265, h: 265, maxY: 264 },
      { url: bark3, w: 265, h: 265, maxY: 264 },
    ],
  },
};

// Preload every frame across every animation once, up front, so switching
// state/frame never has to wait on a network fetch or first-paint decode —
// that stall is what shows up as a skipped/blank frame when actions change.
const ALL_FRAME_URLS = Array.from(
  new Set(Object.values(ANIMS).flatMap(a => a.frames.map(f => f.url))),
);
if (typeof window !== 'undefined') {
  ALL_FRAME_URLS.forEach(url => {
    const img = new window.Image();
    img.src = url;
  });
}

// ─────────────────────────────────────────────────────────────────────────────

interface SpriteProps {
  state: DogState;
  animKey: number;
  /** Called once when a non-looping animation completes its last frame */
  onComplete?: () => void;
  /**
   * For 'jump' only: externally-driven frame index (0-3), chosen by the
   * physics loop based on vertical velocity rather than a fixed timer —
   * launch → rise → fall (held) → landing.
   */
  jumpFrame?: number;
}

export default function Sprite({ state, animKey, onComplete, jumpFrame }: SpriteProps) {
  const cfg = ANIMS[state];
  const [frameIdx, setFrameIdx] = useState(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const isJump = state === 'jump';

  // Compute canvas dimensions from ALL frames of this animation
  const canvasMaxY = Math.max(...cfg.frames.map(f => f.maxY));
  const canvasMaxW = Math.max(...cfg.frames.map(f => f.w));
  const canvasH = Math.round(canvasMaxY * SCALE);
  const canvasW = Math.round(canvasMaxW * SCALE);

  // Reset frame index whenever the animation state or key changes
  useEffect(() => {
    setFrameIdx(0);
  }, [state, animKey]);

  // Frame-cycling interval — jump is driven externally by physics instead
  useEffect(() => {
    if (isJump) return;
    const interval = 1000 / cfg.fps;
    const id = setInterval(() => {
      setFrameIdx(prev => {
        const next = prev + 1;
        if (next >= cfg.frames.length) {
          if (cfg.loop) return 0;
          if (cfg.holdLast) return prev; // stay on last frame
          // animation done — fire callback and stay on last frame
          onCompleteRef.current?.();
          return prev;
        }
        return next;
      });
    }, interval);
    return () => clearInterval(id);
  }, [state, animKey, cfg.fps, cfg.frames.length, cfg.loop, cfg.holdLast, isJump]);

  const frame = isJump
    ? cfg.frames[jumpFrame ?? 0] ?? cfg.frames[0]
    : cfg.frames[frameIdx] ?? cfg.frames[cfg.frames.length - 1];
  const dispW = Math.round(frame.w * SCALE);
  const dispH = Math.round(frame.h * SCALE);

  return (
    // Outer canvas: fixed size per animation, bottom-anchored to ground by parent
    <div
      style={{
        position: 'relative',
        width:    `${canvasW}px`,
        height:   `${canvasH}px`,
        overflow: 'visible', // let tall jump frames poke upward
      }}
    >
      {/* Frame image: centred horizontally, pinned to canvas bottom.
          Keyed only by state (not frameIdx) so React reuses the same <img>
          node and just swaps `src` — remounting a fresh node every frame is
          what caused the visible skip/flicker when switching actions. */}
      <img
        key={state}
        src={frame.url}
        alt=""
        draggable={false}
        style={{
          position:        'absolute',
          bottom:          0,
          left:            '50%',
          transform:       'translateX(-50%)',
          width:           `${dispW}px`,
          height:          `${dispH}px`,
          imageRendering:  'auto',
          userSelect:      'none',
          pointerEvents:   'none',
        }}
      />
    </div>
  );
}
