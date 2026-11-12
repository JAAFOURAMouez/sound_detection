// Tampon circulaire de Float32 : garde les N derniers échantillons.

export class RingBuffer {
  readonly capacity: number;
  private readonly data: Float32Array;
  private writeIndex = 0;
  private filled = 0;
  private written = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error('La capacité doit être un entier positif');
    }
    this.capacity = capacity;
    this.data = new Float32Array(capacity);
  }

  /** Nombre d'échantillons valides (≤ capacité). */
  get length(): number {
    return this.filled;
  }

  /** Nombre total d'échantillons écrits depuis la création ou la remise à zéro. */
  get totalWritten(): number {
    return this.written;
  }

  push(samples: Float32Array): void {
    const n = samples.length;
    this.written += n;
    if (n >= this.capacity) {
      this.data.set(samples.subarray(n - this.capacity));
      this.writeIndex = 0;
      this.filled = this.capacity;
      return;
    }
    const firstPart = Math.min(n, this.capacity - this.writeIndex);
    this.data.set(samples.subarray(0, firstPart), this.writeIndex);
    if (firstPart < n) {
      this.data.set(samples.subarray(firstPart), 0);
    }
    this.writeIndex = (this.writeIndex + n) % this.capacity;
    this.filled = Math.min(this.capacity, this.filled + n);
  }

  /**
   * Copie les `count` derniers échantillons, dans l'ordre chronologique.
   * Si le tampon en contient moins, le début est complété par des zéros.
   */
  latest(count: number, out: Float32Array = new Float32Array(count)): Float32Array {
    if (count > this.capacity) {
      throw new Error('Demande supérieure à la capacité du tampon');
    }
    if (out.length < count) {
      throw new Error('Tampon de sortie trop petit');
    }
    const available = Math.min(count, this.filled);
    const pad = count - available;
    out.fill(0, 0, pad);
    const start = (this.writeIndex - available + this.capacity) % this.capacity;
    const firstPart = Math.min(available, this.capacity - start);
    out.set(this.data.subarray(start, start + firstPart), pad);
    if (firstPart < available) {
      out.set(this.data.subarray(0, available - firstPart), pad + firstPart);
    }
    return out;
  }

  clear(): void {
    this.data.fill(0);
    this.writeIndex = 0;
    this.filled = 0;
    this.written = 0;
  }
}
