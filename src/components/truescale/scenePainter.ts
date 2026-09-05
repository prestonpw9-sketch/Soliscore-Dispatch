import {
  Calibration,
  DimLine,
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
  kind: 'calibrate' | 'dimension';
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
  selectedId: string | null;
  preview: Preview | null;
  /** Multiplies arrow/line/font sizing (1 for live view, larger for export). */
  sizeScale: number;
  /** Background fill for the whole surface. */
  background: string;
  /** When true, draw drag handles on the selected dimension (unlocked mode). */
  editable: boolean;
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
  const { base, project, scale, offset, sizeScale } = opts;

  // Surface background
  ctx.fillStyle = opts.background;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Base plan image (zoom/pan transform)
  if (base) {
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(base, 0, 0);
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

  // Live preview while dragging
  if (opts.preview && dist(opts.preview.a, opts.preview.b) > 0) {
    const a = project(opts.preview.a);
    const b = project(opts.preview.b);
    const color = opts.preview.kind === 'calibrate' ? CAL_COLOR : opts.preview.color;
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
