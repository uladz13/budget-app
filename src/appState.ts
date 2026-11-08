/**
 * Состояние приложения вне экранов (BA-008): готова новая версия, база занята или изменена другой копией.
 * Простое наблюдаемое хранилище без зависимостей.
 */
import { useEffect, useState } from 'preact/hooks';

export interface AppState {
  /** Новая версия скачана и ждёт: применить — `applyUpdate()`. */
  updateReady: boolean;
  /** Другая копия приложения обновила схему базы — эту копию нужно перезапустить. */
  dbStale: boolean;
  /** Открытие базы ждёт, пока закроется другая копия приложения. */
  dbBlocked: boolean;
}

let state: AppState = { updateReady: false, dbStale: false, dbBlocked: false };
const listeners = new Set<() => void>();

export function setAppState(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}

export function getAppState(): AppState {
  return state;
}

export function useAppState(): AppState {
  const [s, set] = useState(state);
  useEffect(() => {
    const fn = () => set(state);
    listeners.add(fn);
    fn();
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return s;
}

/** Применить новую версию (задаёт main.tsx после регистрации service worker). */
let updater: (() => void) | null = null;

export function setUpdater(fn: () => void): void {
  updater = fn;
}

export function applyUpdate(): void {
  if (updater) updater();
  else location.reload();
}
