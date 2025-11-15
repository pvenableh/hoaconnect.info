export default defineNuxtRouteMiddleware((to, from) => {
  const { loggedIn } = useUserSession()
  
  // If user is logged in, redirect to dashboard
  if (loggedIn.value) {
    return navigateTo('/dashboard')
  }
})
