import { describe, expect, it } from 'vitest';
import { clipFromRing, RingBuffer } from './ringBuffer';

const seq = (from: number, to: number) =>
  Float32Array.from({ length: to - from }, (_, i) => from + i);

describe('RingBuffer', () => {
  it('complète par des zéros tant qu’il n’est pas plein', () => {
    const rb = new RingBuffer(5);
    rb.push(seq(1, 3));
    expect(rb.length).toBe(2);
    expect(Array.from(rb.latest(4))).toEqual([0, 0, 1, 2]);
  });

  it('garde les derniers échantillons dans l’ordre après débordement', () => {
    const rb = new RingBuffer(5);
    rb.push(seq(0, 3));
    rb.push(seq(3, 8));
    expect(rb.length).toBe(5);
    expect(rb.totalWritten).toBe(8);
    expect(Array.from(rb.latest(5))).toEqual([3, 4, 5, 6, 7]);
    expect(Array.from(rb.latest(2))).toEqual([6, 7]);
  });

  it('accepte un bloc plus grand que la capacité', () => {
    const rb = new RingBuffer(4);
    rb.push(seq(0, 10));
    expect(Array.from(rb.latest(4))).toEqual([6, 7, 8, 9]);
  });

  it('traverse correctement la frontière de fin de tableau', () => {
    const rb = new RingBuffer(4);
    for (let i = 0; i < 11; i++) rb.push(Float32Array.of(i));
    expect(Array.from(rb.latest(4))).toEqual([7, 8, 9, 10]);
  });

  it('écrit dans un tampon de sortie fourni et se vide', () => {
    const rb = new RingBuffer(3);
    rb.push(seq(1, 4));
    const out = new Float32Array(3);
    expect(rb.latest(3, out)).toBe(out);
    rb.clear();
    expect(rb.length).toBe(0);
    expect(Array.from(rb.latest(3))).toEqual([0, 0, 0]);
  });

  it('refuse les demandes invalides', () => {
    expect(() => new RingBuffer(0)).toThrow();
    const rb = new RingBuffer(3);
    expect(() => rb.latest(4)).toThrow();
    expect(() => rb.latest(3, new Float32Array(2))).toThrow();
  });
});

describe('clipFromRing', () => {
  it('extrait un intervalle du flux d’après sa position', () => {
    const rb = new RingBuffer(10);
    rb.push(seq(0, 25)); // flux 0..24 ; le tampon garde 15..24
    expect(Array.from(clipFromRing(rb, 25, 17, 20) ?? [])).toEqual([17, 18, 19]);
    expect(Array.from(clipFromRing(rb, 25, 22, 40) ?? [])).toEqual([22, 23, 24]);
  });

  it('refuse un début sorti du tampon, sauf tant qu’il n’est pas plein', () => {
    const full = new RingBuffer(10);
    full.push(seq(0, 25));
    expect(clipFromRing(full, 25, 10, 20)).toBeNull();
    const partial = new RingBuffer(10);
    partial.push(seq(0, 4));
    expect(Array.from(clipFromRing(partial, 4, -5, 3) ?? [])).toEqual([0, 1, 2]);
  });
});
