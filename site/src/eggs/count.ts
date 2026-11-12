/** The egg counter: which eggs have been found (localStorage) and the line in the footer that reports it. */
export const EGGS = ['console', 'terminal', 'hire', 'force', 'konami', 'away', 'eyes', 'volatile'] as const;
export type Egg = (typeof EGGS)[number];

const KEY = 'eggs';
let found = new Set<Egg>();
let line: HTMLElement | null = null;
let onAll: (() => void) | null = null;

function read(): Set<Egg> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]') as string[];
    return new Set(v.filter((x): x is Egg => (EGGS as readonly string[]).includes(x)));
  } catch {
    return new Set();
  }
}

function paint() {
  if (!found.size) return;
  if (!line) {
    const foot = document.querySelector('.foot');
    if (!foot) return;
    line = document.createElement('p');
    line.className = 'foot-eggs';
    line.setAttribute('role', 'status');
    foot.appendChild(line);
  }
  line.textContent = `eggs found: ${found.size}/${EGGS.length}`;
}

export function initCount(all: () => void) {
  onAll = all;
  found = read();
  paint();
}

/** record a find; returns true when it is a new one */
export function mark(id: Egg): boolean {
  if (found.has(id)) return false;
  found.add(id);
  try { localStorage.setItem(KEY, JSON.stringify([...found])); } catch { /* storage unavailable: the count lasts for this visit */ }
  paint();
  if (found.size === EGGS.length) onAll?.();
  return true;
}
export function total() { return found.size; }
