import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSave, loadGame, loadOptions, saveGame, saveOptions } from '../src/ui/save';
import { newGame } from './helpers';

function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => data.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

afterEach(() => vi.unstubAllGlobals());

describe('Spielstand', () => {
  it('überlebt Speichern und Laden unverändert', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const state = newGame(3);
    expect(saveGame({ state, viewer: 1 })).toBe(true);
    expect(loadGame()).toEqual({ state, viewer: 1 });
    clearSave();
    expect(loadGame()).toBeNull();
  });
  it('ohne localStorage läuft alles ohne Absturz weiter', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('gesperrt'); },
      setItem: () => { throw new Error('gesperrt'); },
      removeItem: () => { throw new Error('gesperrt'); },
    });
    expect(saveGame({ state: newGame(2), viewer: 0 })).toBe(false);
    expect(loadGame()).toBeNull();
    expect(() => clearSave()).not.toThrow();
    expect(loadOptions()).toEqual({ showOdds: true });
    expect(() => saveOptions({ showOdds: false })).not.toThrow();
  });
  it('beschädigte Daten führen nicht zum Absturz', () => {
    const store = fakeStorage();
    store.setItem('banner-der-reiche.save.v1', '{kaputt');
    vi.stubGlobal('localStorage', store);
    expect(loadGame()).toBeNull();
    store.setItem('banner-der-reiche.save.v1', '{"state":{}}');
    expect(loadGame()).toBeNull();
  });
  it('Optionen merken die abgeschaltete Siegchance', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    saveOptions({ showOdds: false });
    expect(loadOptions().showOdds).toBe(false);
  });
});
