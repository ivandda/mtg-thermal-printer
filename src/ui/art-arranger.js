/** @import { Arrangement, Point } from "../imaging/arrangement.js" */
import { clampArrangement, moveArrangement, zoomArrangement } from "../imaging/arrangement.js";
import { element } from "./dom.js";

const WHEEL_ZOOM = 0.002;
const KEY_ZOOM = 1.1;
/** How far an arrow key moves the image, as a fraction of the box's width. */
const KEY_STEP = 0.02;

/** @typedef {{ x: number, y: number, width: number, height: number }} Rect */

/**
 * @typedef {object} ArrangeTarget
 * @property {{ width: number, height: number }} page  The label, in dots.
 * @property {Rect} box  The image's box on the label.
 * @property {{ width: number, height: number }} image
 * @property {Arrangement} arrangement
 */

/**
 * Moving and zooming an image in its box, right on the label preview: drag it, pinch or scroll
 * over it, or use the arrow keys and + and −. The Fill/Fit choice and the zoom slider do the same.
 * @param {object} options
 * @param {HTMLCanvasElement} options.canvas  The label preview.
 * @param {() => ArrangeTarget | undefined} options.target  What can be arranged now, if anything.
 * @param {(arrangement: Arrangement) => void} options.onArrange
 */
export function bindArtArranger({ canvas, target, onArrange }) {
  const zoom = element("#zoom", HTMLInputElement);
  const fill = element('input[name="fit"][value="fill"]', HTMLInputElement);
  const fit = element('input[name="fit"][value="fit"]', HTMLInputElement);
  /** Pointers pressed on the image, at their last position on the label. @type {Map<number, Point>} */
  const pointers = new Map();

  /**
   * Where a pointer is on the label, in dots.
   * @param {MouseEvent} event
   * @param {ArrangeTarget} current
   */
  const onLabel = (event, { page }) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * page.width) / rect.width,
      y: ((event.clientY - rect.top) * page.height) / rect.height,
    };
  };

  canvas.addEventListener("pointerdown", (event) => {
    const current = target();
    if (!current) return;
    const point = onLabel(event, current);
    if (!inside(point, current.box)) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, point);
  });

  canvas.addEventListener("pointermove", (event) => {
    const current = target();
    const last = pointers.get(event.pointerId);
    if (!current || !last) return;
    const point = onLabel(event, current);
    const { arrangement, image, box } = current;
    const other = [...pointers].find(([id]) => id !== event.pointerId)?.[1];
    if (other) {
      // Pinch: zoom by how far the fingers spread, around the point between them.
      const spread = distance(point, other) / (distance(last, other) || 1);
      const between = inBox({ x: (point.x + other.x) / 2, y: (point.y + other.y) / 2 }, box);
      arrange(zoomArrangement(arrangement, arrangement.zoom * spread, between, image, box));
    } else {
      arrange(moveArrangement(arrangement, point.x - last.x, point.y - last.y, image, box));
    }
    pointers.set(event.pointerId, point);
  });

  for (const type of /** @type {const} */ (["pointerup", "pointercancel"])) {
    canvas.addEventListener(type, (event) => pointers.delete(event.pointerId));
  }

  canvas.addEventListener(
    "wheel",
    (event) => {
      const current = target();
      if (!current) return;
      const point = onLabel(event, current);
      if (!inside(point, current.box)) return;
      event.preventDefault();
      const { arrangement, image, box } = current;
      const zoomed = arrangement.zoom * Math.exp(-event.deltaY * WHEEL_ZOOM);
      arrange(zoomArrangement(arrangement, zoomed, inBox(point, box), image, box));
    },
    { passive: false },
  );

  canvas.addEventListener("keydown", (event) => {
    const current = target();
    if (!current) return;
    const { arrangement, image, box } = current;
    const step = box.width * KEY_STEP * (event.shiftKey ? 5 : 1);
    const center = { x: box.width / 2, y: box.height / 2 };
    /** @type {Record<string, [number, number]>} */
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = moves[event.key];
    if (move) arrange(moveArrangement(arrangement, move[0], move[1], image, box));
    else if (event.key === "+" || event.key === "=") {
      arrange(zoomArrangement(arrangement, arrangement.zoom * KEY_ZOOM, center, image, box));
    } else if (event.key === "-") {
      arrange(zoomArrangement(arrangement, arrangement.zoom / KEY_ZOOM, center, image, box));
    } else return;
    event.preventDefault();
  });

  zoom.addEventListener("input", () => {
    const current = target();
    if (!current) return;
    const { arrangement, image, box } = current;
    const center = { x: box.width / 2, y: box.height / 2 };
    arrange(zoomArrangement(arrangement, Number(zoom.value), center, image, box));
  });

  for (const input of [fill, fit]) {
    input.addEventListener("change", () => {
      const current = target();
      if (!current) return;
      const fitChoice = fit.checked ? "fit" : "fill";
      arrange(
        clampArrangement({ ...current.arrangement, fit: fitChoice, zoom: 1 }, current.image, current.box),
      );
    });
  }

  /** @param {Arrangement} arrangement */
  function arrange(arrangement) {
    sync(arrangement);
    onArrange(arrangement);
  }

  /**
   * Shows an arrangement in the Fill/Fit choice and the zoom slider.
   * @param {Arrangement} arrangement
   */
  function sync(arrangement) {
    zoom.value = String(arrangement.zoom);
    fill.checked = arrangement.fit === "fill";
    fit.checked = arrangement.fit === "fit";
  }

  return { sync };
}

/**
 * @param {Point} point
 * @param {Rect} box
 */
const inside = (point, box) =>
  point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;

/**
 * A point on the label, relative to the box.
 * @param {Point} point
 * @param {Rect} box
 */
const inBox = (point, box) => ({ x: point.x - box.x, y: point.y - box.y });

/**
 * @param {Point} a
 * @param {Point} b
 */
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
