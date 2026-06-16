/**
 * CC/BCC quick-add tokens for the email composer.
 *
 * The composer lets an admin drop the "Board" and "Property Manager" groups
 * into an email's CC/BCC fields without knowing their addresses. We persist
 * these as sentinel tokens (NOT resolved emails) so a later re-send always
 * re-resolves the current roster. The server expands them to live addresses at
 * send time — see server/utils/email-cc-contacts.ts.
 */

export const CC_TOKEN_BOARD = "@board";
export const CC_TOKEN_PROPERTY_MANAGER = "@property_manager";

export const CC_GROUP_TOKENS = [CC_TOKEN_BOARD, CC_TOKEN_PROPERTY_MANAGER] as const;
export type CcGroupToken = (typeof CC_GROUP_TOKENS)[number];

/** Default small/large cutoff when an org hasn't set its own. */
export const DEFAULT_CC_BCC_THRESHOLD = 5;

export function isCcGroupToken(value: string): value is CcGroupToken {
  return value === CC_TOKEN_BOARD || value === CC_TOKEN_PROPERTY_MANAGER;
}

/** Human label for a token, or the value itself (an email) when not a token. */
export function ccEntryLabel(value: string): string {
  if (value === CC_TOKEN_BOARD) return "Board";
  if (value === CC_TOKEN_PROPERTY_MANAGER) return "Property Manager";
  return value;
}

/** Loose email shape check for free-form entries. */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
