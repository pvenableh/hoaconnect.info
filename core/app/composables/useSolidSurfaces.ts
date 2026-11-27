// useSolidSurfaces — the Appearance switch behind core/shared/a11y/solid-surfaces.ts.
//
// Per device (localStorage), like the system settings it stands in for: someone's
// phone and their desktop can differ. The head script stamps the attribute from
// the same key before first paint; this keeps it and the switch in step.

import { SOLID_SURFACES_ATTR, SOLID_SURFACES_KEY } from "#core/shared/a11y/solid-surfaces";

function readStored(): boolean {
  try {
    return window.localStorage.getItem(SOLID_SURFACES_KEY) === "on";
  } catch {
    return false;
  }
}

export function useSolidSurfaces() {
  const solid = useState<boolean | null>("solid-surfaces", () => null);
  if (import.meta.client && solid.value === null) solid.value = readStored();

  function setSolidSurfaces(next: boolean): void {
    solid.value = next;
    if (!import.meta.client) return;
    document.documentElement.toggleAttribute(SOLID_SURFACES_ATTR, next);
    try {
      if (next) window.localStorage.setItem(SOLID_SURFACES_KEY, "on");
      else window.localStorage.removeItem(SOLID_SURFACES_KEY);
    } catch {
      // Private mode or storage full: the attribute still holds for this visit.
    }
  }

  return { solidSurfaces: computed(() => solid.value ?? false), setSolidSurfaces };
}
