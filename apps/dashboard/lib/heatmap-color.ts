// Shared color scale for all heatmap components.
// Returns a CSS color string — dark burgundy red at full intensity,
// very faint at low intensity, transparent for zero.
export function heatmapColor(count: number, max: number): string {
  if (count === 0 || max === 0) return "transparent"
  const ratio = Math.min(count / max, 1)
  // Clamp to 4 buckets so adjacent cells look distinct
  const alpha =
    ratio > 0.66 ? 1 :
    ratio > 0.33 ? 0.65 :
    ratio > 0.10 ? 0.38 :
                   0.18
  // Burgundy red: rgb(127, 29, 29) = Tailwind rose-900
  return `rgba(127,29,29,${alpha})`
}

// CSS background for legend swatches (fixed steps, low → high)
export const HEATMAP_LEGEND_STEPS = [0.18, 0.38, 0.65, 1].map(
  (a) => `rgba(127,29,29,${a})`
)
