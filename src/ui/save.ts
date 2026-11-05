// Spielstand in localStorage. Jeder Zugriff ist abgesichert, das Spiel läuft auch ohne Speicher.
import type { GameState, PlayerId } from '../engine/types';

const KEY = 'banner-der-reiche.save.v1';
const OPTIONS_KEY = 'banner-der-reiche.options.v1';

export interface SaveGame { state: GameState; viewer: PlayerId }
export interface Options { showOdds: boolean }

export function saveGame(save: SaveGame): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(): SaveGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveGame;
    return parsed?.state?.tiles ? parsed : null;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nichts zu tun: Ohne Speicher gibt es auch nichts zu löschen.
  }
}

export function loadOptions(): Options {
  try {
    const raw = localStorage.getItem(OPTIONS_KEY);
    return raw ? { showOdds: true, ...(JSON.parse(raw) as Partial<Options>) } : { showOdds: true };
  } catch {
    return { showOdds: true };
  }
}

export function saveOptions(o: Options): void {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(o));
  } catch {
    // Optionen sind Komfort; ohne Speicher gelten sie nur für diese Sitzung.
  }
}
