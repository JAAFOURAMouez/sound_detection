import { describe, expect, it } from 'vitest';
import familiesJson from '../../public/models/families.json';
import classMapCsv from '../../public/models/yamnet_class_map.csv?raw';
import { buildFamilyTable, classify, type FamiliesFile, OTHER_FAMILY } from './families';

const file: FamiliesFile = familiesJson;
const classMap = classMapCsv
  .trim()
  .split('\n')
  .slice(1)
  .map((line) => {
    const [index, , ...rest] = line.split(',');
    return { index: Number(index), name: rest.join(',').replace(/^"|"$/g, '') };
  });

describe('families.json', () => {
  it('ne référence que des classes YAMNet existantes, avec leur vrai nom', () => {
    expect(classMap).toHaveLength(521);
    for (const [index, { name }] of Object.entries(file.classes)) {
      expect(classMap[Number(index)]?.name).toBe(name);
    }
  });

  it('couvre les familles critiques de la spécification', () => {
    const table = buildFamilyTable(file);
    const byName = (name: string) => classMap.find((c) => c.name === name)?.index ?? -1;
    expect(table.familyOf(byName('Smoke detector, smoke alarm'))).toBe('smoke_fire');
    expect(table.familyOf(byName('Siren'))).toBe('alarm');
    expect(table.familyOf(byName('Shatter'))).toBe('glass');
    expect(table.familyOf(byName('Slam'))).toBe('impact');
    expect(table.familyOf(byName('Door'))).toBe('impact');
    expect(table.familyOf(byName('Fire alarm'))).toBe('smoke_fire');
    expect(table.familyOf(byName('Screaming'))).toBe('voice_distress');
    expect(table.familyOf(byName('Mechanisms'))).toBe('mechanical');
    expect(table.severityOf('smoke_fire')).toBe(3);
    expect(table.severityOf('ambient')).toBe(0);
  });

  it('range les classes non listées dans « other »', () => {
    const table = buildFamilyTable(file);
    expect(table.familyOf(9_999)).toBe(OTHER_FAMILY);
  });
});

describe('buildFamilyTable', () => {
  it('refuse une gravité hors de 0 à 3 ou une famille inconnue', () => {
    expect(() =>
      buildFamilyTable({
        version: 1,
        model: 'x',
        families: { other: { severity: 5 } },
        classes: {},
      }),
    ).toThrow();
    expect(() =>
      buildFamilyTable({
        version: 1,
        model: 'x',
        families: { other: { severity: 0 } },
        classes: { '1': { family: 'nope', name: 'x' } },
      }),
    ).toThrow();
  });
});

describe('classify', () => {
  const table = buildFamilyTable({
    version: 1,
    model: 'test',
    families: { glass: { severity: 2 }, ambient: { severity: 0 }, other: { severity: 0 } },
    classes: {
      '0': { family: 'glass', name: 'Glass' },
      '1': { family: 'glass', name: 'Shatter' },
      '2': { family: 'ambient', name: 'Silence' },
    },
  });

  it('renvoie le top-k trié avec la famille de chaque classe', () => {
    const result = classify(
      [
        { index: 2, name: 'Silence', score: 0.3 },
        { index: 0, name: 'Glass', score: 0.6 },
        { index: 7, name: 'Music', score: 0.1 },
        { index: 1, name: 'Shatter', score: 0.5 },
      ],
      table,
    );
    expect(result.top.map((c) => [c.name, c.family])).toEqual([
      ['Glass', 'glass'],
      ['Shatter', 'glass'],
      ['Silence', 'ambient'],
    ]);
  });

  it('combine les classes d’une famille par « ou » probabiliste', () => {
    const result = classify(
      [
        { index: 0, name: 'Glass', score: 0.6 },
        { index: 1, name: 'Shatter', score: 0.5 },
        { index: 2, name: 'Silence', score: 0.7 },
      ],
      table,
    );
    expect(result.families[0]?.family).toBe('glass');
    expect(result.families[0]?.score).toBeCloseTo(1 - 0.4 * 0.5);
    expect(result.dominant?.family).toBe('glass');
    expect(result.dominant?.severity).toBe(2);
  });

  it('privilégie la famille la plus grave parmi les familles confiantes', () => {
    const graded = buildFamilyTable({
      version: 1,
      model: 'test',
      families: { alarm: { severity: 2 }, smoke: { severity: 3 }, other: { severity: 0 } },
      classes: {
        '0': { family: 'alarm', name: 'Alarm' },
        '1': { family: 'smoke', name: 'Fire alarm' },
      },
    });
    const confident = classify(
      [
        { index: 0, name: 'Alarm', score: 0.99 },
        { index: 1, name: 'Fire alarm', score: 0.9 },
      ],
      graded,
    );
    expect(confident.families[0]?.family).toBe('alarm');
    expect(confident.dominant?.family).toBe('smoke');

    // Une famille grave mais peu probable ne prend pas le dessus.
    const unsure = classify(
      [
        { index: 0, name: 'Alarm', score: 0.99 },
        { index: 1, name: 'Fire alarm', score: 0.3 },
      ],
      graded,
    );
    expect(unsure.dominant?.family).toBe('alarm');
  });

  it('ignore « other » et ne désigne pas de famille sous le seuil', () => {
    const result = classify(
      [
        { index: 9, name: 'Music', score: 0.9 },
        { index: 2, name: 'Silence', score: 0.05 },
      ],
      table,
    );
    expect(result.families.map((f) => f.family)).toEqual(['ambient']);
    expect(result.dominant).toBeNull();
  });
});
