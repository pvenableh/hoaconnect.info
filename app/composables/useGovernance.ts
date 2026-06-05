/**
 * useGovernance — by-laws, CC&Rs, rules & policies, entered per org and
 * searchable (Phase 6, Track 2). Backed by hoa_governance
 * (scripts/create-governance-collection.ts).
 *
 * Members read PUBLISHED rows in their org (enforced by Directus policy); admins
 * manage all and may pass includeAllStatuses to see drafts/archived.
 */

export const GOVERNANCE_CATEGORIES = [
  { value: "bylaw", label: "By-laws" },
  { value: "ccr", label: "CC&Rs" },
  { value: "rule", label: "Rules" },
  { value: "policy", label: "Policies" },
  { value: "guideline", label: "Guidelines" },
] as const;

export interface GovernanceItem {
  id: string;
  status: "published" | "draft" | "archived";
  category: string;
  title: string;
  section_number?: string | null;
  summary?: string | null;
  content?: string | null;
  effective_date?: string | null;
  parent?: string | { id: string } | null;
  tags?: string[] | null;
  sort?: number | null;
  date_updated?: string | null;
}

const LIST_FIELDS = [
  "id", "status", "category", "title", "section_number", "summary",
  "effective_date", "tags", "sort", "parent", "date_updated",
];
const DETAIL_FIELDS = [...LIST_FIELDS, "content"];

export const useGovernance = () => {
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
  const { list, get, create, update, remove } = useDirectusItems<GovernanceItem>("hoa_governance");

  const orgFilter = () => ({ organization: { _eq: selectedOrgId.value } });

  // List published (or, for admins, all) rows — optionally filtered by category.
  const listRules = (opts: { category?: string | null; includeAllStatuses?: boolean } = {}) => {
    const filter: Record<string, any> = { _and: [orgFilter()] };
    if (!opts.includeAllStatuses) filter._and.push({ status: { _eq: "published" } });
    if (opts.category) filter._and.push({ category: { _eq: opts.category } });
    return list({ fields: LIST_FIELDS, filter, sort: ["section_number", "sort", "title"], limit: -1 });
  };

  // Search title/summary/content (case-insensitive), scoped to org + published
  // unless includeAllStatuses. Combine with an optional category.
  const search = (q: string, opts: { category?: string | null; includeAllStatuses?: boolean } = {}) => {
    const term = q.trim();
    const and: any[] = [orgFilter()];
    if (!opts.includeAllStatuses) and.push({ status: { _eq: "published" } });
    if (opts.category) and.push({ category: { _eq: opts.category } });
    if (term) {
      and.push({
        _or: [
          { title: { _icontains: term } },
          { summary: { _icontains: term } },
          { content: { _icontains: term } },
          { section_number: { _icontains: term } },
        ],
      });
    }
    return list({ fields: LIST_FIELDS, filter: { _and: and }, sort: ["section_number", "sort", "title"], limit: -1 });
  };

  const getRule = (id: string) => get(id, { fields: DETAIL_FIELDS });

  const createRule = (input: Partial<GovernanceItem>) => {
    if (!selectedOrgId.value) throw new Error("No organization selected");
    return create({ ...input, organization: selectedOrgId.value } as any);
  };

  const updateRule = (id: string, patch: Partial<GovernanceItem>) => update(id, patch);
  const removeRule = (id: string) => remove(id);

  return { listRules, search, getRule, createRule, updateRule, removeRule, GOVERNANCE_CATEGORIES };
};
