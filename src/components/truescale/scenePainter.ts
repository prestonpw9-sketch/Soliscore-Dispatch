import {
  Calibration,
  Callout,
  DimLine,
  DrawLine,
  Pt,
  dimensionLabel,
  dist,
  midpoint,
} from '@/lib/truescale';

// Pure canvas painting for TrueScale, shared by the live canvas and PDF/print
// export. Everything here draws in "screen space" via a projection function so
// line weights, arrowheads, and labels stay a constant visual size.

export interface Preview {
  a: Pt;
  b: Pt;
  color: string;
  width: number;
  kind: 'calibrate' | 'dimension' | 'line' | 'callout';
}

export interface PaintOpts {
  base: HTMLCanvasElement | null;
  baseWidth: number;
  baseHeight: number;
  /** Maps a base-image point to device/screen coordinates. */
  project: (p: Pt) => Pt;
  /** Zoom used for the base image drawImage transform. */
  scale: number;
  offset: Pt;
  calibration: Calibration | null;
  dimensions: DimLine[];
  lines?: DrawLine[];
  callouts?: Callout[];
  selectedId: string | null;
  preview: Preview | null;
  /** Multiplies arrow/line/font sizing (1 for live view, larger for export). */
  sizeScale: number;
  /** Background fill for the whole surface. */
  background: string;
  /** When true, draw drag handles on the selected dimension (unlocked mode). */
  editable: boolean;
  /** When false, blit the overview bitmap with nearest-neighbor (crisp zoom). */
  smoothPlan?: boolean;
  /**
   * Vector-sharp PDF tile drawn in the same CSS-pixel space as annotations.
   * When `exact`, it matches the current view 1:1 and replaces the overview.
   */
  lens?: {
    canvas: HTMLCanvasElement;
    x: number;
    y: number;
    w: number;
    h: number;
    exact?: boolean;
  } | null;
}

const CAL_COLOR = '#22d3ee';

const HALO = 'rgba(255,255,255,0.92)';

function drawArrowLine(
  ctx: CanvasRenderingContext2D,
  a: Pt,
  b: Pt,
  color: string,
  width: number,
  sizeScale: number,
  dashed = false,
) {
  const head = 12 * sizeScale + width * 1.2;
  const angle = Math.atan2(b.y - a.y, b.x - a.x);

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // White casing beneath the shaft so lines read on dark plan linework.
  if (!dashed) {
    ctx.strokeStyle = HALO;
    ctx.lineWidth = width + 3 * sizeScale;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // Colored shaft
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (dashed) ctx.setLineDash([8 * sizeScale, 6 * sizeScale]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Filled + outlined arrowheads at BOTH ends, pointing outward.
  const drawHead = (tip: Pt, dir: number) => {
    const p1 = { x: tip.x - head * Math.cos(dir - Math.PI / 7), y: tip.y - head * Math.sin(dir - Math.PI / 7) };
    const p2 = { x: tip.x - head * Math.cos(dir + Math.PI / 7), y: tip.y - head * Math.sin(dir + Math.PI / 7) };
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = Math.max(1, sizeScale);
    ctx.strokeStyle = HALO;
    ctx.stroke();
  };
  drawHead(b, angle);
  drawHead(a, angle + Math.PI);
  ctx.restore();
}

function drawPlainLine(
  ctx: CanvasRenderingContext2D,
  a: Pt,
  b: Pt,
  color: string,
  width: number,
  sizeScale: number,
) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = HALO;
  ctx.lineWidth = width + 3 * sizeScale;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const paragraphs = (text || 'Note').split(/\n/);
  const out: string[] = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let cur = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = `${cur} ${words[i]}`;
      if (ctx.measureText(test).width > maxWidth) {
        out.push(cur);
        cur = words[i];
      } else {
        cur = test;
      }
    }
    out.push(cur);
  }
  return out.slice(0, 8);
}

export function calloutBubbleRect(
  ctx: CanvasRenderingContext2D,
  center: Pt,
  text: string,
  sizeScale: number,
): { x: number; y: number; w: number; h: number; lines: string[] } {
  const fontPx = 13 * sizeScale;
  ctx.save();
  ctx.font = `700 ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
  const maxW = 160 * sizeScale;
  const lines = wrapLines(ctx, text, maxW);
  let textW = 0;
  for (const ln of lines) textW = Math.max(textW, ctx.measureText(ln).width);
  ctx.restore();
  const padX = 8 * sizeScale;
  const padY = 6 * sizeScale;
  const w = Math.max(36 * sizeScale, textW + padX * 2);
  const h = Math.max(fontPx + padY * 2, lines.length * (fontPx + 3 * sizeScale) + padY * 2);
  return { x: center.x - w / 2, y: center.y - h / 2, w, h, lines };
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function leaderAnchor(box: { x: number; y: number; w: number; h: number }, tip: Pt, center: Pt): Pt {
  const dx = tip.x - center.x;
  const dy = tip.y - center.y;
  if (dx === 0 && dy === 0) return center;
  const t = Math.min(
    (box.w / 2) / (Math.abs(dx) || 1e-9),
    (box.h / 2) / (Math.abs(dy) || 1e-9),
  );
  return { x: center.x + dx * t, y: center.y + dy * t };
}

function drawCallout(
  ctx: CanvasRenderingContext2D,
  tip: Pt,
  bubble: Pt,
  text: string,
  color: string,
  width: number,
  sizeScale: number,
  selected: boolean,
) {
  const box = calloutBubbleRect(ctx, bubble, text, sizeScale);
  const start = leaderAnchor(box, tip, bubble);
  const head = 12 * sizeScale + width * 1.2;
  const angle = Math.atan2(tip.y - start.y, tip.x - start.x);

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.strokeStyle = HALO;
  ctx.lineWidth = width + 3 * sizeScale;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();
  ctx.strokeStyle = selected ? '#fbbf24' : color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();

  const p1 = { x: tip.x - head * Math.cos(angle - Math.PI / 7), y: tip.y - head * Math.sin(angle - Math.PI / 7) };
  const p2 = { x: tip.x - head * Math.cos(angle + Math.PI / 7), y: tip.y - head * Math.sin(angle + Math.PI / 7) };
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.closePath();
  ctx.fillStyle = selected ? '#fbbf24' : color;
  ctx.fill();
  ctx.lineWidth = Math.max(1, sizeScale);
  ctx.strokeStyle = HALO;
  ctx.stroke();

  const r = 8 * sizeScale;
  roundRectPath(ctx, box.x, box.y, box.w, box.h, r);
  ctx.fillStyle = 'rgba(15,23,42,0.94)';
  ctx.fill();
  ctx.lineWidth = selected ? 2.5 * sizeScale : 1.5 * sizeScale;
  ctx.strokeStyle = selected ? '#fbbf24' : color;
  ctx.stroke();

  const fontPx = 13 * sizeScale;
  ctx.font = `700 ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  const startY = bubble.y - ((box.lines.length - 1) * (fontPx + 3 * sizeScale)) / 2;
  box.lines.forEach((ln, i) => {
    ctx.fillText(ln, bubble.x, startY + i * (fontPx + 3 * sizeScale));
  });
  ctx.restore();
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  center: Pt,
  text: string,
  color: string,
  sizeScale: number,
) {
  const fontPx = 13 * sizeScale;
  ctx.save();
  ctx.font = `700 ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const padX = 6 * sizeScale;
  const padY = 4 * sizeScale;
  const metrics = ctx.measureText(text);
  const w = metrics.width + padX * 2;
  const h = fontPx + padY * 2;
  const x = center.x - w / 2;
  const y = center.y - h / 2;

  const r = 5 * sizeScale;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = 'rgba(15,23,42,0.9)';
  ctx.fill();
  ctx.lineWidth = 1.5 * sizeScale;
  ctx.strokeStyle = color;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, center.x, center.y);
  ctx.restore();
}

export function paintScene(ctx: CanvasRenderingContext2D, opts: PaintOpts) {
  const { base, baseWidth, baseHeight, project, scale, offset, sizeScale } = opts;

  // Surface background
  ctx.fillStyle = opts.background;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Overview bitmap — skipped when a 1:1 vector tile covers the view.
  if (base && !opts.lens?.exact) {
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);
    const smooth = opts.smoothPlan !== false;
    ctx.imageSmoothingEnabled = smooth;
    if (smooth) ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(base, 0, 0);
    ctx.restore();
  }

  if (opts.lens) {
    ctx.save();
    if (base) {
      ctx.beginPath();
      ctx.rect(offset.x, offset.y, baseWidth * scale, baseHeight * scale);
      ctx.clip();
    }
    ctx.imageSmoothingEnabled = !opts.lens.exact;
    ctx.drawImage(opts.lens.canvas, opts.lens.x, opts.lens.y, opts.lens.w, opts.lens.h);
    ctx.restore();
  }

  // Manual calibration reference line (cyan, dashed) — only when a line exists
  if (opts.calibration?.a && opts.calibration?.b) {
    const a = project(opts.calibration.a);
    const b = project(opts.calibration.b);
    drawArrowLine(ctx, a, b, CAL_COLOR, 2 * sizeScale, sizeScale, true);
    drawLabel(ctx, midpoint(a, b), 'SCALE', CAL_COLOR, sizeScale);
  }

  // Dimension lines
  for (const line of opts.dimensions) {
    const a = project(line.a);
    const b = project(line.b);
    const selected = line.id === opts.selectedId;
    if (selected) {
      drawArrowLine(ctx, a, b, '#fbbf24', (line.width + 3) * sizeScale, sizeScale);
    }
    drawArrowLine(ctx, a, b, line.color, line.width * sizeScale, sizeScale);
    if (dist(line.a, line.b) > 0) {
      drawLabel(ctx, midpoint(a, b), dimensionLabel(opts.calibration, line), line.color, sizeScale);
    }
    // Endpoint drag handles on the selected dimension when unlocked.
    if (selected && opts.editable) {
      const hs = 5 * sizeScale;
      for (const pt of [a, b]) {
        ctx.beginPath();
        ctx.rect(pt.x - hs, pt.y - hs, hs * 2, hs * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 2 * sizeScale;
        ctx.strokeStyle = '#2563eb';
        ctx.stroke();
      }
    }
  }

  for (const line of opts.lines ?? []) {
    const a = project(line.a);
    const b = project(line.b);
    const selected = line.id === opts.selectedId;
    if (selected) drawPlainLine(ctx, a, b, '#fbbf24', (line.width + 3) * sizeScale, sizeScale);
    drawPlainLine(ctx, a, b, line.color, line.width * sizeScale, sizeScale);
    if (selected && opts.editable) {
      const hs = 5 * sizeScale;
      for (const pt of [a, b]) {
        ctx.beginPath();
        ctx.rect(pt.x - hs, pt.y - hs, hs * 2, hs * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 2 * sizeScale;
        ctx.strokeStyle = '#2563eb';
        ctx.stroke();
      }
    }
  }

  for (const note of opts.callouts ?? []) {
    drawCallout(
      ctx,
      project(note.tip),
      project(note.bubble),
      note.text,
      note.color,
      note.width * sizeScale,
      sizeScale,
      note.id === opts.selectedId,
    );
    if (note.id === opts.selectedId && opts.editable) {
      const hs = 5 * sizeScale;
      for (const pt of [project(note.tip), project(note.bubble)]) {
        ctx.beginPath();
        ctx.rect(pt.x - hs, pt.y - hs, hs * 2, hs * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 2 * sizeScale;
        ctx.strokeStyle = '#2563eb';
        ctx.stroke();
      }
    }
  }

  // Live preview while placing (click-move-click or press-drag).
  if (opts.preview) {
    const a = project(opts.preview.a);
    const b = project(opts.preview.b);
    const color = opts.preview.kind === 'calibrate' ? CAL_COLOR : opts.preview.color;
    // Always mark the first click so click-to-place is visible before the
    // cursor moves (a === b has zero length, so the line itself is hidden).
    ctx.beginPath();
    ctx.arc(a.x, a.y, 5 * sizeScale, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2 * sizeScale;
    ctx.strokeStyle = color;
    ctx.stroke();
    if (dist(opts.preview.a, opts.preview.b) > 0) {
      if (opts.preview.kind === 'line') {
        drawPlainLine(ctx, a, b, color, opts.preview.width * sizeScale, sizeScale);
      } else if (opts.preview.kind === 'callout') {
        drawCallout(ctx, a, b, 'Note', color, opts.preview.width * sizeScale, sizeScale, false);
      } else {
        drawArrowLine(ctx, a, b, color, opts.preview.width * sizeScale, sizeScale, opts.preview.kind === 'calibrate');
        if (opts.preview.kind === 'dimension') {
          drawLabel(
            ctx,
            midpoint(a, b),
            dimensionLabel(opts.calibration, {
              id: 'preview',
              a: opts.preview.a,
              b: opts.preview.b,
              color: opts.preview.color,
              width: opts.preview.width,
            }),
            opts.preview.color,
            sizeScale,
          );
        }
      }
    }
  }
}
