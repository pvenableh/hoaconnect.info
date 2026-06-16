import { pendingSetupStore } from "./pending-setup.post";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const token = query.token as string;

  if (!token) {
    throw createError({
      statusCode: 400,
      message: "Token is required",
    });
  }

  const deleted = pendingSetupStore.delete(token);

  return {
    success: deleted,
    message: deleted
      ? "Pending setup data deleted"
      : "Token not found (may have already been deleted)",
  };
});
