// Repère les fenêtres d'analyse qui contiennent la voix de l'assistant.
// Les positions sont comptées en échantillons du flux 16 kHz, pas à l'heure d'arrivée des
// résultats : le worker rend ses fenêtres avec un retard variable (file d'inférence), et une
// fenêtre analysée après la fin de la parole peut encore contenir la voix.

/** Traîne après la fin de la parole : réverbération de la pièce, latence de la sortie audio. */
export const ECHO_TAIL_SAMPLES = 16_000;
/** Durée couverte par une fenêtre d'analyse (la plus longue des deux modèles, 1 s). */
export const ECHO_WINDOW_SAMPLES = 16_000;
const MAX_SPANS = 16;

interface Span {
  start: number;
  end: number;
}

export class EchoGuard {
  private spans: Span[] = [];
  private openAt: number | null = null;

  constructor(
    private readonly tail = ECHO_TAIL_SAMPLES,
    private readonly window = ECHO_WINDOW_SAMPLES,
  ) {}

  /** La synthèse vocale commence : `position` = échantillons envoyés à l'analyse jusqu'ici. */
  begin(position: number): void {
    this.openAt ??= position;
  }

  /** La synthèse vocale s'arrête. */
  end(position: number): void {
    if (this.openAt === null) return;
    this.spans.push({ start: this.openAt, end: position + this.tail });
    if (this.spans.length > MAX_SPANS) this.spans.shift();
    this.openAt = null;
  }

  /** Vrai si la fenêtre qui se termine à `windowEnd` recouvre la parole (ou sa traîne). */
  covers(windowEnd: number): boolean {
    const windowStart = windowEnd - this.window;
    if (this.openAt !== null && windowEnd > this.openAt) return true;
    return this.spans.some((s) => windowEnd > s.start && windowStart < s.end);
  }
}
