// Lädt die JSON-Inhalte typisiert und prüft ihre Konsistenz.
import realmsJson from '../content/reiche.json';
import creaturesJson from '../content/kreaturen.json';
import buildingsJson from '../content/gebaeude.json';
import heroesJson from '../content/helden.json';
import spellsJson from '../content/zauber.json';
import skillsJson from '../content/fertigkeiten.json';
import artifactsJson from '../content/artefakte.json';
import guardiansJson from '../content/waechter.json';
import weekCardsJson from '../content/wochenkarten.json';
import type {
  ArtifactDef, BuildingDef, BuildingId, CreatureDef, GuardianDef, HeroDef, RealmDef,
  SkillDef, SpellDef, Tier, WeekCardDef,
} from './types';

const byId = <T extends { id: string }>(items: T[]): Record<string, T> =>
  Object.fromEntries(items.map(i => [i.id, i]));

export const REALMS = realmsJson as unknown as RealmDef[];
export const CREATURES = creaturesJson as unknown as CreatureDef[];
export const BUILDINGS = buildingsJson as unknown as BuildingDef[];
export const HEROES = heroesJson as unknown as HeroDef[];
export const SPELLS = spellsJson as unknown as SpellDef[];
export const SKILLS = skillsJson as unknown as SkillDef[];
export const ARTIFACTS = artifactsJson as unknown as ArtifactDef[];
export const GUARDIANS = guardiansJson as unknown as GuardianDef[];
export const WEEK_CARDS = weekCardsJson as unknown as WeekCardDef[];

export const realmById = byId(REALMS);
export const creatureById = byId(CREATURES);
export const buildingById = byId(BUILDINGS) as Record<BuildingId, BuildingDef>;
export const heroDefById = byId(HEROES);
export const spellById = byId(SPELLS);
export const skillById = byId(SKILLS);
export const artifactById = byId(ARTIFACTS);
export const weekCardById = byId(WEEK_CARDS);

export const creatureOfRealm = (realmId: string, tier: Tier): CreatureDef => {
  const c = realmById[realmId].creatures.map(id => creatureById[id]).find(x => x.tier === tier);
  if (!c) throw new Error(`Reich ${realmId} hat keine Kreatur der Stufe ${tier}`);
  return c;
};

/** Liefert alle Inhaltsfehler; eine leere Liste bedeutet: konsistent. */
export function validateContent(): string[] {
  const errors: string[] = [];
  const unique = (name: string, items: { id: string }[]) => {
    const seen = new Set<string>();
    for (const i of items) {
      if (seen.has(i.id)) errors.push(`${name}: doppelte id ${i.id}`);
      seen.add(i.id);
    }
  };
  unique('Reiche', REALMS); unique('Kreaturen', CREATURES); unique('Gebäude', BUILDINGS);
  unique('Helden', HEROES); unique('Zauber', SPELLS); unique('Fertigkeiten', SKILLS);
  unique('Artefakte', ARTIFACTS); unique('Wächter', GUARDIANS); unique('Wochenkarten', WEEK_CARDS);

  for (const r of REALMS) {
    const tiers = r.creatures.map(id => creatureById[id]?.tier).sort();
    if (tiers.join() !== '1,2,3,4') errors.push(`Reich ${r.id}: braucht je eine Kreatur der Stufen I-IV`);
    if (HEROES.filter(h => h.realm === r.id).length < 2) errors.push(`Reich ${r.id}: braucht mindestens 2 Helden`);
  }
  for (const c of CREATURES) {
    if (c.realm !== 'neutral' && !realmById[c.realm]) errors.push(`Kreatur ${c.id}: unbekanntes Reich`);
  }
  for (const h of HEROES) {
    if (h.startSpell && !spellById[h.startSpell]) errors.push(`Held ${h.id}: unbekannter Startzauber`);
  }
  for (const g of GUARDIANS) {
    if (g.army.length > 3) errors.push(`Wächter ${g.id}: zu viele Stapel`);
    for (const s of g.army) {
      if (!creatureById[s.creatureId]) errors.push(`Wächter ${g.id}: unbekannte Kreatur ${s.creatureId}`);
    }
  }
  for (const b of BUILDINGS) {
    if (b.requires && !buildingById[b.requires]) errors.push(`Gebäude ${b.id}: unbekannte Voraussetzung`);
  }
  return errors;
}
