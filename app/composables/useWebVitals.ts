/**
 * useWebVitals - Web Vitals monitoring composable
 *
 * Tracks Core Web Vitals (LCP, FID, CLS) and other performance metrics
 * for monitoring SaaS application performance.
 *
 * Usage:
 * const { metrics, trackCustomMetric, getPerformanceScore } = useWebVitals()
 */

interface WebVitalMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  timestamp: number;
}

interface PerformanceMetrics {
  lcp: WebVitalMetric | null; // Largest Contentful Paint
  fid: WebVitalMetric | null; // First Input Delay
  cls: WebVitalMetric | null; // Cumulative Layout Shift
  fcp: WebVitalMetric | null; // First Contentful Paint
  ttfb: WebVitalMetric | null; // Time to First Byte
  inp: WebVitalMetric | null; // Interaction to Next Paint
}

// Thresholds based on Google's Core Web Vitals guidelines
const THRESHOLDS = {
  lcp: { good: 2500, poor: 4000 },
  fid: { good: 100, poor: 300 },
  cls: { good: 0.1, poor: 0.25 },
  fcp: { good: 1800, poor: 3000 },
  ttfb: { good: 800, poor: 1800 },
  inp: { good: 200, poor: 500 },
};

function getRating(
  name: keyof typeof THRESHOLDS,
  value: number
): 'good' | 'needs-improvement' | 'poor' {
  const threshold = THRESHOLDS[name];
  if (value <= threshold.good) return 'good';
  if (value <= threshold.poor) return 'needs-improvement';
  return 'poor';
}

export function useWebVitals() {
  const metrics = useState<PerformanceMetrics>('webVitals', () => ({
    lcp: null,
    fid: null,
    cls: null,
    fcp: null,
    ttfb: null,
    inp: null,
  }));

  const customMetrics = useState<Map<string, number>>('customMetrics', () => new Map());

  /**
   * Initialize Web Vitals monitoring
   * Should be called once in the app, typically in a plugin or layout
   */
  const initMonitoring = () => {
    if (!import.meta.client) return;

    // Use PerformanceObserver for Core Web Vitals
    try {
      // Largest Contentful Paint
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1] as PerformanceEntry & { startTime: number };
        if (lastEntry) {
          metrics.value.lcp = {
            name: 'LCP',
            value: lastEntry.startTime,
            rating: getRating('lcp', lastEntry.startTime),
            timestamp: Date.now(),
          };
        }
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

      // First Input Delay
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const firstEntry = entries[0] as PerformanceEventTiming;
        if (firstEntry) {
          const value = firstEntry.processingStart - firstEntry.startTime;
          metrics.value.fid = {
            name: 'FID',
            value,
            rating: getRating('fid', value),
            timestamp: Date.now(),
          };
        }
      });
      fidObserver.observe({ type: 'first-input', buffered: true });

      // Cumulative Layout Shift
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { hadRecentInput: boolean; value: number })[]) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
            metrics.value.cls = {
              name: 'CLS',
              value: clsValue,
              rating: getRating('cls', clsValue),
              timestamp: Date.now(),
            };
          }
        }
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });

      // First Contentful Paint
      const fcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntriesByName('first-contentful-paint');
        if (entries.length > 0) {
          const fcp = entries[0];
          metrics.value.fcp = {
            name: 'FCP',
            value: fcp.startTime,
            rating: getRating('fcp', fcp.startTime),
            timestamp: Date.now(),
          };
        }
      });
      fcpObserver.observe({ type: 'paint', buffered: true });

      // Time to First Byte
      const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      if (navEntries.length > 0) {
        const ttfb = navEntries[0].responseStart;
        metrics.value.ttfb = {
          name: 'TTFB',
          value: ttfb,
          rating: getRating('ttfb', ttfb),
          timestamp: Date.now(),
        };
      }
    } catch {
      // PerformanceObserver not supported or entry type not available
    }
  };

  /**
   * Track a custom performance metric
   */
  const trackCustomMetric = (name: string, value: number) => {
    customMetrics.value.set(name, value);
  };

  /**
   * Get overall performance score (0-100)
   * Based on Core Web Vitals ratings
   */
  const getPerformanceScore = computed(() => {
    const scores: number[] = [];
    const m = metrics.value;

    if (m.lcp) scores.push(m.lcp.rating === 'good' ? 100 : m.lcp.rating === 'needs-improvement' ? 50 : 0);
    if (m.fid) scores.push(m.fid.rating === 'good' ? 100 : m.fid.rating === 'needs-improvement' ? 50 : 0);
    if (m.cls) scores.push(m.cls.rating === 'good' ? 100 : m.cls.rating === 'needs-improvement' ? 50 : 0);

    if (scores.length === 0) return null;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  });

  /**
   * Format metric value for display
   */
  const formatMetric = (metric: WebVitalMetric | null): string => {
    if (!metric) return 'N/A';
    if (metric.name === 'CLS') return metric.value.toFixed(3);
    return `${Math.round(metric.value)}ms`;
  };

  /**
   * Send metrics to analytics endpoint (if configured)
   */
  const reportMetrics = async (endpoint?: string) => {
    if (!endpoint) return;

    try {
      await $fetch(endpoint, {
        method: 'POST',
        body: {
          metrics: metrics.value,
          customMetrics: Object.fromEntries(customMetrics.value),
          url: window.location.href,
          timestamp: Date.now(),
        },
      });
    } catch {
      // Silently fail - don't interrupt user experience for analytics
    }
  };

  return {
    metrics,
    customMetrics,
    initMonitoring,
    trackCustomMetric,
    getPerformanceScore,
    formatMetric,
    reportMetrics,
  };
}
