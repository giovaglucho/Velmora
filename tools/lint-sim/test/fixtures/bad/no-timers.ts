export function a(): void {
  setTimeout(() => undefined, 10); // expect-violation: no-timers
  setInterval(() => undefined, 10); // expect-violation: no-timers
}
