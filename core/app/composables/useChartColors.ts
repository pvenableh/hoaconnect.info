// Chart colour, in one place.
//
// The five --chart-* custom properties are declared light AND dark in
// core/app/assets/css/tailwind.css, so a chart that reads them follows the
// theme for free. A chart that hard-codes a hex does not — which is how the
// first three charts in this app ended up looking correct in light mode and
// muddy in dark.
//
// Five is the whole ramp. A sixth series wraps to --chart-1, which is a
// deliberate collision: past five categories a reader can't hold the legend in
// their head anyway, and the honest fix is to group the tail into "Other"
// before it reaches a chart, not to invent a sixth hue.

export const CHART_SERIES_VARS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export function chartColor(index: number): string {
  return CHART_SERIES_VARS[index % CHART_SERIES_VARS.length]!;
}

/** Status colours that mean something specific, so they don't come off the ramp. */
export const CHART_STATUS_VARS = {
  good: "var(--success)",
  warn: "var(--warning, var(--chart-5))",
  bad: "var(--destructive)",
  muted: "var(--theme-text-muted)",
} as const;

export interface ChartSeries {
  /** Key on each datum. */
  key: string;
  label: string;
  /** Overrides the ramp — pass a CHART_STATUS_VARS value when the colour means something. */
  color?: string;
}

/** Series with their resolved colours, in legend order. */
export function resolveSeries(series: ChartSeries[]): Required<ChartSeries>[] {
  return series.map((s, i) => ({ ...s, color: s.color ?? chartColor(i) }));
}
