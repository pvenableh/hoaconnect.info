import { pendingSetupStore, EXPIRY_MS } from "./pending-setup.post";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const token = query.token as string;

  if (!token) {
    throw createError({
      statusCode: 400,
      message: "Token is required",
    });
  }

  const entry = pendingSetupStore.get(token);

  if (!entry) {
    throw createError({
      statusCode: 404,
      message: "Pending setup data not found or expired",
    });
  }

  // Check if entry has expired
  const now = Date.now();
  if (now - entry.createdAt > EXPIRY_MS) {
    pendingSetupStore.delete(token);
    throw createError({
      statusCode: 404,
      message: "Pending setup data has expired",
    });
  }

  return entry.data;
});
