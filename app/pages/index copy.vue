<template>
  <div
    class="min-h-screen bg-white bg-cover bg-center bg-no-repeat flex items-center justify-center flex-col relative"
    style="
      background-image: url(https://admin.605lincolnroad.com/assets/cd403a2c-f326-461d-9f8a-5adf7560bfb4);
    "
  >
    <div
      ref="heroTitle"
      class="uppercase flex items-center justify-center flex-col px-4 sm:px-12 max-w-4xl w-full"
    >
      <img
        src="https://admin.605lincolnroad.com/assets/e0b855bc-01ad-4773-b91b-5ec9d7090ae7?key=large-contain"
        alt="605 Lincoln Road"
        class="w-full h-auto drop-shadow-2xl"
      />
      <p
        class="text-center tracking-[0.75em] text-white uppercase text-[4.75vw] sm:text-[4vw] md:text-[28px] mt-20 hue-text-gradient font-bold text-shadow-2xl"
      >
        Coming soon
      </p>
      <!-- <h1>605</h1>
      <h2>Lincoln Road</h2> -->
    </div>

    <div
      class="flex w-full flex-col items-center justify-center absolute bottom-5 gap-1"
    >
      <h5 class="web-designer">
        <a
          href="mailto:contact@huestudios.com"
          target="_blank"
          rel="noopener"
          class="flex flex-row text-white body-font shrink"
        >
          designed by
          <svg
            id="hue-logo"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 98.44 48.62"
          >
            <title>hue Creative Marketing - Maimi Beach | New York</title>
            <path
              class="h"
              d="M347.41,282.12h6.28v19.35c2-3.5,6.14-5.48,10.77-5.48,3.5,0,8.52,1.25,10.44,5.28.66,1.32,1.12,2.91,1.12,7.73v20.74h-3.56c-5.61,0-2.78-19.62-2.78-19.62,0-3,0-9.38-7.13-9.38a8.57,8.57,0,0,0-7.79,4.43c-1.06,1.85-1.06,5-1.06,7v17.57h-6.28Z"
              transform="translate(-347.41 -282.12)"
            />
            <path
              class="h"
              d="M388.17,296.59v21.34c0,3.24.73,7.33,7.07,7.33,3.1,0,6-1.06,7.79-3.7,1.39-2,1.39-4.56,1.39-6.21,0,0-1.87-18.76,2.07-18.76h4.33v27c0,.66.13,4.36.2,6.21h-6.47l-.13-5.68c-1.19,2.31-3.44,6-10.57,6-8.19,0-12-4.69-12-11.23V296.59Z"
              transform="translate(-347.41 -282.12)"
            />
            <path
              class="h"
              d="M422,314.29c-.13,6.87,2.71,12,9.51,12,5.93,0,6.3-6.87,9.67-6.87h4.33a11.26,11.26,0,0,1-2.84,6.94c-1.45,1.65-4.76,4.43-11.43,4.43-10.44,0-15.39-6.47-15.39-17,0-6.54,1.32-12,6.54-15.59,3.17-2.25,7.13-2.44,9.05-2.44,14.86,0,14.53,13.15,14.4,18.56Zm17.51-4.36c.07-3.17-.53-9.78-8.19-9.78-4,0-8.92,2.44-9,9.78Z"
              transform="translate(-347.41 -282.12)"
            />
          </svg>
        </a>
      </h5>
      <h5
        class="body-font copyright tracking-widest uppercase mb-safe-offset-12 text-white"
      >
        &#169; {{ new Date().getFullYear() }} 605 Lincoln Road, INC
      </h5>
    </div>
  </div>
</template>

<script setup>
const heroTitle = ref(null);
use3DMouseRotation(heroTitle, {
  orbitalMode: true,
  intensity: 0.2,
  maxRotation: 6,
  ease: 0.12,
  perspective: 300,
  enableTranslation: true,
  orbitalDepth: 60,
  hoverScale: 1.05,
  resetOnLeave: true,
});
</script>

<style scoped>
@reference 'tailwindcss';
h5.web-designer {
  margin-top: 0px;
  margin-bottom: 0px;
  letter-spacing: 0.15em;

  a,
  a:link,
  a:visited {
    font-size: 10px;
    color: var(--white);
    svg {
      width: 35px;
      height: auto;
      display: inline;
      stroke: none;
      margin-top: -11px;
      margin-left: 1px;
      @apply fill-white;
      path {
        transition: all 0.3s linear;
      }

      path:nth-of-type(1) {
        transition-delay: 0.1s;
      }

      path:nth-of-type(2) {
        transition-delay: 0.2s;
      }

      path:nth-of-type(3) {
        transition-delay: 0.3s;
      }
    }
  }

  a:hover {
    svg path {
      fill: rgb(255, 0, 92);
    }
  }
}

h5.copyright {
  font-size: 7px;
  margin-top: 0px;

  letter-spacing: 0.25em;
}
.hue-text-gradient {
  color: #ee0979;
  background: linear-gradient(
    135deg,
    #ee0979 0%,
    #ff6a00 25%,
    #ee0979 50%,
    #ff6a00 75%,
    #ee0979 100%
  );
  background-size: 200% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: hue-gradient-flow 5s ease-in-out 0.1s infinite;
  display: inline-block;
  padding-inline: 0.15em 0.25em;
  /* Negative margin to maintain visual alignment */
  margin-inline: -0.15em -0.25em;
}

@keyframes hue-gradient-flow {
  0% {
    background-position: 0% center;
  }
  50% {
    background-position: 100% center;
  }
  100% {
    background-position: 0% center;
  }
}

/* For multiple elements with staggered timing */
.hue-text-gradient:nth-child(2) {
  animation-delay: 0.5s;
}

.hue-text-gradient:nth-child(3) {
  animation-delay: 1s;
}

.hue-text-gradient:hover {
  animation-play-state: paused;
}
</style>
