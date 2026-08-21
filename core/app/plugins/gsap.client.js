// GSAP, registered once, client-only.
//
// Every plugin here is free as of GSAP 3.13 (the former Club plugins were
// released to the public package), so there is no licensing reason to hold back
// on Draggable or Inertia any more.
//
// WHAT GSAP IS FOR IN THIS APP — and what it is not for:
// Plain enters and leaves, drag payoff, sheets and panels are done with a
// reactive inline style plus a CSS transition on the compositor. They need no
// JS ticker, they survive a background tab, and they cannot get stranded
// half-played. GSAP is reserved for the things that genuinely need a ticker:
//   Flip     — layout/list transitions (reorder, filter, expand-into-detail)
//   Draggable + InertiaPlugin — 1:1 dragging with momentum and detent snapping
//   Observer — normalized wheel/touch/pointer gestures (edge-swipe back)
//   ScrollTrigger / ScrollToPlugin — scroll-driven work
// Reach for `useGsap()` rather than importing gsap directly; it scopes the
// animations to the component and reverts them on unmount.
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { Flip } from "gsap/Flip";
import { Draggable } from "gsap/Draggable";
import { InertiaPlugin } from "gsap/InertiaPlugin";
import { Observer } from "gsap/Observer";

export default defineNuxtPlugin(() => {
  gsap.registerPlugin(
    ScrollTrigger,
    ScrollToPlugin,
    Flip,
    Draggable,
    InertiaPlugin,
    Observer
  );

  return {
    provide: {
      gsap,
      ScrollTrigger,
      Flip,
      Draggable,
      Observer,
    },
  };
});
