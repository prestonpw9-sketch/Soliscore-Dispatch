/**
 * Pixel-grid snapping for canvas strokes.
 *
 * Canvas strokes are centered on the path. A 1px stroke at x=100 covers
 * 99.5–100.5 and smears across two pixels. Snapping odd-width strokes to
 * *.5 (and even-width to integers) in *device* pixels, then converting back
 * to user space, is the 0.5px shift trick done correctly under any transform.
 */

export function snapPoint(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  lineWidth = 1,
): { x: number; y: number } {
  return snapDevice(ctx, x, y, lineWidth, false);
}

/** Image/fill dest: always integer device pixels (no 0.5 offset). */
export function snapImagePoint(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
): { x: number; y: number } {
  return snapDevice(ctx, x, y, 1, true);
}

export function snapImageRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): { x: number; y: number; w: number; h: number } {
  const a = snapImagePoint(ctx, x, y);
  const b = snapImagePoint(ctx, x + w, y + h);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

function snapDevice(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  lineWidth: number,
  integerPixels: boolean,
): { x: number; y: number } {
  const t = ctx.getTransform();
  const scale = Math.min(Math.hypot(t.a, t.b) || 1, Math.hypot(t.c, t.d) || 1);
  const lwDev = Math.max(1, Math.round(Math.abs(lineWidth) * scale));
  const odd = !integerPixels && lwDev % 2 === 1;
  const snapD = (d: number) => (odd ? Math.floor(d) + 0.5 : Math.round(d));
  const dx = snapD(t.a * x + t.c * y + t.e);
  const dy = snapD(t.b * x + t.d * y + t.f);
  const det = t.a * t.d - t.b * t.c;
  if (Math.abs(det) < 1e-12) return { x, y };
  return {
    x: (t.d * (dx - t.e) - t.c * (dy - t.f)) / det,
    y: (-t.b * (dx - t.e) + t.a * (dy - t.f)) / det,
  };
}

/**
 * Snap straight-path primitives so PDF.js / markup strokes land on pixel
 * centers. Curves are left alone so control points don't kink.
 */
export function installPathPixelSnap(ctx: CanvasRenderingContext2D): void {
  const moveTo = ctx.moveTo.bind(ctx);
  const lineTo = ctx.lineTo.bind(ctx);
  const rect = ctx.rect.bind(ctx);
  const strokeRect = ctx.strokeRect.bind(ctx);

  ctx.moveTo = (x: number, y: number) => {
    const p = snapPoint(ctx, x, y, ctx.lineWidth);
    moveTo(p.x, p.y);
  };
  ctx.lineTo = (x: number, y: number) => {
    const p = snapPoint(ctx, x, y, ctx.lineWidth);
    lineTo(p.x, p.y);
  };
  ctx.rect = (x: number, y: number, w: number, h: number) => {
    const a = snapPoint(ctx, x, y, ctx.lineWidth);
    const b = snapPoint(ctx, x + w, y + h, ctx.lineWidth);
    rect(a.x, a.y, b.x - a.x, b.y - a.y);
  };
  ctx.strokeRect = (x: number, y: number, w: number, h: number) => {
    const a = snapPoint(ctx, x, y, ctx.lineWidth);
    const b = snapPoint(ctx, x + w, y + h, ctx.lineWidth);
    strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  };
}
