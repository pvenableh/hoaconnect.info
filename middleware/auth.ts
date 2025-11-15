// middleware/auth.ts
export default defineNuxtRouteMiddleware((to, from) => {
  const { user, loggedIn } = useDirectusAuth();

  // List of public routes that don't require authentication
  const publicRoutes = [
    "/",
    "/auth/login",
    "/auth/register",
    "/auth/forgot-password",
    "/auth/reset-password",
    "/auth/callback",
    "/terms",
    "/privacy",
  ];

  // Check if the route is public
  const isPublicRoute = publicRoutes.some((route) => to.path.startsWith(route));

  // If not logged in and trying to access protected route
  if (!loggedIn.value && !isPublicRoute) {
    return navigateTo("/auth/login");
  }

  // If logged in and trying to access auth pages, redirect to dashboard
  if (loggedIn.value && to.path.startsWith("/auth/")) {
    return navigateTo("/dashboard");
  }
});
