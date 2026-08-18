/**
 * Stamp every API response with the running build id.
 *
 * The server half of the version handshake: the client wraps `fetch`
 * (app/plugins/app-update.client.ts) and compares this header against its own
 * baked build id on every same-origin call, so a stale client learns it is stale
 * on its very next request. That closes the two gaps a poll leaves open — a tab
 * left open and idle that never navigates, and client/server skew during the
 * seconds a rollout is only half-live.
 *
 * Scoped to /api/* — static assets are immutable-hashed and don't need it.
 */
export default defineEventHandler((event) => {
  if (!event.path.startsWith("/api/")) return;
  const buildId = useRuntimeConfig(event).public?.buildId;
  if (buildId) setResponseHeader(event, "x-app-build", String(buildId));
});
