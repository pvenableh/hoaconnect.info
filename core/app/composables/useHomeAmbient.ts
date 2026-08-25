// The admin home's ambient backdrop: which look, or none.
//
// localStorage on purpose, and this is the kill switch the plan's Risk 7 asks
// for. It is a per-DEVICE visual preference — the phone that finds the field
// distracting is not the same device as the desktop that likes it — so a
// `directus_users` field would be the wrong shape, and it would also need a
// Client-policy permission row, which is the trap that has cost this codebase
// two sessions already (see the notes on `permissions` being ignored on create).
//
// Reading storage is deferred to `onNuxtReady`: reading it during the hydration
// render would make the client's first paint diverge from SSR for anybody whose
// stored value is not the default, which is a hydration mismatch by
// construction.

export type AmbientStyle = "waves" | "orbs" | "off";

const AMBIENT_KEY = "hoa.home.ambient";

/** Cycle order for the single control. Waves first — it is the default. */
const CYCLE: AmbientStyle[] = ["waves", "orbs", "off"];

const LABELS: Record<AmbientStyle, string> = {
  waves: "Waves",
  orbs: "Orbs",
  off: "Off",
};

const ICONS: Record<AmbientStyle, string> = {
  waves: "i-lucide-waves",
  orbs: "i-lucide-circle",
  off: "i-lucide-circle-slash",
};

export function normalizeAmbient(raw: string | null | undefined): AmbientStyle {
  if (raw === "orbs" || raw === "off" || raw === "waves") return raw;
  return "waves";
}

/**
 * The stored preference, or the default. Exported so the read is testable
 * without a client runtime — the composable itself only performs it inside
 * `onNuxtReady`, which never runs under plain vitest.
 */
export function readStoredAmbient(): AmbientStyle {
  try {
    return normalizeAmbient(localStorage.getItem(AMBIENT_KEY));
  } catch {
    // Private mode — stay on the default rather than throwing on a page load.
    return "waves";
  }
}

export function nextAmbient(style: AmbientStyle): AmbientStyle {
  const i = CYCLE.indexOf(style);
  return CYCLE[(i + 1) % CYCLE.length]!;
}

export function useHomeAmbient() {
  const style = useState<AmbientStyle>("home-ambient", () => "waves");
  const hydrated = useState<boolean>("home-ambient-hydrated", () => false);

  if (import.meta.client && !hydrated.value) {
    hydrated.value = true;
    onNuxtReady(() => {
      style.value = readStoredAmbient();
    });
  }

  function set(next: AmbientStyle) {
    style.value = next;
    try {
      localStorage.setItem(AMBIENT_KEY, next);
    } catch {
      /* fine */
    }
  }

  /** Advance the single control: Waves → Orbs → Off → Waves. */
  function cycle() {
    set(nextAmbient(style.value));
  }

  const on = computed(() => style.value !== "off");
  const label = computed(() => LABELS[style.value]);
  const icon = computed(() => ICONS[style.value]);
  const nextLabel = computed(() => LABELS[nextAmbient(style.value)]);

  return { style, on, label, icon, nextLabel, set, cycle };
}
