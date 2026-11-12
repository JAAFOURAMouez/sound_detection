// Familles d'événements : regroupe les classes du modèle et en déduit une gravité.

export type Severity = 0 | 1 | 2 | 3;

export const OTHER_FAMILY = 'other';

export interface FamiliesFile {
  version: number;
  model: string;
  families: Record<string, { severity: number }>;
  classes: Record<string, { family: string; name: string }>;
}

export interface FamilyTable {
  /** Famille de chaque indice de classe ; `other` par défaut. */
  familyOf: (classIndex: number) => string;
  severityOf: (family: string) => Severity;
  families: readonly string[];
}

function isSeverity(value: number): value is Severity {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

/** Valide le fichier JSON et construit la table de correspondance. */
export function buildFamilyTable(file: FamiliesFile): FamilyTable {
  const severities = new Map<string, Severity>();
  for (const [name, { severity }] of Object.entries(file.families)) {
    if (!isSeverity(severity))
      throw new Error(`Gravité invalide pour ${name} : ${String(severity)}`);
    severities.set(name, severity);
  }
  if (!severities.has(OTHER_FAMILY)) throw new Error('La famille « other » est obligatoire');

  const byIndex = new Map<number, string>();
  for (const [index, { family }] of Object.entries(file.classes)) {
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0) throw new Error(`Indice de classe invalide : ${index}`);
    if (!severities.has(family))
      throw new Error(`Famille inconnue pour la classe ${index} : ${family}`);
    byIndex.set(i, family);
  }

  return {
    familyOf: (classIndex) => byIndex.get(classIndex) ?? OTHER_FAMILY,
    severityOf: (family) => severities.get(family) ?? 0,
    families: [...severities.keys()],
  };
}

export interface ClassScore {
  index: number;
  name: string;
  score: number;
}

export interface RankedClass extends ClassScore {
  family: string;
}

export interface FamilyScore {
  family: string;
  score: number;
  severity: Severity;
}

export interface Classification {
  /** Les k classes les plus probables. */
  top: RankedClass[];
  /** Scores par famille, décroissants (hors `other`). */
  families: FamilyScore[];
  /** Famille la plus probable (hors `other`), ou null si aucune ne dépasse le seuil. */
  dominant: FamilyScore | null;
}

/**
 * Agrège des scores de classes (sorties sigmoïdes indépendantes de YAMNet) en familles.
 * Score de famille = « ou » probabiliste : 1 − Π(1 − sᵢ), borné dans [0, 1] et croissant
 * quand plusieurs classes voisines s'allument (verre + éclatement + bris…).
 */
export function classify(
  scores: readonly ClassScore[],
  table: FamilyTable,
  { topK = 3, minFamilyScore = 0.15 }: { topK?: number; minFamilyScore?: number } = {},
): Classification {
  const top = [...scores]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((c) => ({ ...c, family: table.familyOf(c.index) }));

  const complement = new Map<string, number>();
  for (const { index, score } of scores) {
    const family = table.familyOf(index);
    if (family === OTHER_FAMILY) continue;
    const s = Math.min(1, Math.max(0, score));
    complement.set(family, (complement.get(family) ?? 1) * (1 - s));
  }

  const families = [...complement.entries()]
    .map(([family, c]) => ({ family, score: 1 - c, severity: table.severityOf(family) }))
    .sort((a, b) => b.score - a.score || b.severity - a.severity);

  const best = families[0];
  return { top, families, dominant: best && best.score >= minFamilyScore ? best : null };
}
