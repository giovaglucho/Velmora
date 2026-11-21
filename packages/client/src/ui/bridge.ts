// ADR-006 §8.1 — only writer of the store (10 Hz + immediate on selection change). Owner: ui-engineer (U4).
// The only ui/ file allowed to import worker/render/input at runtime.
export {};
