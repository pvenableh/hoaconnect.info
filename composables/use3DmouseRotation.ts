import { ref, onMounted, onUnmounted, computed } from "vue";
import { useMouseInElement, useMediaQuery } from "@vueuse/core";
import { gsap } from "gsap";

interface Use3DMouseRotationOptions {
  /**
   * Intensity multiplier for the rotation effect
   * @default 1
   * Range: 0.1 (subtle) to 2 (extreme)
   */
  intensity?: number;

  /**
   * Maximum rotation angle in degrees for X and Y axes
   * @default 15
   */
  maxRotation?: number;

  /**
   * Maximum rotation angle in degrees for Z axis
   * @default 5
   */
  maxRotationZ?: number;

  /**
   * Smoothness of the animation (lower = smoother but more lag)
   * @default 0.15
   */
  ease?: number;

  /**
   * Whether to invert the X axis rotation
   * @default false
   */
  invertX?: boolean;

  /**
   * Whether to invert the Y axis rotation
   * @default false
   */
  invertY?: boolean;

  /**
   * Perspective distance in pixels
   * @default 1000
   */
  perspective?: number;

  /**
   * Enable Z-axis rotation based on distance from center
   * @default true
   */
  enableZRotation?: boolean;

  /**
   * Scale factor on hover (1 = no scale)
   * @default 1.02
   */
  hoverScale?: number;

  /**
   * Enable smooth return to initial state when mouse leaves
   * @default true
   */
  resetOnLeave?: boolean;

  /**
   * Enable X/Y translation to create depth perspective
   * @default true
   */
  enableTranslation?: boolean;

  /**
   * Maximum translation in pixels for X and Y axes
   * @default 20
   */
  maxTranslation?: number;

  /**
   * Enable orbital mode - element rotates horizontally around a central point
   * Reduces vertical tilt and focuses on Y-axis rotation like a turntable
   * @default false
   */
  orbitalMode?: boolean;

  /**
   * Depth of the orbital rotation effect in pixels
   * Higher values = more pronounced curve/orbit
   * @default 100
   */
  orbitalDepth?: number;
}

export function use3DMouseRotation(
  target: Ref<HTMLElement | null>,
  options: Use3DMouseRotationOptions = {},
) {
  const isTouchDevice = useMediaQuery("(pointer: coarse)");

  // Early return if touch device
  if (isTouchDevice.value) {
    return {
      rotateX: computed(() => 0),
      rotateY: computed(() => 0),
      rotateZ: computed(() => 0),
      scale: computed(() => 1),
      translateX: computed(() => 0),
      translateY: computed(() => 0),
      translateZ: computed(() => 0),
      isHovered: computed(() => false),
      normalizedX: computed(() => 0),
      normalizedY: computed(() => 0),
      distanceFromCenter: computed(() => 0),
      reset: () => {},
    };
  }

  const {
    intensity = 1,
    maxRotation = 15,
    maxRotationZ = 5,
    ease = 0.15,
    invertX = false,
    invertY = false,
    perspective = 1000,
    enableZRotation = true,
    hoverScale = 1.02,
    resetOnLeave = true,
    enableTranslation = true,
    maxTranslation = 20,
    orbitalMode = false,
    orbitalDepth = 100,
  } = options;

  const { elementX, elementY, isOutside, elementWidth, elementHeight } =
    useMouseInElement(target);

  // Computed values for normalized mouse position (-1 to 1)
  const normalizedX = computed(() => {
    if (!elementWidth.value) return 0;
    return (elementX.value / elementWidth.value) * 2 - 1;
  });

  const normalizedY = computed(() => {
    if (!elementHeight.value) return 0;
    return (elementY.value / elementHeight.value) * 2 - 1;
  });

  // Calculate distance from center for Z rotation
  const distanceFromCenter = computed(() => {
    return Math.sqrt(
      Math.pow(normalizedX.value, 2) + Math.pow(normalizedY.value, 2),
    );
  });

  // Computed rotation values
  const rotateX = computed(() => {
    if (orbitalMode) {
      // In orbital mode, reduce X tilt significantly (just slight perspective)
      const rotation = -normalizedY.value * (maxRotation * 0.15) * intensity;
      return invertX ? -rotation : rotation;
    }
    const rotation = -normalizedY.value * maxRotation * intensity;
    return invertX ? -rotation : rotation;
  });

  const rotateY = computed(() => {
    if (orbitalMode) {
      // In orbital mode, emphasize Y rotation (horizontal spin around center)
      const rotation = normalizedX.value * (maxRotation * 1.5) * intensity;
      return invertY ? -rotation : rotation;
    }
    const rotation = normalizedX.value * maxRotation * intensity;
    return invertY ? -rotation : rotation;
  });

  const rotateZ = computed(() => {
    if (!enableZRotation || orbitalMode) return 0; // Disable Z in orbital mode
    // Subtle Z rotation based on quadrant and distance from center
    const angle = Math.atan2(normalizedY.value, normalizedX.value);
    return (
      Math.sin(angle * 2) * distanceFromCenter.value * maxRotationZ * intensity
    );
  });

  const scale = computed(() => {
    return isOutside.value ? 1 : hoverScale;
  });

  // Computed translation values - move in the direction of the tilt
  // This creates the illusion of the element moving away from the viewer
  const translateX = computed(() => {
    if (!enableTranslation) return 0;

    if (orbitalMode) {
      // In orbital mode, create curved path motion
      // Element moves along an arc, simulating rotation around a central point
      const angle = normalizedX.value * Math.PI * 0.5; // Max 90 degrees
      return Math.sin(angle) * orbitalDepth * intensity;
    }

    return normalizedX.value * maxTranslation * intensity;
  });

  const translateY = computed(() => {
    if (!enableTranslation) return 0;

    if (orbitalMode) {
      // In orbital mode, minimal vertical movement (just slight depth shift)
      return normalizedY.value * (maxTranslation * 0.3) * intensity;
    }

    return normalizedY.value * maxTranslation * intensity;
  });

  // Add translateZ for enhanced depth in orbital mode
  const translateZ = computed(() => {
    if (!orbitalMode || !enableTranslation) return 0;

    // Create depth illusion - element appears to move forward/back as it rotates
    const angle = normalizedX.value * Math.PI * 0.5;
    // Use cosine for depth - max forward at center, back at edges
    return (1 - Math.cos(angle)) * (orbitalDepth * 0.3) * intensity;
  });

  // GSAP animation object to track current values
  const currentTransform = ref({
    rotateX: 0,
    rotateY: 0,
    rotateZ: 0,
    scale: 1,
    translateX: 0,
    translateY: 0,
    translateZ: 0,
  });

  let animationFrame: number | null = null;

  // Smooth animation loop
  const animate = () => {
    if (!target.value) return;

    // Lerp (linear interpolation) for smooth transitions
    currentTransform.value.rotateX +=
      (rotateX.value - currentTransform.value.rotateX) * ease;
    currentTransform.value.rotateY +=
      (rotateY.value - currentTransform.value.rotateY) * ease;
    currentTransform.value.rotateZ +=
      (rotateZ.value - currentTransform.value.rotateZ) * ease;
    currentTransform.value.scale +=
      (scale.value - currentTransform.value.scale) * ease;
    currentTransform.value.translateX +=
      (translateX.value - currentTransform.value.translateX) * ease;
    currentTransform.value.translateY +=
      (translateY.value - currentTransform.value.translateY) * ease;
    currentTransform.value.translateZ +=
      (translateZ.value - currentTransform.value.translateZ) * ease;

    // Apply transform with translation
    gsap.set(target.value, {
      rotateX: currentTransform.value.rotateX,
      rotateY: currentTransform.value.rotateY,
      rotateZ: currentTransform.value.rotateZ,
      scale: currentTransform.value.scale,
      x: currentTransform.value.translateX,
      y: currentTransform.value.translateY,
      z: currentTransform.value.translateZ,
      transformPerspective: perspective,
      transformStyle: "preserve-3d",
      force3D: true,
    });

    animationFrame = requestAnimationFrame(animate);
  };

  // Reset animation
  const reset = () => {
    if (!target.value || !resetOnLeave) return;

    gsap.to(currentTransform.value, {
      rotateX: 0,
      rotateY: 0,
      rotateZ: 0,
      scale: 1,
      translateX: 0,
      translateY: 0,
      translateZ: 0,
      duration: 0.6,
      ease: "power2.out",
      onUpdate: () => {
        if (target.value) {
          gsap.set(target.value, {
            rotateX: currentTransform.value.rotateX,
            rotateY: currentTransform.value.rotateY,
            rotateZ: currentTransform.value.rotateZ,
            scale: currentTransform.value.scale,
            x: currentTransform.value.translateX,
            y: currentTransform.value.translateY,
            z: currentTransform.value.translateZ,
            transformPerspective: perspective,
            transformStyle: "preserve-3d",
            force3D: true,
          });
        }
      },
    });
  };

  // Watch for mouse leaving
  watch(isOutside, (outside) => {
    if (outside && resetOnLeave) {
      reset();
    }
  });

  onMounted(() => {
    if (target.value) {
      // Set initial transform origin to center
      gsap.set(target.value, {
        transformOrigin: "center center",
        transformStyle: "preserve-3d",
      });

      animationFrame = requestAnimationFrame(animate);
    }
  });

  onUnmounted(() => {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }
  });

  return {
    rotateX: computed(() => currentTransform.value.rotateX),
    rotateY: computed(() => currentTransform.value.rotateY),
    rotateZ: computed(() => currentTransform.value.rotateZ),
    scale: computed(() => currentTransform.value.scale),
    translateX: computed(() => currentTransform.value.translateX),
    translateY: computed(() => currentTransform.value.translateY),
    translateZ: computed(() => currentTransform.value.translateZ),
    isHovered: computed(() => !isOutside.value),
    normalizedX,
    normalizedY,
    distanceFromCenter,
    reset,
  };
}
