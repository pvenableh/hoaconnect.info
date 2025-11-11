import { ref, onMounted } from 'vue'
import type { Ref } from 'vue'
import gsap from 'gsap'

export const useFormAnimations = () => {
  const formRef: Ref<HTMLElement | null> = ref(null)
  const config = {
    duration: 0.6,
    ease: 'power3.out',
    stagger: 0.1
  }

  onMounted(() => {
    if (!formRef.value) return
    
    const formElements = formRef.value.querySelectorAll('.form-field')
    gsap.from(formElements, {
      y: 20,
      opacity: 0,
      duration: config.duration,
      stagger: config.stagger,
      ease: config.ease
    })
  })

  const animateError = (element: HTMLElement) => {
    gsap.to(element, {
      x: [-10, 10, -10, 10, 0],
      duration: 0.4,
      ease: 'power2.inOut'
    })
    
    gsap.fromTo(element,
      { backgroundColor: 'rgba(239, 68, 68, 0.1)' },
      {
        backgroundColor: 'rgba(239, 68, 68, 0)',
        duration: 0.6,
        ease: 'power2.out'
      }
    )
  }

  const animateValidationError = (fieldName: string) => {
    const field = document.querySelector(`[name="${fieldName}"]`)
    if (field) {
      const fieldWrapper = field.closest('.form-field')
      if (fieldWrapper) {
        gsap.to(fieldWrapper, {
          x: [-10, 10, -10, 10, 0],
          duration: 0.4,
          ease: 'power2.inOut'
        })
      }
    }
  }

  const animateSuccess = (element: HTMLElement) => {
    gsap.fromTo(element,
      { scale: 1 },
      {
        scale: 1.05,
        duration: 0.3,
        ease: 'back.out(3)',
        yoyo: true,
        repeat: 1
      }
    )
  }

  const animateButtonLoading = (button: HTMLElement) => {
    gsap.to(button, {
      scale: 0.98,
      duration: 0.1,
      ease: 'power2.out'
    })
  }

  const resetButtonLoading = (button: HTMLElement) => {
    gsap.to(button, {
      scale: 1,
      duration: 0.2,
      ease: 'back.out(2)'
    })
  }

  return {
    formRef,
    animateError,
    animateValidationError,
    animateSuccess,
    animateButtonLoading,
    resetButtonLoading
  }
}