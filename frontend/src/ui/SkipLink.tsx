import { t } from '../i18n';

/**
 * Lien d'évitement : premier arrêt du clavier, il mène au contenu principal (#contenu).
 * Le défilement est géré à la main : l'adresse (#historique, #a-propos) sert à la navigation.
 */
export function SkipLink() {
  return (
    <a
      className="sg-skip"
      href="#contenu"
      onClick={(e) => {
        e.preventDefault();
        const main = document.getElementById('contenu');
        main?.focus();
        main?.scrollIntoView();
      }}
    >
      {t.main.skip}
    </a>
  );
}
