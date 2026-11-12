// Fenêtre glissante sur un flux de blocs : produit des fenêtres de taille fixe tous les `hop` échantillons.

export interface AudioWindow {
  samples: Float32Array;
  /** Indice absolu (depuis le début du flux) du premier échantillon après la fenêtre. */
  endSample: number;
}

export class SlidingWindow {
  readonly size: number;
  readonly hop: number;
  private buffer: Float32Array;
  private filled = 0;
  private total = 0;
  private nextEnd: number;

  constructor(size: number, hop: number) {
    if (!Number.isInteger(size) || !Number.isInteger(hop) || size <= 0 || hop <= 0) {
      throw new Error('Taille et pas doivent être des entiers positifs');
    }
    this.size = size;
    this.hop = hop;
    this.buffer = new Float32Array(size + hop);
    this.nextEnd = size;
  }

  /** Ajoute un bloc et renvoie les fenêtres complètes qu'il a rendues disponibles. */
  push(chunk: Float32Array): AudioWindow[] {
    const windows: AudioWindow[] = [];
    let offset = 0;
    while (offset < chunk.length) {
      if (this.filled === this.buffer.length) {
        // Garde seulement les `size` derniers échantillons.
        this.buffer.copyWithin(0, this.filled - this.size, this.filled);
        this.filled = this.size;
      }
      const take = Math.min(chunk.length - offset, this.buffer.length - this.filled);
      this.buffer.set(chunk.subarray(offset, offset + take), this.filled);
      this.filled += take;
      this.total += take;
      offset += take;

      while (this.total >= this.nextEnd) {
        const endInBuffer = this.filled - (this.total - this.nextEnd);
        windows.push({
          samples: this.buffer.slice(endInBuffer - this.size, endInBuffer),
          endSample: this.nextEnd,
        });
        this.nextEnd += this.hop;
      }
    }
    return windows;
  }

  reset(): void {
    this.filled = 0;
    this.total = 0;
    this.nextEnd = this.size;
  }
}
