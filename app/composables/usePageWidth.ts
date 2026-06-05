// Shares the active page's container width (standard vs wide) so the
// layout-level breadcrumb row can match it and stay left-aligned with content.
// PageContainer sets this on mount; pages without a PageContainer fall back to
// the standard width.
const pageWide = ref(false);

export function usePageWidth() {
  const setPageWide = (v: boolean) => {
    pageWide.value = v;
  };
  return { pageWide, setPageWide };
}
