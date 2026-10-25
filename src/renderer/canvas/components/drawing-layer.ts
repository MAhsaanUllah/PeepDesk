import type { CanvasNode, DrawingPoint } from '../../../shared/types.js';

export function pointsToSvgPath(points: DrawingPoint[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y} L ${points[0].x + 0.1} ${points[0].y + 0.1}`;
  }

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2;
    const yc = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x} ${points[i].y}, ${xc} ${yc}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

export function renderDrawingsSvg(
  svgEl: SVGSVGElement,
  drawings: CanvasNode[],
  onDeleteStroke: (id: string) => void,
  isEraserMode: boolean
): void {
  svgEl.innerHTML = '';

  for (const stroke of drawings) {
    if (stroke.type !== 'drawing' || !stroke.points || stroke.points.length === 0) continue;
    const d = pointsToSvgPath(stroke.points);
    const isHighlighter = !!stroke.isHighlighter;
    const strokeWidth = stroke.strokeWidth || (isHighlighter ? 18 : 3);
    const color = stroke.color || (isHighlighter ? '#FFC700' : '#FFFFFF');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', `drawing-path ${isHighlighter ? 'highlighter-path' : 'pen-path'}`);
    path.dataset.strokeId = stroke.id;
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', String(strokeWidth));
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');

    if (isHighlighter) {
      path.setAttribute('opacity', '0.45');
      path.style.mixBlendMode = 'screen';
    }

    if (isEraserMode) {
      path.style.cursor = 'inherit';
      path.addEventListener('pointerenter', () => onDeleteStroke(stroke.id));
      path.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        onDeleteStroke(stroke.id);
      });
    }

    svgEl.appendChild(path);
  }
}
