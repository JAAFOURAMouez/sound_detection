import { t } from '../i18n';

type FamilyKey = keyof typeof t.families;
type SampleKey = keyof typeof t.demo.samples;

export function familyLabel(family: string): string {
  return family in t.families ? t.families[family as FamilyKey] : family;
}

export function sampleLabel(id: string): string {
  return id in t.demo.samples ? t.demo.samples[id as SampleKey] : id;
}
