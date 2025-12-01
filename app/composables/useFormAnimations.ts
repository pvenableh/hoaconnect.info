import { onMounted } from "vue";
import gsap from "gsap";

/**
 * Form animations composable - TypeScript-safe
 * No refs needed - works with class selectors
 */
export const useFormAnimations = () => {
  const config = {
    duration: 0.6,
    ease: "power3.out",
    stagger: 0.1,
  };

  // Animate form fields on mount
  onMounted(() => {
    const formElements = document.querySelectorAll(".form-field");
    if (formElements.length > 0) {
      gsap.from(formElements, {
        y: 20,
        opacity: 0,
        duration: config.duration,
        stagger: config.stagger,
        ease: config.ease,
      });
    }
  });

  /**
   * Shake animation for errors
   * @param selector - CSS selector string or HTMLElement
   */
  const animateError = (selector: string | HTMLElement) => {
    const element =
      typeof selector === "string"
        ? document.querySelector(selector)
        : selector;
    if (!element) return;

    // Shake effect using timeline (TypeScript-safe)
    const tl = gsap.timeline();
    tl.to(element, { x: -10, duration: 0.1, ease: "power2.inOut" })
      .to(element, { x: 10, duration: 0.1, ease: "power2.inOut" })
      .to(element, { x: -10, duration: 0.1, ease: "power2.inOut" })
      .to(element, { x: 10, duration: 0.1, ease: "power2.inOut" })
      .to(element, { x: 0, duration: 0.1, ease: "power2.inOut" });

    // Flash red background
    gsap.fromTo(
      element,
      { backgroundColor: "rgba(239, 68, 68, 0.1)" },
      {
        backgroundColor: "rgba(239, 68, 68, 0)",
        duration: 0.6,
        ease: "power2.out",
      }
    );
  };

  /**
   * Shake animation for individual field validation errors
   * @param fieldName - The name attribute of the input field
   */
  const animateValidationError = (fieldName: string) => {
    const field = document.querySelector(`[name="${fieldName}"]`);
    if (!field) return;

    const fieldWrapper = field.closest(".form-field");
    if (!fieldWrapper) return;

    // Shake effect using timeline (TypeScript-safe)
    const tl = gsap.timeline();
    tl.to(fieldWrapper, { x: -10, duration: 0.1, ease: "power2.inOut" })
      .to(fieldWrapper, { x: 10, duration: 0.1, ease: "power2.inOut" })
      .to(fieldWrapper, { x: -10, duration: 0.1, ease: "power2.inOut" })
      .to(fieldWrapper, { x: 10, duration: 0.1, ease: "power2.inOut" })
      .to(fieldWrapper, { x: 0, duration: 0.1, ease: "power2.inOut" });
  };

  /**
   * Success pulse animation
   * @param selector - CSS selector string or HTMLElement
   */
  const animateSuccess = (selector: string | HTMLElement) => {
    const element =
      typeof selector === "string"
        ? document.querySelector(selector)
        : selector;
    if (!element) return;

    gsap.fromTo(
      element,
      { scale: 1 },
      {
        scale: 1.05,
        duration: 0.3,
        ease: "back.out(3)",
        yoyo: true,
        repeat: 1,
      }
    );
  };

  /**
   * Button loading state animation
   * @param selector - CSS selector string or HTMLElement
   */
  const animateButtonLoading = (selector: string | HTMLElement) => {
    const element =
      typeof selector === "string"
        ? document.querySelector(selector)
        : selector;
    if (!element) return;

    gsap.to(element, {
      scale: 0.98,
      duration: 0.1,
      ease: "power2.out",
    });
  };

  /**
   * Reset button from loading state
   * @param selector - CSS selector string or HTMLElement
   */
  const resetButtonLoading = (selector: string | HTMLElement) => {
    const element =
      typeof selector === "string"
        ? document.querySelector(selector)
        : selector;
    if (!element) return;

    gsap.to(element, {
      scale: 1,
      duration: 0.2,
      ease: "back.out(2)",
    });
  };

  return {
    animateError,
    animateValidationError,
    animateSuccess,
    animateButtonLoading,
    resetButtonLoading,
  };
};