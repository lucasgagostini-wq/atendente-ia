"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_PROFILE_SLUG, getClientProfileSlug } from "@/lib/profile-utils";

const LOCATION_CHANGE_EVENT = "codex:profile-location-change";

function dispatchLocationChange() {
  window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT));
}

function ensureHistoryListeners() {
  if (typeof window === "undefined") return;

  const historyWithFlag = window.history as typeof window.history & {
    __profileLocationPatched?: boolean;
  };

  if (historyWithFlag.__profileLocationPatched) return;

  const originalPushState = window.history.pushState.bind(window.history);
  const originalReplaceState = window.history.replaceState.bind(window.history);

  window.history.pushState = function pushState(...args) {
    const result = originalPushState(...args);
    dispatchLocationChange();
    return result;
  };

  window.history.replaceState = function replaceState(...args) {
    const result = originalReplaceState(...args);
    dispatchLocationChange();
    return result;
  };

  historyWithFlag.__profileLocationPatched = true;
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  ensureHistoryListeners();
  window.addEventListener(LOCATION_CHANGE_EVENT, onStoreChange);
  window.addEventListener("popstate", onStoreChange);

  return () => {
    window.removeEventListener(LOCATION_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("popstate", onStoreChange);
  };
}

function getSnapshot() {
  return getClientProfileSlug() || DEFAULT_PROFILE_SLUG;
}

export function useActiveProfileSlug() {
  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_PROFILE_SLUG);
}
