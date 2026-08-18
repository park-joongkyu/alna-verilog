// In-memory "who's active right now" tracker. Deliberately not persisted to
// disk - presence is inherently ephemeral (a restart naturally clears it as
// everyone's next request re-marks them), and writing on every authenticated
// request would add disk I/O to the hottest path in the app.
const lastSeen = new Map(); // username -> ms timestamp

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export function touch(username) {
  lastSeen.set(username, Date.now());
}

export function listOnline(windowMs = ONLINE_WINDOW_MS) {
  const now = Date.now();
  const online = [];
  for (const [username, ts] of lastSeen) {
    if (now - ts <= windowMs) {
      online.push({ username, lastSeenAt: new Date(ts).toISOString() });
    }
  }
  return online;
}
