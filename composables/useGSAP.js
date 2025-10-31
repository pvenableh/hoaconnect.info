export default () => {
  const { $gsap, $ScrollTrigger } = useNuxtApp();

  const createRevealAnimation = (selector, options = {}) => {
    if (import.meta.client && $gsap) {
      const elements = document.querySelectorAll(selector);

      elements.forEach((element, index) => {
        $gsap.fromTo(
          element,
          {
            opacity: 0,
            y: 60,
            scale: 0.95,
          },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 1.2,
            delay: index * 0.1,
            ease: "power3.out",
            scrollTrigger: {
              trigger: element,
              start: "top 85%",
              end: "bottom 15%",
              toggleActions: "play none none reverse",
              ...options,
            },
          }
        );
      });
    }
  };

  const createStaggerAnimation = (container, items, options = {}) => {
    if (import.meta.client && $gsap) {
      $gsap.fromTo(
        items,
        {
          opacity: 0,
          y: 40,
        },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          stagger: 0.15,
          ease: "power2.out",
          scrollTrigger: {
            trigger: container,
            start: "top 80%",
            ...options,
          },
        }
      );
    }
  };

  const createTrackingAnimation = (selector) => {
    if (import.meta.client && $gsap) {
      const elements = document.querySelectorAll(selector);

      elements.forEach((element) => {
        $gsap.fromTo(
          element,
          {
            letterSpacing: "0em",
          },
          {
            letterSpacing: "0.1em",
            duration: 2,
            ease: "power2.out",
            scrollTrigger: {
              trigger: element,
              start: "top 90%",
              end: "bottom 10%",
              scrub: 1,
            },
          }
        );
      });
    }
  };

  const createParallaxEffect = (selector, speed = 0.5) => {
    if (import.meta.client && $gsap) {
      const elements = document.querySelectorAll(selector);

      elements.forEach((element) => {
        $gsap.to(element, {
          yPercent: -50 * speed,
          ease: "none",
          scrollTrigger: {
            trigger: element,
            start: "top bottom",
            end: "bottom top",
            scrub: true,
          },
        });
      });
    }
  };

  const refreshScrollTrigger = () => {
    if (import.meta.client && $ScrollTrigger) {
      $ScrollTrigger.refresh();
    }
  };

  return {
    createRevealAnimation,
    createStaggerAnimation,
    createTrackingAnimation,
    createParallaxEffect,
    refreshScrollTrigger,
  };
};
