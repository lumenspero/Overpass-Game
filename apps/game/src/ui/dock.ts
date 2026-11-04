import type { SimState } from '@overpass-game/sim';
import { dockItems, type DockId, type DockItem } from './dock-model.ts';
import { OFFER_ICONS, svgIcon, TILE_ICON } from './offer-icons.ts';

/**
 * The inventory dock (spec: Upgrades). Collapsed, it is a single transparent dot at the bottom
 * centre. Hovering that wide zone, or swiping down on it, opens the row of items: upgrades on
 * either side and the road-tile stack in the middle. Tapping an item with stock picks it up for
 * placement. The dock is hidden while a weekly choice waits, and once the game is over.
 */

export interface Dock {
  sync(): void;
  destroy(): void;
}

export interface DockOptions {
  getSim(): SimState;
  /** The tool currently picked, so the armed item can be marked. */
  getArmed(): string;
  /** A tap on an item with stock picks it up. */
  onArm(id: DockId): void;
  /** A press that moves picks the item up as a drag; the scene follows the pointer. */
  onDragStart(id: DockId): void;
  onDragMove(x: number, y: number): void;
  /** Released. x and y are -1 when the drag was cancelled. */
  onDragEnd(x: number, y: number): void;
  /** On-screen width of one road tile, so a dragged piece can be drawn at half of it. */
  getTilePx(): number;
}

const CREAM = '#f2efe8';
const INK = '#1d222a';
const EMPTY_DISC = '#4a505b';
const EMPTY_INK = '#8a909a';
const SWIPE_PX = 24;
const DRAG_PX = 8;

const ICON_FOR: Record<DockId, string> = {
  roundabout: OFFER_ICONS.roundabout,
  motorway: OFFER_ICONS.motorway,
  light: OFFER_ICONS.lights,
  tiles: TILE_ICON,
  bridge: OFFER_ICONS.bridge,
  tunnel: OFFER_ICONS.tunnel,
};

function el(tag: string, css: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.style.cssText = css;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createDock(opts: DockOptions): Dock {
  const root = el(
    'div',
    'position:fixed;left:50%;bottom:calc(6px + env(safe-area-inset-bottom, 0px));' +
      'transform:translateX(-50%);z-index:20;display:flex;flex-direction:column;' +
      'align-items:center;font-family:Helvetica,Arial,sans-serif;color:' +
      CREAM +
      ';',
  );
  root.id = 'inventory-dock';

  const panel = el(
    'div',
    'display:flex;align-items:center;gap:10px;padding:0;margin-bottom:6px;' +
      'touch-action:pan-y;',
  );

  const zone = el(
    'div',
    'width:220px;height:44px;display:flex;align-items:flex-end;justify-content:center;' +
      'pointer-events:auto;touch-action:none;',
  );
  const dot = el(
    'div',
    'width:10px;height:10px;margin-bottom:6px;border-radius:50%;background:rgba(242,239,232,0.6);',
  );
  zone.append(dot);
  root.append(panel, zone);
  document.body.append(root);

  let expanded = false;
  let drag: {
    id: DockId;
    pointerId: number;
    x0: number;
    y0: number;
    moved: boolean;
  } | null = null;
  let ghost: HTMLElement | null = null;
  // After a drag the browser may still fire a click on the item; it must not arm the tool again.
  let suppressClick = false;
  let shownKey: string | null = null;
  let touchStartY: number | null = null;

  const setExpanded = (value: boolean): void => {
    if (expanded === value) return;
    expanded = value;
    shownKey = null;
    sync();
  };

  const itemButton = (item: DockItem, armed: boolean): HTMLElement => {
    const interactive = item.armable;
    const wrap = el(
      interactive ? 'button' : 'div',
      'position:relative;background:none;border:0;padding:0;font:inherit;color:inherit;' +
        'display:flex;flex-direction:column;align-items:center;' +
        (interactive ? 'cursor:pointer;touch-action:manipulation;' : ''),
    );
    if (interactive) wrap.setAttribute('type', 'button');
    const big = item.id === 'tiles';
    const size = big ? 64 : 48;
    const disc = el(
      'div',
      `width:${size}px;height:${size}px;border-radius:50%;box-sizing:border-box;` +
        `display:flex;align-items:center;justify-content:center;` +
        `background:${item.enabled ? CREAM : EMPTY_DISC};` +
        `color:${item.enabled ? INK : EMPTY_INK};` +
        (armed ? `outline:3px solid ${CREAM};outline-offset:3px;` : ''),
    );
    disc.innerHTML = svgIcon(ICON_FOR[item.id], big ? 32 : 24);
    wrap.append(disc);
    const pill = el(
      'div',
      `position:absolute;right:-4px;top:-4px;min-width:22px;height:22px;box-sizing:border-box;` +
        `border-radius:11px;background:${INK};color:${CREAM};font-weight:700;font-size:12px;` +
        'display:flex;align-items:center;justify-content:center;padding:0 6px;',
      String(item.count),
    );
    wrap.append(pill);
    wrap.setAttribute(
      'aria-label',
      `${item.label}, ${item.count}${item.id === 'tiles' ? ' road tiles' : ' in stock'}`,
    );
    if (interactive) {
      wrap.addEventListener('pointerdown', (e) => startDrag(e, item.id));
      wrap.addEventListener('click', () => {
        if (suppressClick) return;
        opts.onArm(item.id);
        shownKey = null;
        sync();
      });
    }
    return wrap;
  };

  // The row slides up from the bottom edge of the screen when it opens, and back down when it
  // closes. It stays mounted while it moves. Reduced motion makes the move instant.
  let panelOpen: boolean | null = null;
  const SLIDE_MS = 280;
  const reduceMotion =
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;
  // One row-height plus the zone beneath it, so the row starts fully below the screen.
  const BELOW =
    'transform:translateY(calc(100% + 60px));visibility:hidden;pointer-events:none;';
  const ABOVE =
    'transform:translateY(0);visibility:visible;pointer-events:auto;';
  function applyPanelState(): void {
    if (panelOpen === expanded) return;
    panelOpen = expanded;
    const ms = reduceMotion ? 0 : SLIDE_MS;
    panel.style.cssText =
      'display:flex;align-items:center;gap:10px;padding:0;margin-bottom:6px;touch-action:pan-y;' +
      `transition:transform ${ms}ms cubic-bezier(.2,.7,.2,1),visibility ${ms}ms;` +
      (expanded ? ABOVE : BELOW);
  }

  function showGhost(id: DockId, x: number, y: number): void {
    // Half a road tile across, so the drop lands on the tile the player means.
    const size = Math.max(10, opts.getTilePx() / 2);
    ghost = el(
      'div',
      `position:fixed;left:${x}px;top:${y}px;width:${size}px;height:${size}px;transform:translate(-50%,-50%);` +
        `border-radius:50%;background:${CREAM};color:${INK};display:flex;align-items:center;` +
        'justify-content:center;pointer-events:none;z-index:40;box-shadow:0 4px 14px rgba(0,0,0,0.35);',
    );
    ghost.innerHTML = svgIcon(ICON_FOR[id], size);
    document.body.append(ghost);
  }

  function moveGhost(x: number, y: number): void {
    if (!ghost) return;
    ghost.style.left = `${x}px`;
    ghost.style.top = `${y}px`;
  }

  function endDrag(): void {
    ghost?.remove();
    ghost = null;
    drag = null;
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragUp);
    window.removeEventListener('pointercancel', onDragCancel);
  }

  function startDrag(e: PointerEvent, id: DockId): void {
    if (e.button !== 0) return;
    drag = {
      id,
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      moved: false,
    };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragUp);
    window.addEventListener('pointercancel', onDragCancel);
  }

  function onDragMove(e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < DRAG_PX)
        return;
      drag.moved = true;
      showGhost(drag.id, e.clientX, e.clientY);
      opts.onDragStart(drag.id);
    }
    moveGhost(e.clientX, e.clientY);
    opts.onDragMove(e.clientX, e.clientY);
  }

  function onDragUp(e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const moved = drag.moved;
    endDrag();
    if (moved) {
      suppressClick = true;
      setTimeout(() => {
        suppressClick = false;
      }, 0);
      opts.onDragEnd(e.clientX, e.clientY);
      shownKey = null;
      sync();
    }
  }

  function onDragCancel(): void {
    if (!drag) return;
    const moved = drag.moved;
    endDrag();
    if (moved) opts.onDragEnd(-1, -1);
  }

  function sync(): void {
    const sim = opts.getSim();
    const hiddenNow = sim.offers.length > 0 || sim.over !== null;
    root.style.display = hiddenNow ? 'none' : 'flex';
    if (hiddenNow) return;

    const items = dockItems(sim.stock, sim.budget, sim.unlocked).filter(
      (i) => i.shown,
    );
    const armed = opts.getArmed();
    const armedId = armed;
    const key = `${expanded}:${items.map((i) => `${i.id}${i.count}`).join(',')}:${armedId}`;
    if (key === shownKey) return;
    shownKey = key;

    applyPanelState();
    if (!expanded) return;
    panel.replaceChildren();
    const upgrades = items.filter((i) => i.id !== 'tiles');
    const left = upgrades.filter((i) =>
      ['roundabout', 'motorway', 'light'].includes(i.id),
    );
    const right = upgrades.filter((i) => !left.includes(i));
    const tiles = items.find((i) => i.id === 'tiles');
    for (const item of left)
      panel.append(itemButton(item, item.id === armedId));
    if (tiles) panel.append(itemButton(tiles, false));
    for (const item of right)
      panel.append(itemButton(item, item.id === armedId));
  }

  // Mouse: hovering the zone opens the row; leaving the dock closes it.
  zone.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse') setExpanded(true);
  });
  root.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') setExpanded(false);
  });

  // Touch: a downward swipe on the zone opens the row; an upward swipe on the row closes it.
  zone.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') touchStartY = e.clientY;
  });
  zone.addEventListener('pointermove', (e) => {
    if (touchStartY !== null && e.clientY - touchStartY > SWIPE_PX) {
      touchStartY = null;
      setExpanded(true);
    }
  });
  zone.addEventListener('pointerup', () => {
    touchStartY = null;
  });
  panel.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') touchStartY = e.clientY;
  });
  panel.addEventListener('pointermove', (e) => {
    if (touchStartY !== null && touchStartY - e.clientY > SWIPE_PX) {
      touchStartY = null;
      setExpanded(false);
    }
  });
  panel.addEventListener('pointerup', () => {
    touchStartY = null;
  });

  return {
    sync,
    destroy: () => root.remove(),
  };
}
