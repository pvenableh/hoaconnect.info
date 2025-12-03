import { randomUUID } from "crypto";

interface PendingSetupData {
  // Organization
  organizationName: string;
  street_address?: string;
  city?: string;
  state?: string;
  zip?: string;
  org_phone?: string;
  org_email?: string;
  slug: string;
  subscriptionPlanId?: string;

  // Admin
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  password: string;

  // Redirect
  redirectTo?: string;
}

// In-memory store for pending setup data
// In production, you might want to use Redis or a database table
const pendingSetupStore = new Map<
  string,
  { data: PendingSetupData; createdAt: number }
>();

// Clean up old entries (older than 1 hour)
const EXPIRY_MS = 60 * 60 * 1000; // 1 hour

function cleanupOldEntries() {
  const now = Date.now();
  for (const [token, entry] of pendingSetupStore.entries()) {
    if (now - entry.createdAt > EXPIRY_MS) {
      pendingSetupStore.delete(token);
    }
  }
}

// Export the store so it can be accessed by the GET endpoint
export { pendingSetupStore, EXPIRY_MS };

export default defineEventHandler(async (event) => {
  const body = await readBody<PendingSetupData>(event);

  // Validate required fields
  if (
    !body.organizationName ||
    !body.slug ||
    !body.firstName ||
    !body.lastName ||
    !body.email ||
    !body.password
  ) {
    throw createError({
      statusCode: 400,
      message: "Missing required fields",
    });
  }

  // Clean up old entries periodically
  cleanupOldEntries();

  // Generate a unique token
  const token = randomUUID();

  // Store the data
  pendingSetupStore.set(token, {
    data: body,
    createdAt: Date.now(),
  });

  return {
    token,
    expiresIn: EXPIRY_MS,
  };
});
