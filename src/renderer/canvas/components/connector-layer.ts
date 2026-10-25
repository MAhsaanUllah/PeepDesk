import type { CanvasNode, ConnectorLineStyle } from '../../../shared/types.js';

export function createConnectorSvgPath(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  style: ConnectorLineStyle = 'straight',
  controlX?: number,
  controlY?: number
): { d: string; midX: number; midY: number } {
  const midX = (sx + ex) / 2;
  const midY = (sy + ey) / 2;

  // Persistent custom bend: displayed midpoint is on-curve at t=0.5: B(0.5) = (start + 2*control + end) / 4.
  if (typeof controlX === 'number' && typeof controlY === 'number') {
    const qMidX = (sx + 2 * controlX + ex) / 4;
    const qMidY = (sy + 2 * controlY + ey) / 4;
    return { d: `M ${sx} ${sy} Q ${controlX} ${controlY} ${ex} ${ey}`, midX: qMidX, midY: qMidY };
  }

  if (style !== 'curved') {
    return { d: `M ${sx} ${sy} L ${ex} ${ey}`, midX, midY };
  }

  // Smooth quadratic bezier curve with natural bend (legacy curved, untouched).
  const dx = ex - sx;
  const dy = ey - sy;
  const dist = Math.hypot(dx, dy);
  const curvature = Math.min(60, dist * 0.2);
  // Perpendicular offset for organic curve
  const nx = -dy / (dist || 1);
  const ny = dx / (dist || 1);
  const cx = midX + nx * curvature;
  const cy = midY + ny * curvature;

  return { d: `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`, midX: (midX + cx) / 2, midY: (midY + cy) / 2 };
}

function createArrowMarker(id: string, color: string, size = 6): SVGMarkerElement {
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', id);
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '8');
  marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', String(size));
  marker.setAttribute('markerHeight', String(size));
  marker.setAttribute('orient', 'auto');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M 0 1.5 L 9 5 L 0 8.5 z');
  path.setAttribute('fill', color);
  marker.appendChild(path);

  return marker;
}

function createStartArrowMarker(id: string, color: string, size = 6): SVGMarkerElement {
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', id);
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '2');
  marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', String(size));
  marker.setAttribute('markerHeight', String(size));
  marker.setAttribute('orient', 'auto');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M 10 1.5 L 1 5 L 10 8.5 z');
  path.setAttribute('fill', color);
  marker.appendChild(path);

  return marker;
}

export function renderConnectorsSvg(
  svgEl: SVGSVGElement,
  connectors: CanvasNode[],
  selectedId: string | null,
  onSelect: (id: string) => void,
  onDelete: (id: string) => void,
  onLabelChange: (id: string, label: string) => void,
  onFlip?: (id: string) => void,
  zoomScale: number = 1
): void {
  // Zoom-compensated metrics so handles and hit targets remain ergonomic at all scales (25% - 300%)
  const zs = Math.max(0.1, zoomScale || 1);
  const handleR = Math.round((8 / zs) * 10) / 10;
  const handleStroke = Math.max(1, Math.round((2.5 / zs) * 10) / 10);
  const midHandleR = Math.round((6 / zs) * 10) / 10;
  const midHandleStroke = Math.max(1, Math.round((2 / zs) * 10) / 10);
  const actionBtnR = Math.round((9 / zs) * 10) / 10;
  const actionBtnStroke = Math.max(1, Math.round((1.5 / zs) * 10) / 10);
  const actionOffset = Math.round(22 / zs);
  const actionOffsetY = Math.round(14 / zs);
  const actionFontSize = Math.max(8, Math.round(10 / zs));
  const hitStrokeWidth = Math.max(20, Math.round(28 / zs));

  // Clear previous content
  svgEl.innerHTML = '';

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  // Built-in markers for standard purple fallback and selection highlight
  defs.appendChild(createArrowMarker('peepjam-arrow', '#9747FF', 6));
  defs.appendChild(createArrowMarker('peepjam-arrow-selected', '#C8F560', 6));
  defs.appendChild(createStartArrowMarker('peepjam-arrow-start', '#9747FF', 6));
  defs.appendChild(createStartArrowMarker('peepjam-arrow-start-selected', '#C8F560', 6));

  // Collect unique colors and sizes to create bounded, safe marker definitions
  const colorMarkerMap = new Map<string, string>();
  const colorStartMarkerMap = new Map<string, string>();
  colorMarkerMap.set('#9747ff-6', 'peepjam-arrow');
  colorMarkerMap.set('#c8f560-6', 'peepjam-arrow-selected');
  colorStartMarkerMap.set('#9747ff-6', 'peepjam-arrow-start');
  colorStartMarkerMap.set('#c8f560-6', 'peepjam-arrow-start-selected');

  const usedMarkerIds = new Set<string>(['peepjam-arrow', 'peepjam-arrow-selected', 'peepjam-arrow-start', 'peepjam-arrow-start-selected']);
  let customCounter = 0;

  for (const conn of connectors) {
    if (conn.type !== 'connector' || !conn.color) continue;
    const rawColor = conn.color.trim();
    const keyColor = rawColor.toLowerCase();
    const arrowPx = typeof conn.arrowheadSize === 'number' ? conn.arrowheadSize : 12;
    const markerSize = Math.max(3, Math.round((arrowPx / 2) * 10) / 10);
    const key = `${keyColor}-${markerSize}`;

    if (!colorMarkerMap.has(key)) {
      const clean = keyColor.replace(/[^a-z0-9]/g, '');
      let markerId = `peepjam-arrow-${clean || 'custom'}-${markerSize}`;
      if (usedMarkerIds.has(markerId)) {
        markerId = `peepjam-arrow-${clean || 'custom'}-${markerSize}-${++customCounter}`;
      }
      usedMarkerIds.add(markerId);
      colorMarkerMap.set(key, markerId);
      defs.appendChild(createArrowMarker(markerId, rawColor, markerSize));

      let startMarkerId = `peepjam-arrow-start-${clean || 'custom'}-${markerSize}`;
      if (usedMarkerIds.has(startMarkerId)) {
        startMarkerId = `peepjam-arrow-start-${clean || 'custom'}-${markerSize}-${++customCounter}`;
      }
      usedMarkerIds.add(startMarkerId);
      colorStartMarkerMap.set(key, startMarkerId);
      defs.appendChild(createStartArrowMarker(startMarkerId, rawColor, markerSize));
    }
  }

  svgEl.appendChild(defs);

  for (const conn of connectors) {
    if (conn.type !== 'connector') continue;
    const sx = conn.startX ?? conn.x;
    const sy = conn.startY ?? conn.y;
    const ex = conn.endX ?? conn.x + conn.width;
    const ey = conn.endY ?? conn.y + conn.height;
    const isSelected = selectedId === conn.id;
    const color = isSelected ? '#C8F560' : conn.color || '#9747FF';
    const strokeWidth = conn.strokeWidth || 3;
    const lineStyle = conn.lineStyle || 'straight';
    const arrowPx = typeof conn.arrowheadSize === 'number' ? conn.arrowheadSize : 12;
    const markerSize = Math.max(3, Math.round((arrowPx / 2) * 10) / 10);
    const colorKey = `${(conn.color || '#9747FF').trim().toLowerCase()}-${markerSize}`;

    const { d, midX, midY } = createConnectorSvgPath(sx, sy, ex, ey, lineStyle, conn.controlX, conn.controlY);

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', `connector-group ${isSelected ? 'is-selected' : ''}`);
    g.dataset.node = conn.id;

    // Invisible thick path for easy click hit-testing
    const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hitPath.setAttribute('d', d);
    hitPath.setAttribute('fill', 'none');
    hitPath.setAttribute('stroke', 'transparent');
    hitPath.setAttribute('stroke-width', String(Math.max(hitStrokeWidth, strokeWidth + 16)));
    hitPath.setAttribute('pointer-events', 'stroke');
    hitPath.style.cursor = 'pointer';
    hitPath.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      onSelect(conn.id);
    });
    g.appendChild(hitPath);

    // Visible styled connector path
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', String(strokeWidth));
    path.setAttribute('stroke-linecap', 'round');

    // Arrowhead at end (arrowEnd !== false)
    if (conn.arrowEnd !== false) {
      if (isSelected) {
        path.setAttribute('marker-end', 'url(#peepjam-arrow-selected)');
      } else {
        const markerId = colorMarkerMap.get(colorKey) || 'peepjam-arrow';
        path.setAttribute('marker-end', `url(#${markerId})`);
      }
    }

    // Arrowhead at start (arrowStart === true)
    if (conn.arrowStart === true) {
      if (isSelected) {
        path.setAttribute('marker-start', 'url(#peepjam-arrow-start-selected)');
      } else {
        const startMarkerId = colorStartMarkerMap.get(colorKey) || 'peepjam-arrow-start';
        path.setAttribute('marker-start', `url(#${startMarkerId})`);
      }
    }

    path.setAttribute('pointer-events', 'stroke');
    path.style.cursor = 'pointer';
    path.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      onSelect(conn.id);
    });
    g.appendChild(path);

    // Optional label badge (e.g. "YES" / "NO")
    const labelText = conn.label || conn.content;
    if (labelText) {
      const badgeG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      badgeG.setAttribute('transform', `translate(${midX}, ${midY})`);
      badgeG.style.cursor = 'pointer';

      const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textEl.setAttribute('text-anchor', 'middle');
      textEl.setAttribute('dominant-baseline', 'central');
      textEl.setAttribute('fill', '#111210');
      textEl.setAttribute('font-size', '11');
      textEl.setAttribute('font-weight', 'bold');
      textEl.setAttribute('font-family', 'Inter, system-ui, sans-serif');
      textEl.textContent = labelText;

      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      const textLen = Math.max(24, labelText.length * 8 + 12);
      bgRect.setAttribute('x', String(-textLen / 2));
      bgRect.setAttribute('y', '-10');
      bgRect.setAttribute('width', String(textLen));
      bgRect.setAttribute('height', '20');
      bgRect.setAttribute('rx', '6');
      bgRect.setAttribute('fill', isSelected ? '#C8F560' : '#FFFFFF');
      bgRect.setAttribute('stroke', color);
      bgRect.setAttribute('stroke-width', '1.5');

      badgeG.appendChild(bgRect);
      badgeG.appendChild(textEl);

      badgeG.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const next = prompt('Connector label:', labelText);
        if (next !== null) {
          onLabelChange(conn.id, next.trim());
        }
      });

      g.appendChild(badgeG);
    }

    // Draggable endpoints and controls if selected
    if (isSelected) {
      // Start point handle (reposition origin)
      const startH = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      startH.setAttribute('cx', String(sx));
      startH.setAttribute('cy', String(sy));
      startH.setAttribute('r', String(handleR));
      startH.setAttribute('fill', '#9747FF');
      startH.setAttribute('stroke', '#FFFFFF');
      startH.setAttribute('stroke-width', String(handleStroke));
      startH.setAttribute('data-conn-handle', 'start');
      startH.setAttribute('data-conn-id', conn.id);
      startH.style.cursor = 'grab';
      g.appendChild(startH);

      // End point handle (reposition arrow destination, rotates 360°)
      const endH = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      endH.setAttribute('cx', String(ex));
      endH.setAttribute('cy', String(ey));
      endH.setAttribute('r', String(handleR));
      endH.setAttribute('fill', '#C8F560');
      endH.setAttribute('stroke', '#111210');
      endH.setAttribute('stroke-width', String(handleStroke));
      endH.setAttribute('data-conn-handle', 'end');
      endH.setAttribute('data-conn-id', conn.id);
      endH.style.cursor = 'grab';
      g.appendChild(endH);

      // Mid handle: bend the connector by dragging its control point; endpoints stay put.
      const midH = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      midH.setAttribute('cx', String(midX));
      midH.setAttribute('cy', String(midY));
      midH.setAttribute('r', String(midHandleR));
      midH.setAttribute('fill', '#38BDF8');
      midH.setAttribute('stroke', '#FFFFFF');
      midH.setAttribute('stroke-width', String(midHandleStroke));
      midH.setAttribute('data-conn-handle', 'mid');
      midH.setAttribute('data-conn-id', conn.id);
      midH.style.cursor = 'move';
      g.appendChild(midH);

      // Flip Direction button (180° rotation)
      if (onFlip) {
        const flipG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        flipG.setAttribute('transform', `translate(${midX - actionOffset}, ${midY - actionOffsetY})`);
        flipG.setAttribute('class', 'conn-flip-btn');
        flipG.setAttribute('data-conn-action', 'flip');
        flipG.setAttribute('data-conn-id', conn.id);
        flipG.style.cursor = 'pointer';

        const flipCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        flipCircle.setAttribute('r', String(actionBtnR));
        flipCircle.setAttribute('fill', '#1E293B');
        flipCircle.setAttribute('stroke', '#FFFFFF');
        flipCircle.setAttribute('stroke-width', String(actionBtnStroke));

        const flipText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        flipText.setAttribute('text-anchor', 'middle');
        flipText.setAttribute('dominant-baseline', 'central');
        flipText.setAttribute('fill', '#C8F560');
        flipText.setAttribute('font-size', String(actionFontSize));
        flipText.setAttribute('font-weight', 'bold');
        flipText.textContent = '⇄';

        const flipTitle = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        flipTitle.textContent = 'Flip Direction (⇄)';

        flipG.appendChild(flipTitle);
        flipG.appendChild(flipCircle);
        flipG.appendChild(flipText);
        flipG.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          onFlip(conn.id);
        });
        g.appendChild(flipG);
      }

      // Delete button
      const delG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      delG.setAttribute('transform', `translate(${midX + actionOffset}, ${midY - actionOffsetY})`);
      delG.setAttribute('class', 'conn-del-btn');
      delG.setAttribute('data-conn-action', 'delete');
      delG.setAttribute('data-conn-id', conn.id);
      delG.style.cursor = 'pointer';

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', String(actionBtnR));
      circle.setAttribute('fill', '#F24822');
      circle.setAttribute('stroke', '#FFFFFF');
      circle.setAttribute('stroke-width', String(actionBtnStroke));

      const delText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      delText.setAttribute('text-anchor', 'middle');
      delText.setAttribute('dominant-baseline', 'central');
      delText.setAttribute('fill', '#FFFFFF');
      delText.setAttribute('font-size', String(actionFontSize));
      delText.setAttribute('font-weight', 'bold');
      delText.textContent = '✕';

      const delTitle = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      delTitle.textContent = 'Delete Connector';

      delG.appendChild(delTitle);
      delG.appendChild(circle);
      delG.appendChild(delText);
      delG.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        onDelete(conn.id);
      });
      g.appendChild(delG);
    }

    svgEl.appendChild(g);
  }
}
