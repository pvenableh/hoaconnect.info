export default defineNuxtRouteMiddleware((to, from) => {
  const { loggedIn } = useUserSession()

  // Pages that don't require authentication
  const publicPages = [
    '/',
    '/auth/login',
    '/auth/register',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/auth/accept-invitation',
    '/setup',
    '/setup/complete'
  ]

  // Check if the current route requires authentication
  const isPublicPage = publicPages.includes(to.path) || to.path.startsWith('/auth/') || to.path.startsWith('/setup/')
  const requiresAuth = !isPublicPage
  
  if (requiresAuth && !loggedIn.value) {
    // Store the intended destination
    const redirectPath = to.fullPath !== '/dashboard' ? `?redirect=${encodeURIComponent(to.fullPath)}` : ''
    
    // Redirect to login if trying to access protected route
    return navigateTo(`/auth/login${redirectPath}`)
  }
  
  // Redirect to dashboard if logged in and trying to access auth pages
  if (loggedIn.value && to.path.startsWith('/auth/')) {
    return navigateTo('/dashboard')
  }
})
