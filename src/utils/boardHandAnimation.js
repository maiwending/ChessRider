import { useEffect, useMemo, useState } from 'react';

export const BOARD_HAND_TRAVEL_MS = 780;
export const BOARD_HAND_SETTLE_MS = 80;
export const BOARD_HAND_CAPTURE_THROW_DELAY_MS = 800;
export const BOARD_HAND_CAPTURE_THROW_MS = 580;
export const BOARD_HAND_TOTAL_MS = BOARD_HAND_TRAVEL_MS + BOARD_HAND_SETTLE_MS;
export const BOARD_HAND_CAPTURE_TOTAL_MS =
  BOARD_HAND_CAPTURE_THROW_DELAY_MS + BOARD_HAND_CAPTURE_THROW_MS + BOARD_HAND_SETTLE_MS;

const easeInOutCubic = (value) => (
  value < 0.5
    ? 4 * value ** 3
    : 1 - ((-2 * value + 2) ** 3) / 2
);

export function useBoardHandAnimation({ enabled, moveAnimation, moveFromCenter, moveToCenter }) {
  const [moveOverlayActive, setMoveOverlayActive] = useState(false);
  const [moveProgress, setMoveProgress] = useState(0);
  const [movePlaced, setMovePlaced] = useState(false);

  useEffect(() => {
    if (!(enabled && moveAnimation && moveFromCenter && moveToCenter)) {
      setMoveOverlayActive(false);
      setMoveProgress(0);
      setMovePlaced(false);
      return undefined;
    }

    setMoveOverlayActive(false);
    setMoveProgress(0);
    setMovePlaced(false);

    let frame = 0;
    let start = 0;

    const tick = (timestamp) => {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      const travelProgress = Math.min(elapsed / BOARD_HAND_TRAVEL_MS, 1);
      setMoveProgress(travelProgress);
      setMovePlaced(elapsed >= BOARD_HAND_TOTAL_MS);
      if (elapsed < BOARD_HAND_TOTAL_MS) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame((timestamp) => {
      setMoveOverlayActive(true);
      tick(timestamp);
    });

    return () => cancelAnimationFrame(frame);
  }, [enabled, moveAnimation, moveFromCenter, moveToCenter]);

  const currentMoveCenter = useMemo(() => {
    if (!moveFromCenter || !moveToCenter) return null;

    const startX = Number.parseFloat(moveFromCenter.x);
    const startY = Number.parseFloat(moveFromCenter.y);
    const endX = Number.parseFloat(moveToCenter.x);
    const endY = Number.parseFloat(moveToCenter.y);
    const eased = easeInOutCubic(moveProgress);
    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.hypot(dx, dy) || 1;
    const sway = Math.sin(eased * Math.PI) * Math.min(distance * 0.01, 0.28);
    const offsetX = (-dy / distance) * sway;
    const offsetY = (dx / distance) * sway;
    const lead = Math.sin(eased * Math.PI) * Math.min(distance * 0.018, 0.3);
    const leadX = (dx / distance) * lead;
    const leadY = (dy / distance) * lead;

    return {
      x: `${startX + dx * eased + offsetX + leadX}%`,
      y: `${startY + dy * eased + offsetY + leadY}%`,
      handTilt: -12 + eased * 14,
      pieceTilt: 0,
      pieceScale: 1,
      gripX: `${-5 + lead * 4}px`,
      gripY: '0px',
      lift: 0,
    };
  }, [moveFromCenter, moveProgress, moveToCenter]);

  return {
    moveOverlayActive,
    movePlaced,
    currentMoveCenter,
  };
}
