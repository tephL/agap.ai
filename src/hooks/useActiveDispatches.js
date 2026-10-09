import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import { getRouteETA } from "../services/routeService";

const POLL_INTERVAL_MS = 3_000;

/**
 * Polls /api/my-assignments for active dispatches and computes ETAs
 * via OSRM. Returns a list of enriched dispatch objects.
 *
 * Dismissed assignment_ids are tracked in-memory and reset when
 * `resetDismissed()` is called (e.g. on map tab focus).
 */
export default function useActiveDispatches() {
  const [dispatches, setDispatches] = useState([]);
  const [cancelledDispatches, setCancelledDispatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const dismissedRef = useRef(new Set());
  const [dismissedVersion, setDismissedVersion] = useState(0);
  // Cancelled dispatches are surfaced to the citizen as a short-lived
  // "Dispatch cancelled" notice. Track which ones we've already shown so
  // the notice doesn't re-appear on every 15s poll.
  const seenCancelledRef = useRef(new Set());
  const cancelledRef = useRef(false);

  const fetchDispatches = useCallback(async () => {
    if (cancelledRef.current) return;
    try {
      const { data } = await api.get("/api/my-assignments");
      const active = (data.assignments ?? []).filter(
        (a) => a.status === "dispatched" || a.status === "pending"
      );
      const cancelled = (data.assignments ?? []).filter(
        (a) => a.status === "cancelled"
      );

      const enriched = await Promise.all(
        active.map(async (a) => {
          let etaSeconds = null;
          if (a.team?.lat != null && a.team?.lng != null && a.cluster?.lat != null && a.cluster?.lng != null) {
            etaSeconds = await getRouteETA(
              [a.team.lng, a.team.lat],
              [a.cluster.lng, a.cluster.lat]
            );
          }
          return { ...a, etaSeconds };
        })
      );

      if (!cancelledRef.current) {
        setDispatches(enriched);
        // Only surface cancellations we haven't shown before, and only
        // for clusters that don't already have a fresh dispatch on the
        // way — a new dispatch supersedes the earlier cancellation.
        const activeClusterIds = new Set(
          active.map((a) => a.cluster?.cluster_id).filter((id) => id != null)
        );
        const freshCancelled = cancelled.filter(
          (c) =>
            !seenCancelledRef.current.has(c.assignment_id) &&
            !activeClusterIds.has(c.cluster?.cluster_id)
        );
        if (freshCancelled.length > 0) {
          freshCancelled.forEach((c) => seenCancelledRef.current.add(c.assignment_id));
          setCancelledDispatches(freshCancelled);
        } else if (cancelled.length === 0) {
          setCancelledDispatches([]);
        }
        setLoading(false);
      }
    } catch (err) {
      console.log("useActiveDispatches fetch error:", err?.message);
      if (!cancelledRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    fetchDispatches();
    const interval = setInterval(fetchDispatches, POLL_INTERVAL_MS);
    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
    };
  }, [fetchDispatches]);

  const dismiss = useCallback((assignmentId) => {
    dismissedRef.current.add(assignmentId);
    setDismissedVersion((v) => v + 1);
  }, []);

  const resetDismissed = useCallback(() => {
    dismissedRef.current.clear();
    setDismissedVersion((v) => v + 1);
  }, []);

  const visible = dispatches.filter((d) => !dismissedRef.current.has(d.assignment_id));

  return {
    dispatches: visible,
    allDispatches: dispatches,
    cancelledDispatches,
    loading,
    dismiss,
    resetDismissed,
    // bump key forces re-render when dismissed set changes
    dismissedVersion,
  };
}
