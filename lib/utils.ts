import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPhone(phone: string) {
  const numbersOnly = phone.replace(/\D/g, "");
  if (numbersOnly.length === 13) {
    return `+${numbersOnly.slice(0, 2)} (${numbersOnly.slice(
      2,
      4,
    )}) ${numbersOnly.slice(4, 9)}-${numbersOnly.slice(9)}`;
  }
  return phone;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

