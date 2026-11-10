// POST /api/support/attachments — upload one file for a support message
// (multipart, field `file`). Returns { id, name, type, size }; the message then
// names the id. Anyone signed in may upload; only their own message can use it
// (core/server/utils/support-attachments.ts). One file per request because a
// Vercel function body tops out at 4.5 MB; the cap is 4 MB.
import { rateLimit } from "#core/server/utils/rate-limit";
import { storeSupportAttachment } from "#core/server/utils/support-attachments";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = session?.user?.id;
  if (!userId) throw createError({ statusCode: 401, message: "Authentication required" });
  if (!rateLimit(`support-upload:${userId}`, 30, 60 * 60_000)) {
    throw createError({ statusCode: 429, message: "That's a lot of uploads in an hour. Try again shortly." });
  }
  const form = await readMultipartFormData(event).catch(() => null);
  const part = form?.find((p) => p.name === "file" && p.filename);
  if (!part) throw createError({ statusCode: 400, message: "Choose a file to attach." });
  return storeSupportAttachment({ userId, name: part.filename!, data: new Uint8Array(part.data) });
});
