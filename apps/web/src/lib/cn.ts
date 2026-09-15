import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names and lets a later Tailwind class win over an earlier one. */
export function cn(...classes: ClassValue[]): string {
  return twMerge(clsx(classes));
}
