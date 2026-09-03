/**
 * Coordinates the two independent location sources in the delivery app so
 * they never run at the same time:
 *  - DeliveryLayout runs a whole-shift, order-agnostic tracker while the
 *    rider is online (used for seller service-radius matching on new orders).
 *  - DeliveryTrackingMap runs a more frequent, order-scoped tracker while an
 *    active delivery's live map is on screen.
 *
 * Previously both ran unconditionally at once during an active delivery —
 * two GPS listeners plus two location POSTs every 5-10s. DeliveryTrackingMap
 * registers itself as the "primary" tracker while mounted; DeliveryLayout's
 * background tracker checks this and skips its own GPS/network work for as
 * long as the primary tracker is active, resuming automatically once it isn't.
 *
 * A count (not a boolean) so overlapping mounts (route transitions, React
 * StrictMode double-invoke in dev) can never leave the flag stuck on.
 */
let activeCount = 0;

export function registerPrimaryLocationTracker() {
  activeCount += 1;
  return () => {
    activeCount = Math.max(0, activeCount - 1);
  };
}

export function isPrimaryLocationTrackerActive() {
  return activeCount > 0;
}
