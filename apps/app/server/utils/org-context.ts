// server/utils/org-context.ts
/**
 * Server-side organization context utilities
 *
 * Extracts organization context from requests via:
 * 1. Session (selectedOrgId)
 * 2. Query parameter (?orgId=...)
 */

import type { H3Event } from 'h3'

interface OrgContext {
  orgId: string | null
  orgSlug: string | null
  source: 'session' | 'query' | 'none'
}

/**
 * Get organization context from request
 */
export async function getOrgContext(event: H3Event): Promise<OrgContext> {
  // 1. Try session first
  try {
    const session = await getUserSession(event)
    if (session?.selectedOrgId) {
      return {
        orgId: session.selectedOrgId,
        orgSlug: null,
        source: 'session'
      }
    }
  } catch {
    // Session not available, continue
  }

  // 2. Try query parameter
  const query = getQuery(event)
  if (query.orgId) {
    return {
      orgId: String(query.orgId),
      orgSlug: null,
      source: 'query'
    }
  }

  return {
    orgId: null,
    orgSlug: null,
    source: 'none'
  }
}

/**
 * Require organization context (throws if not found)
 */
export async function requireOrgContext(event: H3Event): Promise<OrgContext> {
  const context = await getOrgContext(event)

  if (!context.orgId) {
    throw createError({
      statusCode: 400,
      message: 'Organization context required'
    })
  }

  return context
}

/**
 * Get organization ID from request (shorthand)
 */
export async function getOrgId(event: H3Event): Promise<string | null> {
  const context = await getOrgContext(event)
  return context.orgId
}

/**
 * Require organization ID (throws if not found)
 */
export async function requireOrgId(event: H3Event): Promise<string> {
  const context = await requireOrgContext(event)
  return context.orgId!
}

/**
 * Add organization filter to Directus query
 */
export function withOrgFilter(
  orgId: string,
  filter?: Record<string, any>,
  orgField: string = 'organization'
): Record<string, any> {
  return {
    ...filter,
    [orgField]: { _eq: orgId }
  }
}

/**
 * Create organization-scoped Directus query
 */
export async function createOrgQuery(
  event: H3Event,
  baseQuery: Record<string, any> = {},
  orgField: string = 'organization'
): Promise<Record<string, any>> {
  const orgId = await getOrgId(event)

  if (!orgId) {
    return baseQuery
  }

  return {
    ...baseQuery,
    filter: withOrgFilter(orgId, baseQuery.filter, orgField)
  }
}
