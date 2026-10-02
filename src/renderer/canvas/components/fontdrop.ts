export type DropItem = { value: string; label: string; previewFont?: string; color?: string };

export type Drop = {
  setItems(items: DropItem[]): void;
  /** null disables the pill (no card selected) and shows the placeholder. */
  setValue(value: string | null): void;
  getValue(): string | null;
};

const openPanels: HTMLElement[] = [];

export function closeAllDrops(): void {
  for (const panel of openPanels.splice(0)) panel.classList.add('hidden');
}

export function createDrop(
  btn: HTMLButtonElement,
  panel: HTMLElement,
  placeholder: string,
  onPick: (value: string) => void
): Drop {
  let items: DropItem[] = [];
  let value: string | null = null;

  function close(): void {
    panel.classList.add('hidden');
    const i = openPanels.indexOf(panel);
    if (i >= 0) openPanels.splice(i, 1);
  }

  function labelFor(v: string): string {
    return items.find((it) => it.value === v)?.label ?? v;
  }

  // preventDefault keeps any contenteditable selection alive for execCommand drops;
  // stopPropagation stops the document-level close from hiding the panel mid-click
  // (a hidden panel eats the row's click, so onPick would never fire).
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  panel.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (btn.disabled) return;
    const wasHidden = panel.classList.contains('hidden');
    closeAllDrops();
    if (!wasHidden) return;
    panel.replaceChildren();
    for (const it of items) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'drop-item' + (it.value === value ? ' sel' : '');
      row.textContent = it.label;
      if (it.previewFont) row.style.fontFamily = it.previewFont;
      if (it.color) row.style.color = it.color;
      row.dataset.value = it.value;
      panel.appendChild(row);
    }
    panel.classList.remove('hidden');
    // Panel is scroll-clipped (invisible scrollbar); bring the current pick into view.
    panel.querySelector('.drop-item.sel')?.scrollIntoView({ block: 'nearest' });
    openPanels.push(panel);
  });

  panel.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.drop-item');
    if (!row || btn.disabled) return;
    value = row.dataset.value!;
    btn.textContent = labelFor(value);
    close();
    onPick(value);
  });

  document.addEventListener('pointerdown', close);

  return {
    setItems(newItems) {
      items = newItems;
    },
    setValue(v) {
      value = v;
      btn.disabled = v === null;
      btn.textContent = v === null ? placeholder : labelFor(v);
      btn.style.color = v === null ? '' : (items.find((it) => it.value === v)?.color ?? '');
    },
    getValue: () => value
  };
}
