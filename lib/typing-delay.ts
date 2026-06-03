import { clamp, randomBetween, sleep } from "@/lib/utils";

export const MIN_TYPING_DELAY_MS = Number(process.env.MIN_TYPING_DELAY_MS || 1500);
export const SHORT_TYPING_DELAY_MS = Number(process.env.SHORT_TYPING_DELAY_MS || 3000);
export const MEDIUM_TYPING_DELAY_MS = Number(process.env.MEDIUM_TYPING_DELAY_MS || 5000);
export const LONG_TYPING_DELAY_MS = Number(process.env.LONG_TYPING_DELAY_MS || 7000);
export const TYPING_BUFFER_MS = Number(process.env.TYPING_BUFFER_MS || 1000);
export const MAX_TYPING_DELAY_MS = Number(process.env.MAX_TYPING_DELAY_MS || 8500);
export const AI_RESPONSE_TIMEOUT_MS = Number(process.env.AI_RESPONSE_TIMEOUT_MS || 12000);
export const AI_FAST_RESPONSE_MIN_DELAY_MS = Number(
  process.env.AI_FAST_RESPONSE_MIN_DELAY_MS || MIN_TYPING_DELAY_MS,
);
export const INCOMING_MESSAGE_DEBOUNCE_MS = Number(
  process.env.INCOMING_MESSAGE_DEBOUNCE_MS || 2500,
);

export { randomBetween, sleep };

export function getRandomDelay(min: number, max: number) {
  return randomBetween(min, max);
}

export function calculateTypingDelay(message: string) {
  const length = message.trim().length;

  if (length <= 80) {
    return clamp(getRandomDelay(2800, 3600), MIN_TYPING_DELAY_MS, MAX_TYPING_DELAY_MS);
  }

  if (length <= 220) {
    return clamp(getRandomDelay(4700, 5600), MIN_TYPING_DELAY_MS, MAX_TYPING_DELAY_MS);
  }

  return clamp(getRandomDelay(6700, 7600), MIN_TYPING_DELAY_MS, MAX_TYPING_DELAY_MS);
}

export function remainingTypingDelay(args: {
  calculatedDelayMs: number;
  elapsedMs: number;
}) {
  const remaining = args.calculatedDelayMs - args.elapsedMs;
  return clamp(Math.max(remaining, MIN_TYPING_DELAY_MS), MIN_TYPING_DELAY_MS, MAX_TYPING_DELAY_MS);
}
