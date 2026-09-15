import type { LabelRenderProps } from './chart-types';
import { toPixels } from './chart-types';

type EndpointLabelProps = LabelRenderProps & {
  /** Number of points, so only the last one gets a label. */
  total: number;
  format: (value: number) => string;
};

/**
 * Labels only the final point of a series. Recharts hands a LabelList's content
 * renderer one call per point, so filtering by index is what makes the label
 * selective instead of a number on every point.
 */
export function EndpointLabel({ total, format, x, y, value, index }: EndpointLabelProps) {
  if (index !== total - 1 || typeof value !== 'number') {
    return null;
  }

  return (
    <text
      x={toPixels(x) - 6}
      y={toPixels(y) - 10}
      textAnchor="end"
      fontSize={12}
      fontWeight={500}
      fill="var(--ink-secondary)"
    >
      {format(value)}
    </text>
  );
}
