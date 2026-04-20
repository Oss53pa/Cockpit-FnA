// Hook + helpers pour le mode démo
// Le flag est stocké en localStorage ('demo-mode' = '1') + on synchronise
// l'org courante avec 'demo-org'.
import { useSyncExternalStore } from 'react';
import { useApp } from '../store/app';

export const DEMO_FLAG_KEY = 'demo-mode';
export const DEMO_TOUR_STEP_KEY = 'demo-tour-step';
export const DEMO_TOUR_DONE_KEY = 'demo-tour-done';
export const DEMO_ORG_ID = 'demo-org';

const listeners = new Set<() => void>();

function notify() { listeners.forEach((fn) => fn()); }

// Helpers d'écriture (à utiliser depuis l'UI)
export function setDemoMode(on: boolean) {
  if (on) localStorage.setItem(DEMO_FLAG_KEY, '1');
  else localStorage.removeItem(DEMO_FLAG_KEY);
  notify();
}

export function setTourStep(step: number) {
  localStorage.setItem(DEMO_TOUR_STEP_KEY, String(step));
  notify();
}

export function markTourDone() {
  localStorage.setItem(DEMO_TOUR_DONE_KEY, '1');
  notify();
}

export function resetTour() {
  localStorage.removeItem(DEMO_TOUR_STEP_KEY);
  localStorage.removeItem(DEMO_TOUR_DONE_KEY);
  notify();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = () => fn();
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(fn); window.removeEventListener('storage', onStorage); };
}

function getSnapshot() {
  const flag = localStorage.getItem(DEMO_FLAG_KEY) === '1';
  const step = parseInt(localStorage.getItem(DEMO_TOUR_STEP_KEY) || '0', 10) || 0;
  const done = localStorage.getItem(DEMO_TOUR_DONE_KEY) === '1';
  return `${flag ? '1' : '0'}|${step}|${done ? '1' : '0'}`;
}

export function useDemoMode() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, () => '0|0|0');
  const orgId = useApp((s) => s.currentOrgId);
  const [flag, step, done] = snap.split('|');
  const isDemo = flag === '1' && orgId === DEMO_ORG_ID;
  return {
    isDemo,
    isDemoFlag: flag === '1',
    tourStep: parseInt(step, 10),
    tourDone: done === '1',
  };
}
