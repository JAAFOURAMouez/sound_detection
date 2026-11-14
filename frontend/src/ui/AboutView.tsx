import { t } from '../i18n';

const REPOSITORY = 'https://github.com/JAAFOURAMouez/sound_detection';

/** Page « À propos » : architecture, vie privée, mesures et limites. */
export function AboutView() {
  const a = t.about;
  return (
    <main id="contenu" tabIndex={-1} className="sg-about" aria-labelledby="about-title">
      <h1 id="about-title">{a.title}</h1>
      <p className="sg-about__intro">{a.intro}</p>

      <section aria-labelledby="about-chain">
        <h2 id="about-chain" className="sg-label">
          {a.chainTitle}
        </h2>
        <div className="sg-about__chain">
          <div className="sg-about__zone">
            <p className="sg-about__zone-label sg-label">{a.browser}</p>
            <ol>
              {a.chain.map(([name, detail]) => (
                <li key={name}>
                  <strong>{name}</strong>
                  <span>{detail}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="sg-about__zone sg-about__zone--server">
            <p className="sg-about__zone-label sg-label">{a.server}</p>
            <ol>
              <li>
                <strong>{a.serverStep[0]}</strong>
                <span>{a.serverStep[1]}</span>
              </li>
            </ol>
          </div>
        </div>
      </section>

      <section aria-labelledby="about-privacy">
        <h2 id="about-privacy" className="sg-label">
          {a.privacyTitle}
        </h2>
        <ul className="sg-about__list">
          {a.privacy.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="about-models">
        <h2 id="about-models" className="sg-label">
          {a.modelsTitle}
        </h2>
        <p>{a.modelsIntro}</p>
        <div className="sg-about__table">
          <table>
            <thead>
              <tr>
                {a.modelsHead.map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {a.models.map(([name, ...values]) => (
                <tr key={name}>
                  <th scope="row">{name}</th>
                  {values.map((v, i) => (
                    <td key={i}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>{a.anomaly}</p>
      </section>

      <section aria-labelledby="about-limits">
        <h2 id="about-limits" className="sg-label">
          {a.limitsTitle}
        </h2>
        <ul className="sg-about__list sg-about__list--limits">
          {a.limits.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="about-licenses">
        <h2 id="about-licenses" className="sg-label">
          {a.licensesTitle}
        </h2>
        <p>{a.licenses}</p>
        <p>
          <a href={REPOSITORY} rel="noopener noreferrer" target="_blank">
            {a.source}
          </a>
        </p>
      </section>
    </main>
  );
}
