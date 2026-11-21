// Binary min-heap over (f, h, id) with a total order: no ties are left unresolved (ADR-005 §10).
// Backed by growable Int32Arrays; growth only happens while warming up.
export interface Heap {
  size: number;
  /** Fields of the entry removed by the last pop(). */
  topF: number;
  topH: number;
  topId: number;
  push(f: number, h: number, id: number): void;
  pop(): void;
  clear(): void;
}

export function createHeap(initialCapacity = 1024): Heap {
  let cap = initialCapacity;
  let hf = new Int32Array(cap);
  let hh = new Int32Array(cap);
  let hi = new Int32Array(cap);

  const less = (f: number, h: number, id: number, j: number): boolean => {
    const jf = hf[j] as number;
    if (f !== jf) return f < jf;
    const jh = hh[j] as number;
    if (h !== jh) return h < jh;
    return id < (hi[j] as number);
  };

  const heap: Heap = {
    size: 0,
    topF: 0,
    topH: 0,
    topId: 0,
    push(f, h, id) {
      if (heap.size === cap) {
        cap = cap * 2;
        const nf = new Int32Array(cap);
        const nh = new Int32Array(cap);
        const ni = new Int32Array(cap);
        nf.set(hf);
        nh.set(hh);
        ni.set(hi);
        hf = nf;
        hh = nh;
        hi = ni;
      }
      let i = heap.size++;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (!less(f, h, id, p)) break;
        hf[i] = hf[p] as number;
        hh[i] = hh[p] as number;
        hi[i] = hi[p] as number;
        i = p;
      }
      hf[i] = f;
      hh[i] = h;
      hi[i] = id;
    },
    pop() {
      heap.topF = hf[0] as number;
      heap.topH = hh[0] as number;
      heap.topId = hi[0] as number;
      const n = --heap.size;
      if (n === 0) return;
      const f = hf[n] as number;
      const h = hh[n] as number;
      const id = hi[n] as number;
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        const r = c + 1;
        if (r < n) {
          const rf = hf[r] as number;
          const cf = hf[c] as number;
          if (
            rf < cf ||
            (rf === cf &&
              ((hh[r] as number) < (hh[c] as number) ||
                (hh[r] === hh[c] && (hi[r] as number) < (hi[c] as number))))
          )
            c = r;
        }
        const cf2 = hf[c] as number;
        const ch2 = hh[c] as number;
        const ci2 = hi[c] as number;
        // stop when (f,h,id) <= child
        if (f < cf2 || (f === cf2 && (h < ch2 || (h === ch2 && id < ci2)))) break;
        hf[i] = cf2;
        hh[i] = ch2;
        hi[i] = ci2;
        i = c;
      }
      hf[i] = f;
      hh[i] = h;
      hi[i] = id;
    },
    clear() {
      heap.size = 0;
    },
  };
  return heap;
}
