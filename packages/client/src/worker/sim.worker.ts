// ADR-006 §2 — Worker entry (≤ 30 lines when implemented): wires `self.postMessage` to SimHost.
// Owner: sim-engineer (W2). The only client code allowed to import @reinos/sim at runtime lives in worker/.
export {};
