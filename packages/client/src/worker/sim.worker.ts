// ADR-006 §2 — Worker entry: wires `self.postMessage` to SimHost and drives it with setInterval(4 ms).
// Owner: sim-engineer (W2). The only client code allowed to import @reinos/sim at runtime lives in worker/.
import { createSimHost } from './host';
import type { FromWorker, ToWorker } from './protocol';

interface WorkerScope {
  postMessage(msg: FromWorker, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
  close(): void;
}
const scope = globalThis as unknown as WorkerScope;

const host = createSimHost({
  post: (msg, transfer) => scope.postMessage(msg, transfer ?? []),
  now: () => performance.now(),
});
const timer = setInterval(() => host.pump(), 4);
scope.onmessage = (e) => {
  host.onMessage(e.data);
  if (e.data.t === 'stop') {
    clearInterval(timer);
    host.dispose();
    scope.close();
  }
};
