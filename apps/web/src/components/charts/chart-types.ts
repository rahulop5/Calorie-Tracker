/**
 * Recharts passes its own loosely-typed props to custom tooltip and label
 * renderers. These are the narrow shapes we actually read.
 */
export type TooltipPayloadItem<T = Record<string, unknown>> = {
  dataKey?: string | number;
  name?: string;
  value?: number;
  color?: string;
  payload?: T;
};

export type CustomTooltipProps<T = Record<string, unknown>> = {
  active?: boolean;
  label?: string | number;
  payload?: TooltipPayloadItem<T>[];
};

export type LabelRenderProps = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: number | string;
  index?: number;
};

export function toPixels(value: number | string | undefined): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}
