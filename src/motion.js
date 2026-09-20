export const MOTION_STATES = ["walk", "jump", "guard", "hurt", "ko", "victory"];

export function motionFrame(state, time, verticalSpeed = 0) {
  const row = MOTION_STATES.indexOf(state);
  if (row < 0) return 0;
  const t = Math.max(0, time);
  const pose =
    state === "walk"
      ? Math.floor(t * 10) % 4
      : state === "jump"
        ? verticalSpeed < 0
          ? 1
          : 2
        : state === "guard"
          ? Math.min(2, Math.floor(t * 14))
          : state === "hurt"
            ? Math.min(3, Math.floor(t * 24))
            : Math.min(3, Math.floor(t * (state === "ko" ? 7 : 5)));
  return row * 4 + pose;
}
