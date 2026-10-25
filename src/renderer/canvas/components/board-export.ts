import type { AppState, CanvasNode } from '../../../shared/types.js';

export function downloadFile(filename: string, content: string, contentType: string): void {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportBoardJson(state: AppState): void {
  const json = JSON.stringify(state, null, 2);
  const dateStr = new Date().toISOString().slice(0, 10);
  downloadFile(`peepdesk-board-${dateStr}.json`, json, 'application/json');
}

export interface ParsedBoardData {
  items: CanvasNode[];
  title?: string;
  gridStyle?: 'dots' | 'lines' | 'blank';
  pan?: { x: number; y: number };
  zoom?: number;
}

const VALID_NODE_TYPES = new Set([
  'thought',
  'todo',
  'text',
  'image',
  'link',
  'video',
  'sticky',
  'shape',
  'connector',
  'drawing',
  'section',
  'stamp',
  'note',
  'card'
]);

export function isN8nWorkflowJson(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const obj = parsed as Record<string, unknown>;
  return ('nodes' in obj && Array.isArray(obj.nodes)) || ('connections' in obj && typeof obj.connections === 'object');
}

export function parseN8nWorkflowJson(text: string): ParsedBoardData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Invalid n8n workflow JSON: syntax error in file.');
  }

  if (!isN8nWorkflowJson(parsed)) {
    throw new Error('Invalid n8n workflow JSON structure: missing nodes array or connections.');
  }

  const obj = parsed as Record<string, unknown>;
  const rawNodes = Array.isArray(obj.nodes) ? obj.nodes : [];
  const rawConnections = (obj.connections && typeof obj.connections === 'object') ? obj.connections as Record<string, unknown> : {};
  const workflowTitle = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim().slice(0, 120) : 'n8n Workflow';

  const items: CanvasNode[] = [];
  const nodeNameToId = new Map<string, string>();
  const nodeIdToNode = new Map<string, CanvasNode>();

  let counter = 0;
  for (const raw of rawNodes) {
    if (!raw || typeof raw !== 'object') continue;
    counter++;
    const n = raw as Record<string, unknown>;
    const name = typeof n.name === 'string' && n.name.trim() ? n.name.trim() : `Node ${counter}`;
    const rawId = typeof n.id === 'string' && n.id.trim() ? n.id.trim() : `n8n-${counter}`;
    const id = `n8n-${rawId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

    let px = 100 + ((counter - 1) % 5) * 260;
    let py = 100 + Math.floor((counter - 1) / 5) * 160;
    if (
      Array.isArray(n.position) &&
      typeof n.position[0] === 'number' &&
      Number.isFinite(n.position[0]) &&
      typeof n.position[1] === 'number' &&
      Number.isFinite(n.position[1])
    ) {
      px = Math.round(n.position[0]);
      py = Math.round(n.position[1]);
    }

    const rawType = typeof n.type === 'string' ? n.type : 'n8n-node';
    const cleanType = rawType.replace(/^n8n-nodes-base\./, '').replace(/([A-Z])/g, ' $1').trim();

    let strokeColor = '#3B82F6';
    if (/trigger|webhook|schedule|poll/i.test(rawType) || /trigger|webhook/i.test(name)) {
      strokeColor = '#FF6D5A';
    } else if (/code|function|javascript|python/i.test(rawType)) {
      strokeColor = '#10B981';
    } else if (/http|request|fetch|api/i.test(rawType)) {
      strokeColor = '#3B82F6';
    } else if (/if|switch|filter|merge/i.test(rawType)) {
      strokeColor = '#F59E0B';
    }

    const nodeItem: CanvasNode = {
      id,
      type: 'shape',
      shapeType: 'rounded-rect',
      x: px,
      y: py,
      width: 220,
      height: 90,
      title: name,
      content: cleanType,
      color: '#1E1F1C',
      textColor: '#FFFFFF',
      strokeColor,
      strokeWidth: 2,
      createdAt: Date.now()
    };

    items.push(nodeItem);
    nodeNameToId.set(name, id);
    nodeIdToNode.set(id, nodeItem);
  }

  let connIdx = 0;
  for (const [sourceName, outputs] of Object.entries(rawConnections)) {
    const sourceId = nodeNameToId.get(sourceName);
    if (!sourceId) continue;
    const sourceNode = nodeIdToNode.get(sourceId);
    if (!sourceNode) continue;

    if (!outputs || typeof outputs !== 'object') continue;
    const mainOutputs = (outputs as Record<string, unknown>).main;
    if (!Array.isArray(mainOutputs)) continue;

    for (const group of mainOutputs) {
      if (!Array.isArray(group)) continue;
      for (const targetConn of group) {
        if (!targetConn || typeof targetConn !== 'object') continue;
        const targetName = (targetConn as Record<string, unknown>).node;
        if (typeof targetName !== 'string') continue;
        const targetId = nodeNameToId.get(targetName);
        if (!targetId || targetId === sourceId) continue;
        const targetNode = nodeIdToNode.get(targetId);
        if (!targetNode) continue;

        const sx = sourceNode.x + sourceNode.width;
        const sy = sourceNode.y + Math.round(sourceNode.height / 2);
        const ex = targetNode.x;
        const ey = targetNode.y + Math.round(targetNode.height / 2);

        const connNode: CanvasNode = {
          id: `conn-n8n-${sourceId}-${targetId}-${++connIdx}`,
          type: 'connector',
          x: Math.min(sx, ex),
          y: Math.min(sy, ey),
          width: Math.max(1, Math.abs(ex - sx)),
          height: Math.max(1, Math.abs(ey - sy)),
          content: '',
          color: '#F59E0B',
          strokeWidth: 3,
          lineStyle: 'curved',
          arrowEnd: true,
          arrowStart: false,
          arrowheadSize: 12,
          startX: sx,
          startY: sy,
          endX: ex,
          endY: ey,
          startElementId: sourceId,
          endElementId: targetId,
          createdAt: Date.now()
        };
        items.push(connNode);
      }
    }
  }

  return {
    items,
    title: workflowTitle,
    gridStyle: 'dots'
  };
}

export function parseBoardJson(text: string): ParsedBoardData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Invalid board JSON: syntax error in file.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid board JSON structure: root must be an object or array.');
  }

  if (isN8nWorkflowJson(parsed)) {
    return parseN8nWorkflowJson(text);
  }

  let rawItems: unknown = null;
  let title: string | undefined;
  let gridStyle: 'dots' | 'lines' | 'blank' | undefined;
  let pan: { x: number; y: number } | undefined;
  let zoom: number | undefined;

  if (Array.isArray(parsed)) {
    // Backward compatibility: raw items array
    rawItems = parsed;
  } else {
    const obj = parsed as Record<string, unknown>;
    if (!('items' in obj) || !Array.isArray(obj.items)) {
      throw new Error('Invalid board JSON structure: missing items array.');
    }
    rawItems = obj.items;

    // Validate title
    if (typeof obj.title === 'string' && obj.title.trim().length > 0) {
      title = obj.title.trim().slice(0, 120);
    }

    // Validate gridStyle
    if (obj.gridStyle === 'dots' || obj.gridStyle === 'lines' || obj.gridStyle === 'blank') {
      gridStyle = obj.gridStyle;
    }

    // Validate pan
    if (obj.pan && typeof obj.pan === 'object') {
      const p = obj.pan as Record<string, unknown>;
      if (typeof p.x === 'number' && Number.isFinite(p.x) && typeof p.y === 'number' && Number.isFinite(p.y)) {
        pan = { x: Math.round(p.x), y: Math.round(p.y) };
      }
    }

    // Validate zoom
    if (typeof obj.zoom === 'number' && Number.isFinite(obj.zoom) && obj.zoom > 0) {
      zoom = Math.min(3.0, Math.max(0.2, Number(obj.zoom.toFixed(3))));
    }
  }

  const items: CanvasNode[] = [];
  if (Array.isArray(rawItems)) {
    for (const raw of rawItems) {
      if (!raw || typeof raw !== 'object') continue;
      const n = raw as Record<string, unknown>;
      if (typeof n.id !== 'string' || !n.id.trim()) continue;
      if (typeof n.type !== 'string' || !VALID_NODE_TYPES.has(n.type)) continue;
      if (typeof n.x !== 'number' || !Number.isFinite(n.x)) continue;
      if (typeof n.y !== 'number' || !Number.isFinite(n.y)) continue;
      items.push(n as unknown as CanvasNode);
    }
  }

  return {
    items,
    ...(title !== undefined ? { title } : {}),
    ...(gridStyle !== undefined ? { gridStyle } : {}),
    ...(pan !== undefined ? { pan } : {}),
    ...(zoom !== undefined ? { zoom } : {})
  };
}

export async function parseBoardJsonFile(file: File): Promise<ParsedBoardData> {
  const text = await file.text();
  return parseBoardJson(text);
}


function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"');
}

async function loadImgAsync(src: string, timeoutMs = 2500): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, timeoutMs);

    img.onload = () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve(img);
      }
    };
    img.onerror = () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve(null);
      }
    };
    img.src = src;
  });
}

async function resolveImageSrc(node: CanvasNode): Promise<string | null> {
  const rawSrc = node.content || node.url;
  if (!rawSrc) return null;
  if (rawSrc.startsWith('media:')) {
    const name = rawSrc.slice('media:'.length);
    if (typeof window !== 'undefined' && window.canvasApi?.imageUrl) {
      try {
        const url = await window.canvasApi.imageUrl(name);
        if (url) return url;
      } catch {}
    }
    if (typeof window !== 'undefined' && window.canvasApi?.videoUrl) {
      try {
        const url = await window.canvasApi.videoUrl(name);
        if (url) return url;
      } catch {}
    }
    return null;
  }
  return rawSrc;
}

export async function renderBoardToCanvas(items: CanvasNode[]): Promise<HTMLCanvasElement | null> {
  if (items.length === 0) {
    return null;
  }

  // Calculate bounding box of all canvas items
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of items) {
    if (n.type === 'drawing' && n.points) {
      for (const p of n.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
    } else if (n.type === 'connector') {
      const sx = n.startX ?? n.x;
      const sy = n.startY ?? n.y;
      const ex = n.endX ?? n.x + (n.width || 0);
      const ey = n.endY ?? n.y + (n.height || 0);
      minX = Math.min(minX, sx, ex);
      minY = Math.min(minY, sy, ey);
      maxX = Math.max(maxX, sx, ex);
      maxY = Math.max(maxY, sy, ey);
    } else {
      const w = n.width || 180;
      const h = n.height || 120;
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + w);
      maxY = Math.max(maxY, n.y + h);
    }
  }

  const pad = 60;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;

  const width = Math.max(400, maxX - minX);
  const height = Math.max(300, maxY - minY);

  const canvas = document.createElement('canvas');
  // Scale for retina 2x sharpness
  const dpr = 2;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.scale(dpr, dpr);

  // Background dark color
  ctx.fillStyle = '#111210';
  ctx.fillRect(0, 0, width, height);

  // Dot-grid pattern
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  const dotSpacing = 24;
  const startDotX = ((minX % dotSpacing) + dotSpacing) % dotSpacing;
  const startDotY = ((minY % dotSpacing) + dotSpacing) % dotSpacing;
  for (let x = startDotX; x < width; x += dotSpacing) {
    for (let y = startDotY; y < height; y += dotSpacing) {
      ctx.beginPath();
      ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Pre-load all image nodes in parallel
  const imageNodes = items.filter((n) => n.type === 'image');
  const imageMap = new Map<string, HTMLImageElement | null>();
  if (imageNodes.length > 0) {
    await Promise.all(
      imageNodes.map(async (n) => {
        try {
          const src = await resolveImageSrc(n);
          if (src) {
            const img = await loadImgAsync(src);
            imageMap.set(n.id, img);
          } else {
            imageMap.set(n.id, null);
          }
        } catch {
          imageMap.set(n.id, null);
        }
      })
    );
  }

  // Draw sections first (layer 1)
  for (const n of items) {
    if (n.type !== 'section') continue;
    const x = n.x - minX;
    const y = n.y - minY;
    const w = n.width || 420;
    const h = n.height || 320;

    ctx.fillStyle = n.color || 'rgba(151, 71, 255, 0.12)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);

    // Section title
    ctx.fillStyle = '#D3B5FF';
    ctx.font = 'bold 15px Inter, system-ui, sans-serif';
    ctx.fillText(n.title || 'Untitled Section', x + 16, y + 26);
  }

  // Draw connectors (layer 2)
  for (const n of items) {
    if (n.type !== 'connector') continue;
    const sx = (n.startX ?? n.x) - minX;
    const sy = (n.startY ?? n.y) - minY;
    const ex = (n.endX ?? n.x + (n.width || 0)) - minX;
    const ey = (n.endY ?? n.y + (n.height || 0)) - minY;

    let ctrlX: number | undefined;
    let ctrlY: number | undefined;

    ctx.strokeStyle = n.color || '#9747FF';
    ctx.lineWidth = n.strokeWidth || 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    if (typeof n.controlX === 'number' && typeof n.controlY === 'number') {
      ctrlX = n.controlX - minX;
      ctrlY = n.controlY - minY;
      ctx.quadraticCurveTo(ctrlX, ctrlY, ex, ey);
    } else if (n.lineStyle === 'straight') {
      ctx.lineTo(ex, ey);
    } else {
      const dx = ex - sx;
      const dy = ey - sy;
      const dist = Math.hypot(dx, dy);
      const curvature = Math.min(60, dist * 0.2);
      const nx = -dy / (dist || 1);
      const ny = dx / (dist || 1);
      const midX = (sx + ex) / 2;
      const midY = (sy + ey) / 2;
      const cx = midX + nx * curvature;
      const cy = midY + ny * curvature;
      ctrlX = cx;
      ctrlY = cy;
      ctx.quadraticCurveTo(cx, cy, ex, ey);
    }
    ctx.stroke();

    const arrowLen = typeof n.arrowheadSize === 'number' ? n.arrowheadSize : 10;
    // Arrowhead at end (skipped for decorative lines: arrowEnd === false)
    if (n.arrowEnd !== false) {
      const angle =
        typeof ctrlX === 'number' && typeof ctrlY === 'number' && (ctrlX !== ex || ctrlY !== ey)
          ? Math.atan2(ey - ctrlY, ex - ctrlX)
          : Math.atan2(ey - sy, ex - sx);
      ctx.fillStyle = n.color || '#9747FF';
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - arrowLen * Math.cos(angle - Math.PI / 6), ey - arrowLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(ex - arrowLen * Math.cos(angle + Math.PI / 6), ey - arrowLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    }

    // Arrowhead at start (when arrowStart === true)
    if (n.arrowStart === true) {
      const startAngle =
        typeof ctrlX === 'number' && typeof ctrlY === 'number' && (ctrlX !== sx || ctrlY !== sy)
          ? Math.atan2(sy - ctrlY, sx - ctrlX)
          : Math.atan2(sy - ey, sx - ex);
      ctx.fillStyle = n.color || '#9747FF';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - arrowLen * Math.cos(startAngle - Math.PI / 6), sy - arrowLen * Math.sin(startAngle - Math.PI / 6));
      ctx.lineTo(sx - arrowLen * Math.cos(startAngle + Math.PI / 6), sy - arrowLen * Math.sin(startAngle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    }

    // Label if present
    const labelText = n.label || n.content;
    if (labelText) {
      let midX = (sx + ex) / 2;
      let midY = (sy + ey) / 2;
      if (typeof ctrlX === 'number' && typeof ctrlY === 'number') {
        midX = (sx + 2 * ctrlX + ex) / 4;
        midY = (sy + 2 * ctrlY + ey) / 4;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = n.color || '#9747FF';
      ctx.lineWidth = 1;
      const labelW = labelText.length * 8 + 12;
      ctx.fillRect(midX - labelW / 2, midY - 10, labelW, 20);
      ctx.strokeRect(midX - labelW / 2, midY - 10, labelW, 20);
      ctx.fillStyle = '#111210';
      ctx.font = 'bold 11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, midX, midY);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }
  }

  // Draw freehand drawings (layer 3)
  for (const n of items) {
    if (n.type !== 'drawing' || !n.points || n.points.length === 0) continue;
    ctx.strokeStyle = n.color || '#FFFFFF';
    ctx.lineWidth = n.strokeWidth || (n.isHighlighter ? 18 : 3);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = n.isHighlighter ? 0.45 : 1;

    ctx.beginPath();
    ctx.moveTo(n.points[0].x - minX, n.points[0].y - minY);
    for (let i = 1; i < n.points.length; i++) {
      ctx.lineTo(n.points[i].x - minX, n.points[i].y - minY);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Draw shapes (layer 4)
  for (const n of items) {
    if (n.type !== 'shape') continue;
    const x = n.x - minX;
    const y = n.y - minY;
    const w = n.width || 160;
    const h = n.height || 100;

    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    if (n.rotation) {
      ctx.rotate((n.rotation * Math.PI) / 180);
    }

    ctx.fillStyle = n.fillColor || 'rgba(30, 31, 29, 0.95)';
    ctx.strokeStyle = n.strokeColor || '#9747FF';
    ctx.lineWidth = n.strokeWidth || 2;

    const shape = n.shapeType || 'rounded-rect';
    ctx.beginPath();
    if (shape === 'circle') {
      ctx.ellipse(0, 0, w / 2 - 2, h / 2 - 2, 0, 0, Math.PI * 2);
    } else if (shape === 'diamond') {
      ctx.moveTo(0, -h / 2 + 2);
      ctx.lineTo(w / 2 - 2, 0);
      ctx.lineTo(0, h / 2 - 2);
      ctx.lineTo(-w / 2 + 2, 0);
      ctx.closePath();
    } else if (shape === 'triangle') {
      ctx.moveTo(0, -h / 2 + 2);
      ctx.lineTo(w / 2 - 2, h / 2 - 2);
      ctx.lineTo(-w / 2 + 2, h / 2 - 2);
      ctx.closePath();
    } else {
      // Rounded rect
      const rx = shape === 'rounded-rect' ? 14 : 0;
      ctx.roundRect(-w / 2, -h / 2, w, h, rx);
    }
    ctx.fill();
    ctx.stroke();

    if (n.content) {
      ctx.fillStyle = n.textColor || '#F4F3EE';
      ctx.font = `${n.fontSize || 14}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.content, 0, 0);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
  }

  // Draw sticky notes, thoughts, and todos (layer 5)
  for (const n of items) {
    if (n.type !== 'sticky' && n.type !== 'thought' && n.type !== 'todo') continue;
    const x = n.x - minX;
    const y = n.y - minY;
    const w = n.width || (n.type === 'sticky' ? 240 : 200);
    const h = n.height || (n.type === 'sticky' ? 240 : 160);

    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    if (n.rotation) {
      ctx.rotate((n.rotation * Math.PI) / 180);
    }

    // Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;

    ctx.fillStyle = n.color || (n.type === 'sticky' ? '#FFF385' : '#eff6ff');
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 6);
    ctx.fill();

    // Reset shadow for text
    ctx.shadowColor = 'transparent';

    let curY = -h / 2 + 24;

    // Sticky Note Dedicated Title
    if (n.title) {
      const titleLevel = n.titleLevel || n.textType || 'h2';
      const defaultTitleSizes: Record<string, number> = { h1: 22, h2: 18, h3: 16, h4: 15, p: 14 };
      const tSize = n.titleFontSize || defaultTitleSizes[titleLevel] || 18;
      const isTitleBold = n.titleFontWeight === 'bold' || n.titleIsBold || (n.titleFontWeight !== 'normal' && titleLevel !== 'p');
      const isTitleItalic = n.titleFontStyle === 'italic' || !!n.titleIsItalic;
      ctx.font = `${isTitleBold ? 'bold ' : ''}${isTitleItalic ? 'italic ' : ''}${tSize}px ${n.titleFontFamily || n.fontFamily || 'Inter, system-ui, sans-serif'}`;
      ctx.fillStyle = n.textColor || (n.type === 'sticky' ? '#2A2700' : '#1f2937');
      ctx.fillText(n.title, -w / 2 + 14, curY);
      curY += tSize + 8;
    }

    // Checklist Items (when isChecklist is true)
    if (n.isChecklist && n.checklistItems && n.checklistItems.length > 0) {
      const itemFontSize = n.fontSize || 13;
      const isItemBold = n.fontWeight === 'bold' || !!n.isBold;
      const isItemItalic = n.fontStyle === 'italic' || !!n.isItalic;
      ctx.font = `${isItemBold ? 'bold ' : ''}${isItemItalic ? 'italic ' : ''}${itemFontSize}px ${n.fontFamily || 'Inter, system-ui, sans-serif'}`;

      for (const item of n.checklistItems) {
        if (curY > h / 2 - 20) break;
        const boxSize = 12;
        const boxX = -w / 2 + 14;
        const boxY = curY - 10;

        ctx.strokeStyle = n.textColor || '#2A2700';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(boxX, boxY, boxSize, boxSize);

        if (item.done) {
          ctx.fillStyle = n.textColor || '#2A2700';
          ctx.fillRect(boxX + 2, boxY + 2, boxSize - 4, boxSize - 4);
        }

        ctx.fillStyle = item.done ? 'rgba(0, 0, 0, 0.45)' : (n.textColor || '#2A2700');
        ctx.fillText(item.text, boxX + 18, curY);

        if (item.done && item.text) {
          const textWidth = ctx.measureText(item.text).width;
          ctx.beginPath();
          ctx.moveTo(boxX + 18, curY - 3);
          ctx.lineTo(boxX + 18 + textWidth, curY - 3);
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        curY += itemFontSize + 6;
      }
    } else {
      // Standard Content Lines
      const bodyFontSize = n.fontSize || 13;
      const isBodyBold = n.fontWeight === 'bold' || !!n.isBold;
      const isBodyItalic = n.fontStyle === 'italic' || !!n.isItalic;
      ctx.font = `${isBodyBold ? 'bold ' : ''}${isBodyItalic ? 'italic ' : ''}${bodyFontSize}px ${n.fontFamily || 'Inter, system-ui, sans-serif'}`;
      ctx.fillStyle = n.textColor || (n.type === 'sticky' ? '#2A2700' : '#1f2937');

      if (n.type === 'todo') {
        const isDone = n.status === 'done';
        const checkGlyph = isDone ? '☑ ' : '☐ ';
        const rawContent = stripHtml(n.content || '');
        ctx.fillText(checkGlyph + rawContent, -w / 2 + 14, curY);
      } else {
        const rawContent = stripHtml(n.content || '');
        const lines = rawContent.split('\n');
        for (const line of lines.slice(0, 8)) {
          if (curY > h / 2 - 20) break;
          ctx.fillText(line, -w / 2 + 14, curY);
          curY += bodyFontSize + 5;
        }
      }
    }

    // Author
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.font = 'bold 10px Inter, system-ui, sans-serif';
    ctx.fillText(n.author || 'You', -w / 2 + 14, h / 2 - 12);

    ctx.restore();
  }

  // Draw text nodes (layer: text)
  for (const n of items) {
    if (n.type !== 'text') continue;
    const x = n.x - minX;
    const y = n.y - minY;
    const w = n.width || 200;
    const h = n.height || 60;

    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    if (n.rotation) {
      ctx.rotate((n.rotation * Math.PI) / 180);
    }

    // Subtle container background if present
    if (n.color && n.color !== 'transparent') {
      ctx.fillStyle = n.color;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, 6);
      ctx.fill();
    }

    const fSize = n.fontSize || 15;
    const isBold = n.fontWeight === 'bold' || !!n.isBold;
    const isItalic = n.fontStyle === 'italic' || !!n.isItalic;
    ctx.font = `${isBold ? 'bold ' : ''}${isItalic ? 'italic ' : ''}${fSize}px ${n.fontFamily || 'Inter, system-ui, sans-serif'}`;
    ctx.fillStyle = n.textColor || '#F4F3EE';

    const rawContent = stripHtml(n.content || '');
    const lines = rawContent.split('\n');
    let textY = -h / 2 + fSize + 6;
    for (const line of lines) {
      if (textY > h / 2 - 4) break;
      ctx.fillText(line, -w / 2 + 8, textY);
      textY += fSize + 4;
    }
    ctx.restore();
  }

  // Draw image nodes (layer: image)
  for (const n of items) {
    if (n.type !== 'image') continue;
    const x = n.x - minX;
    const y = n.y - minY;
    const w = n.width || 240;
    const h = n.height || 180;

    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    if (n.rotation) {
      ctx.rotate((n.rotation * Math.PI) / 180);
    }

    const img = imageMap.get(n.id);
    if (img && (img.naturalWidth || img.width)) {
      // White container card
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, 6);
      ctx.fill();

      // Fit image inside card maintaining aspect ratio
      const imgW = img.naturalWidth || img.width;
      const imgH = img.naturalHeight || img.height;
      const imgRatio = imgW / (imgH || 1);
      const maxW = w - 8;
      const maxH = h - 8;
      let dw = maxW;
      let dh = maxW / imgRatio;
      if (dh > maxH) {
        dh = maxH;
        dw = maxH * imgRatio;
      }
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    } else {
      // Graceful fallback placeholder for missing/unreadable media
      ctx.fillStyle = 'rgba(30, 31, 29, 0.95)';
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, 6);
      ctx.fill();

      ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.setLineDash([]);

      ctx.fillStyle = '#F87171';
      ctx.font = 'bold 12px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚠️ Media missing on disk', 0, 0);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
  }

  // Draw video nodes (layer: video)
  for (const n of items) {
    if (n.type !== 'video') continue;
    const x = n.x - minX;
    const y = n.y - minY;
    const w = n.width || 320;
    const h = n.height || 220;

    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    if (n.rotation) {
      ctx.rotate((n.rotation * Math.PI) / 180);
    }

    // Card background
    ctx.fillStyle = '#232338';
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Top header
    ctx.fillStyle = 'rgba(226, 232, 240, 0.8)';
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillText('🎥 video', -w / 2 + 12, -h / 2 + 18);

    // Inner video viewport
    const screenY = -h / 2 + 28;
    const screenH = h - 36;
    ctx.fillStyle = '#0a0a14';
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 8, screenY, w - 16, screenH, 6);
    ctx.fill();

    // Centered Play Button
    const centerY = screenY + screenH / 2 - 8;
    ctx.beginPath();
    ctx.arc(0, centerY, 20, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Play triangle
    ctx.beginPath();
    ctx.moveTo(-5, centerY - 9);
    ctx.lineTo(9, centerY);
    ctx.lineTo(-5, centerY + 9);
    ctx.closePath();
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    // Subtitle below play button
    let label = 'Video';
    if (n.content.startsWith('yt:')) label = `YouTube (${n.content.slice(3)})`;
    else if (n.content.startsWith('media:')) label = n.content.slice(6);
    else if (n.content) label = n.content.replace(/^https?:\/\//i, '').slice(0, 32);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, centerY + 30);
    ctx.textAlign = 'start';

    ctx.restore();
  }

  // Draw link cards (layer: link)
  for (const n of items) {
    if (n.type !== 'link') continue;
    const x = n.x - minX;
    const y = n.y - minY;
    const w = n.width || 280;
    const h = n.height || 160;

    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    if (n.rotation) {
      ctx.rotate((n.rotation * Math.PI) / 180);
    }

    // Card background
    ctx.fillStyle = n.color || '#eff6ff';
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Header
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillText('🔗 link', -w / 2 + 12, -h / 2 + 18);

    let topY = -h / 2 + 36;
    if (n.title) {
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 12px Inter, system-ui, sans-serif';
      ctx.fillText(n.title, -w / 2 + 12, topY);
      topY += 16;
    }

    const host = (n.url || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '');
    ctx.fillStyle = '#2563eb';
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillText(host || 'https://…', -w / 2 + 12, topY);
    topY += 16;

    if (n.preview) {
      const pBoxY = topY + 4;
      const pBoxH = Math.max(36, h / 2 - 10 - pBoxY);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      ctx.roundRect(-w / 2 + 10, pBoxY, w - 20, pBoxH, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#111827';
      ctx.font = 'bold 11px Inter, system-ui, sans-serif';
      const pTitle = n.preview.title || n.preview.siteName;
      ctx.fillText(pTitle.slice(0, 28), -w / 2 + 18, pBoxY + 16);

      ctx.fillStyle = '#6b7280';
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.fillText(n.preview.siteName || host, -w / 2 + 18, pBoxY + 30);
    }

    ctx.restore();
  }

  // Draw stamps (layer 6)
  for (const n of items) {
    if (n.type !== 'stamp') continue;
    const x = n.x - minX;
    const y = n.y - minY;
    const w = n.width || 64;
    const h = n.height || 64;

    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.font = '32px Apple Color Emoji, Segoe UI Emoji, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(n.content || '⭐', 0, -4);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = 'bold 9px Inter, system-ui, sans-serif';
    ctx.fillText(n.author || 'You', 0, h / 2 - 4);
    ctx.restore();
  }

  return canvas;
}

export async function exportBoardPng(items: CanvasNode[]): Promise<void> {
  if (items.length === 0) {
    alert('Canvas is empty. Add elements before exporting.');
    return;
  }

  const canvas = await renderBoardToCanvas(items);
  if (!canvas) return;

  // Convert to PNG blob and download
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `peepdesk-board-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
}

