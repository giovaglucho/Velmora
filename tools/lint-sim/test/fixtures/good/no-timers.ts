export function a(queue: Array<() => void>): void {
  queue.push(() => undefined);
}
