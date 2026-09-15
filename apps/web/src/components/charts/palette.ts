/**
 * Chart colours, as CSS variables so a theme change repaints without a re-render.
 *
 * Slots are assigned in fixed order and never cycled: protein is always slot 1,
 * carbs slot 2, fat slot 3. Colour follows the nutrient, so hiding a series
 * never repaints the others.
 */
export const SERIES = {
  one: 'var(--series-1)',
  two: 'var(--series-2)',
  three: 'var(--series-3)',
} as const;

export const CHART = {
  grid: 'var(--grid)',
  axis: 'var(--line-strong)',
  tick: 'var(--ink-muted)',
  surface: 'var(--surface)',
  /** Goal and target lines are reference marks, so they wear muted ink. */
  reference: 'var(--ink-muted)',
} as const;

export type MacroSeries = {
  /** Grams, as the API returns them. */
  key: 'proteinG' | 'carbsG' | 'fatG';
  /** Calories contributed, computed for the stacked chart. */
  kcalKey: 'proteinKcal' | 'carbsKcal' | 'fatKcal';
  percentKey: 'proteinPercent' | 'carbsPercent' | 'fatPercent';
  label: string;
  color: string;
  /** kcal per gram, for converting grams into the calories they contribute. */
  kcalPerGram: number;
};

export const MACRO_SERIES: readonly MacroSeries[] = [
  {
    key: 'proteinG',
    kcalKey: 'proteinKcal',
    percentKey: 'proteinPercent',
    label: 'Protein',
    color: SERIES.one,
    kcalPerGram: 4,
  },
  {
    key: 'carbsG',
    kcalKey: 'carbsKcal',
    percentKey: 'carbsPercent',
    label: 'Carbs',
    color: SERIES.two,
    kcalPerGram: 4,
  },
  {
    key: 'fatG',
    kcalKey: 'fatKcal',
    percentKey: 'fatPercent',
    label: 'Fat',
    color: SERIES.three,
    kcalPerGram: 9,
  },
];

/** Shared mark specs, so every chart uses the same geometry. */
export const MARK = {
  barSize: 22,
  lineWidth: 2,
  dotRadius: 4,
  /** Surface-coloured, so touching marks are separated by air rather than ink. */
  gapWidth: 2,
  areaOpacity: 0.1,
} as const;

export const AXIS_PROPS = {
  stroke: CHART.axis,
  tickLine: false,
  tick: { fill: CHART.tick, fontSize: 12 },
} as const;
