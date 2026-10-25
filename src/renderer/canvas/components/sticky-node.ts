import type { CanvasNode } from '../../../shared/types.js';
import { PEEPJAM_PASTELS } from './peepjam-constants.js';

export function buildStickyNode(node: CanvasNode): HTMLElement {
  const el = document.createElement('div');
  el.className = 'board-node peepjam-sticky';
  el.dataset.node = node.id;
  el.dataset.type = 'sticky';
  el.style.left = `${node.x}px`;
  el.style.top = `${node.y}px`;
  el.style.width = `${node.width || 240}px`;
  el.style.height = `${node.height || 240}px`;

  const color = node.color || '#FFF385';
  const matchingPastel = PEEPJAM_PASTELS.find((p) => p.bg.toLowerCase() === color.toLowerCase()) || PEEPJAM_PASTELS[0];
  const textColor = node.textColor || matchingPastel.text;
  const rotation = typeof node.rotation === 'number' ? node.rotation : 0;

  el.style.backgroundColor = color;
  el.style.color = textColor;
  el.style.transform = `rotate(${rotation}deg)`;
  if (node.zIndex) el.style.zIndex = String(node.zIndex);

  const fontSize = node.fontSize || 16;
  const fontFamily = node.fontFamily || 'Inter, system-ui, sans-serif';
  const fontWeight = (node.fontWeight === 'bold' || node.isBold) ? 'bold' : 'normal';
  const fontStyle = (node.fontStyle === 'italic' || node.isItalic) ? 'italic' : 'normal';

  el.style.fontSize = `${fontSize}px`;
  el.style.fontFamily = fontFamily;
  el.style.fontWeight = fontWeight;
  el.style.fontStyle = fontStyle;

  // Top action bar (checklist toggle + color picker trigger + delete)
  const bar = document.createElement('div');
  bar.className = 'sticky-bar';

  const authorTag = document.createElement('span');
  authorTag.className = 'sticky-author';
  authorTag.textContent = node.author || 'You';
  bar.appendChild(authorTag);

  const actions = document.createElement('div');
  actions.className = 'sticky-actions';

  // Checklist mode toggle button (unifies note and to-do list in one single tool)
  const checkToggleBtn = document.createElement('button');
  checkToggleBtn.className = `sticky-btn sticky-check-toggle ${node.isChecklist ? 'is-active' : ''}`;
  checkToggleBtn.title = node.isChecklist ? 'Switch to text note' : 'Turn into To-Do checklist';
  checkToggleBtn.innerHTML = '☑️';
  actions.appendChild(checkToggleBtn);

  // Palette button
  const paletteBtn = document.createElement('button');
  paletteBtn.className = 'sticky-btn sticky-palette-btn';
  paletteBtn.title = 'Change color';
  paletteBtn.innerHTML = '🎨';
  actions.appendChild(paletteBtn);

  // Delete button
  const delBtn = document.createElement('button');
  delBtn.className = 'sticky-btn sticky-del-btn';
  delBtn.title = 'Delete note';
  delBtn.innerHTML = '✕';
  actions.appendChild(delBtn);

  bar.appendChild(actions);
  el.appendChild(bar);

  // Body container that holds either textarea or checklist
  const bodyContainer = document.createElement('div');
  bodyContainer.className = 'sticky-body-container';
  bodyContainer.style.flex = '1';
  bodyContainer.style.display = 'flex';
  bodyContainer.style.flexDirection = 'column';
  bodyContainer.style.minHeight = '0';
  el.appendChild(bodyContainer);

  // Quick pastel picker popover
  const picker = document.createElement('div');
  picker.className = 'sticky-color-picker hidden';
  PEEPJAM_PASTELS.forEach((p) => {
    const dot = document.createElement('button');
    dot.className = 'color-dot';
    dot.style.backgroundColor = p.bg;
    dot.title = p.name;
    dot.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      node.color = p.bg;
      node.textColor = p.text;
      el.style.backgroundColor = p.bg;
      el.style.color = p.text;
      const ta = el.querySelector<HTMLTextAreaElement>('.sticky-textarea');
      if (ta) ta.style.color = p.text;
      const ti = el.querySelector<HTMLInputElement>('.sticky-title-input');
      if (ti) ti.style.color = p.text;
      el.querySelectorAll<HTMLInputElement>('.sticky-check-input').forEach((inp) => (inp.style.color = p.text));
      picker.classList.add('hidden');
      el.dispatchEvent(new CustomEvent('node-updated', { bubbles: true, detail: { id: node.id } }));
    });
    picker.appendChild(dot);
  });
  el.appendChild(picker);

  function renderBody(): void {
    bodyContainer.replaceChildren();

    // 1. Dedicated Title Input (First line: H1-H4 / P, bold / italic, independent typography)
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    const tLevel = node.titleLevel || node.textType || 'h2';
    titleInput.className = `sticky-title-input level-${tLevel}`;
    titleInput.placeholder = 'Title…';
    titleInput.value = node.title || '';
    titleInput.style.color = textColor;
    titleInput.style.fontFamily = node.titleFontFamily || node.fontFamily || 'Inter, system-ui, sans-serif';
    titleInput.style.fontWeight = (node.titleFontWeight === 'bold' || node.titleIsBold) ? 'bold' : (node.titleFontWeight === 'normal' ? 'normal' : 'bold');
    titleInput.style.fontStyle = (node.titleFontStyle === 'italic' || node.titleIsItalic) ? 'italic' : 'normal';

    const titleSizes: Record<string, number> = { h1: 28, h2: 24, h3: 20, h4: 18, p: 16 };
    const tSize = node.titleFontSize || titleSizes[tLevel] || 24;
    titleInput.style.fontSize = `${tSize}px`;

    titleInput.addEventListener('input', () => {
      node.title = titleInput.value;
      el.dispatchEvent(new CustomEvent('node-updated', { bubbles: true, detail: { id: node.id } }));
    });

    titleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const nextInput = el.querySelector<HTMLElement>('.sticky-textarea, .sticky-check-input');
        nextInput?.focus();
      }
    });

    titleInput.addEventListener('pointerdown', () => {
      el.dispatchEvent(new CustomEvent('sticky-focus-target', { bubbles: true, detail: { id: node.id, target: 'title' } }));
    });

    titleInput.addEventListener('focus', () => {
      el.classList.add('is-editing');
      el.dispatchEvent(new CustomEvent('sticky-focus-target', { bubbles: true, detail: { id: node.id, target: 'title' } }));
    });

    titleInput.addEventListener('blur', () => {
      el.classList.remove('is-editing');
    });

    bodyContainer.appendChild(titleInput);

    if (node.isChecklist) {
      if (!node.checklistItems || node.checklistItems.length === 0) {
        if (node.content && node.content.trim()) {
          node.checklistItems = node.content
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
            .map((text) => ({ id: crypto.randomUUID(), text, done: false }));
        }
        if (!node.checklistItems || node.checklistItems.length === 0) {
          node.checklistItems = [{ id: crypto.randomUUID(), text: '', done: false }];
        }
      }

      const list = document.createElement('div');
      list.className = 'sticky-checklist';

      node.checklistItems.forEach((item, index) => {
        const itemRow = document.createElement('div');
        itemRow.className = 'sticky-check-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'sticky-check-box';
        checkbox.checked = !!item.done;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = `sticky-check-input ${item.done ? 'is-done' : ''}`;
        input.value = item.text;
        input.placeholder = 'To-do item…';
        input.style.color = textColor;
        input.style.fontSize = `${node.fontSize || 16}px`;
        input.style.fontFamily = node.fontFamily || 'Inter, system-ui, sans-serif';
        input.style.fontWeight = (node.fontWeight === 'bold' || node.isBold) ? 'bold' : 'normal';

        input.addEventListener('pointerdown', () => {
          el.dispatchEvent(new CustomEvent('sticky-focus-target', { bubbles: true, detail: { id: node.id, target: 'body' } }));
        });

        input.addEventListener('focus', () => {
          el.dispatchEvent(new CustomEvent('sticky-focus-target', { bubbles: true, detail: { id: node.id, target: 'body' } }));
        });

        const delItemBtn = document.createElement('button');
        delItemBtn.className = 'sticky-check-del';
        delItemBtn.title = 'Delete item';
        delItemBtn.textContent = '?';

        checkbox.addEventListener('change', () => {
          item.done = checkbox.checked;
          input.classList.toggle('is-done', item.done);
          el.dispatchEvent(new CustomEvent('node-updated', { bubbles: true, detail: { id: node.id } }));
        });

        input.addEventListener('input', () => {
          item.text = input.value;
          el.dispatchEvent(new CustomEvent('node-updated', { bubbles: true, detail: { id: node.id } }));
        });

        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const newItem = { id: crypto.randomUUID(), text: '', done: false };
            node.checklistItems!.splice(index + 1, 0, newItem);
            renderBody();
            el.dispatchEvent(new CustomEvent('node-updated', { bubbles: true, detail: { id: node.id } }));
            setTimeout(() => {
              const inputs = list.querySelectorAll<HTMLInputElement>('.sticky-check-input');
              inputs[index + 1]?.focus();
            }, 10);
          } else if (e.key === 'Backspace' && !input.value && node.checklistItems!.length > 1) {
            e.preventDefault();
            node.checklistItems!.splice(index, 1);
            renderBody();
            el.dispatchEvent(new CustomEvent('node-updated', { bubbles: true, detail: { id: node.id } }));
            setTimeout(() => {
              const inputs = list.querySelectorAll<HTMLInputElement>('.sticky-check-input');
              const targetIdx = Math.max(0, index - 1);
              inputs[targetIdx]?.focus();
            }, 10);
          }
        });

        delItemBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (node.checklistItems!.length > 1) {
            node.checklistItems!.splice(index, 1);
          } else {
            node.checklistItems![0] = { id: crypto.randomUUID(), text: '', done: false };
          }
          renderBody();
          el.dispatchEvent(new CustomEvent('node-updated', { bubbles: true, detail: { id: node.id } }));
        });

        itemRow.appendChild(checkbox);
        itemRow.appendChild(input);
        itemRow.appendChild(delItemBtn);
        list.appendChild(itemRow);
      });

      const addBtn = document.createElement('button');
      addBtn.className = 'sticky-add-item-btn';
      addBtn.textContent = '+ Add item';
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        node.checklistItems!.push({ id: crypto.randomUUID(), text: '', done: false });
        renderBody();
        el.dispatchEvent(new CustomEvent('node-updated', { bubbles: true, detail: { id: node.id } }));
        setTimeout(() => {
          const inputs = list.querySelectorAll<HTMLInputElement>('.sticky-check-input');
          inputs[inputs.length - 1]?.focus();
        }, 10);
      });
      list.appendChild(addBtn);

      bodyContainer.appendChild(list);
    } else {
      // Plain textarea
      const textarea = document.createElement('textarea');
      textarea.className = 'sticky-textarea';
      textarea.placeholder = 'Type paragraph note…';
      textarea.value = node.content || '';
      textarea.style.color = textColor;
      textarea.style.fontSize = `${node.fontSize || 16}px`;
      textarea.style.fontFamily = node.fontFamily || 'Inter, system-ui, sans-serif';
      textarea.style.fontWeight = (node.fontWeight === 'bold' || node.isBold) ? 'bold' : 'normal';
      textarea.style.fontStyle = (node.fontStyle === 'italic' || node.isItalic) ? 'italic' : 'normal';

      textarea.addEventListener('input', () => {
        node.content = textarea.value;
        el.dispatchEvent(new CustomEvent('node-updated', { bubbles: true, detail: { id: node.id } }));
      });

      textarea.addEventListener('pointerdown', () => {
        el.dispatchEvent(new CustomEvent('sticky-focus-target', { bubbles: true, detail: { id: node.id, target: 'body' } }));
      });

      textarea.addEventListener('focus', () => {
        el.classList.add('is-editing');
        el.dispatchEvent(new CustomEvent('sticky-focus-target', { bubbles: true, detail: { id: node.id, target: 'body' } }));
      });

      textarea.addEventListener('blur', () => {
        el.classList.remove('is-editing');
        picker.classList.add('hidden');
      });

      bodyContainer.appendChild(textarea);
    }
  }

  renderBody();

  checkToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    node.isChecklist = !node.isChecklist;
    checkToggleBtn.classList.toggle('is-active', !!node.isChecklist);
    checkToggleBtn.title = node.isChecklist ? 'Switch to text note' : 'Turn into To-Do checklist';

    if (node.isChecklist) {
      if (node.content && node.content.trim()) {
        node.checklistItems = node.content
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((text) => ({ id: crypto.randomUUID(), text, done: false }));
      }
      if (!node.checklistItems || node.checklistItems.length === 0) {
        node.checklistItems = [{ id: crypto.randomUUID(), text: '', done: false }];
      }
    } else {
      if (node.checklistItems && node.checklistItems.length > 0) {
        node.content = node.checklistItems.map((i) => i.text).join('\n');
      }
    }

    renderBody();
    el.dispatchEvent(new CustomEvent('node-updated', { bubbles: true, detail: { id: node.id } }));
  });

  // Resize handle
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'node-resize';
  resizeHandle.title = 'Drag to resize';
  el.appendChild(resizeHandle);

  // Rotate handle
  const rotateHandle = document.createElement('div');
  rotateHandle.className = 'node-rotate';
  rotateHandle.dataset.rotate = 'true';
  rotateHandle.title = 'Drag to rotate (Hold Shift to snap to 15°)';
  el.appendChild(rotateHandle);

  paletteBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    picker.classList.toggle('hidden');
  });

  delBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    el.dispatchEvent(new CustomEvent('node-delete', { bubbles: true, detail: { id: node.id } }));
  });

  return el;
}

export function updateStickyTypography(el: HTMLElement, node: CanvasNode): void {
  const rot = typeof node.rotation === 'number' ? node.rotation : 0;
  el.style.transform = `rotate(${rot}deg)`;

  // Body typography
  const bodySize = `${node.fontSize || 16}px`;
  const bodyFont = node.fontFamily || 'Inter, system-ui, sans-serif';
  const bodyBold = (node.fontWeight === 'bold' || node.isBold) ? 'bold' : 'normal';
  const bodyItalic = (node.fontStyle === 'italic' || node.isItalic) ? 'italic' : 'normal';

  el.style.fontFamily = bodyFont;
  el.style.fontWeight = bodyBold;
  el.style.fontStyle = bodyItalic;

  // Title input (strictly independent typography)
  const titleInput = el.querySelector<HTMLInputElement>('.sticky-title-input');
  if (titleInput) {
    const titleSizes: Record<string, number> = { h1: 28, h2: 24, h3: 20, h4: 18, p: 16 };
    const tLevel = node.titleLevel || node.textType || 'h2';
    const tSize = node.titleFontSize ? `${node.titleFontSize}px` : `${titleSizes[tLevel] || 24}px`;
    const tFont = node.titleFontFamily || 'Inter, system-ui, sans-serif';
    const tBold = (node.titleFontWeight === 'bold' || node.titleIsBold) ? 'bold' : (node.titleFontWeight === 'normal' ? 'normal' : 'bold');
    const tItalic = (node.titleFontStyle === 'italic' || node.titleIsItalic) ? 'italic' : 'normal';

    titleInput.className = `sticky-title-input level-${tLevel}`;
    titleInput.style.fontSize = tSize;
    titleInput.style.fontFamily = tFont;
    titleInput.style.fontWeight = tBold;
    titleInput.style.fontStyle = tItalic;
  }

  // Paragraph / body textarea
  const ta = el.querySelector<HTMLTextAreaElement>('.sticky-textarea');
  if (ta) {
    ta.style.fontSize = bodySize;
    ta.style.fontFamily = bodyFont;
    ta.style.fontWeight = bodyBold;
    ta.style.fontStyle = bodyItalic;
  }

  // Checklist items
  el.querySelectorAll<HTMLInputElement>('.sticky-check-input').forEach((inp) => {
    inp.style.fontSize = bodySize;
    inp.style.fontFamily = bodyFont;
    inp.style.fontWeight = bodyBold;
    inp.style.fontStyle = bodyItalic;
  });
}
