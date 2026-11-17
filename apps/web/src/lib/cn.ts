import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Joins class names and lets later Tailwind classes win over earlier ones.
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
