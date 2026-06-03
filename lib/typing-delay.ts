import { clamp, randomBetween, sleep } from "@/lib/utils";

export const MIN_TYPING_DELAY_MS = Number(process.env.MIN_TYPING_DELAY_MS || 2500);
export const MAX_TYPING_DELAY_MS = Number(process.env.MAX_TYPING_DELAY_MS || 7800);
export const AI_RESPONSE_TIMEOUT_MS = Number(process.env.AI_RESPONSE_TIMEOUT_MS || 12000);
export const AI_FAST_RESPONSE_MIN_DELAY_MS = Number(
  process.env.AI_FAST_RESPONSE_MIN_DELAY_MS || 2500,
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
    return clamp(getRandomDelay(2500, 3800), MIN_TYPING_DELAY_MS, MAX_TYPING_DELAY_MS);
  }

  if (length <= 220) {
    return clamp(getRandomDelay(4500, 5800), MIN_TYPING_DELAY_MS, MAX_TYPING_DELAY_MS);
  }

  return clamp(getRandomDelay(6500, 7800), MIN_TYPING_DELAY_MS, MAX_TYPING_DELAY_MS);
}

export function remainingTypingDelay(args: {
  calculatedDelayMs: number;
  elapsedMs: number;
}) {
  const minimumDelay = Math.max(args.calculatedDelayMs, AI_FAST_RESPONSE_MIN_DELAY_MS);
  return clamp(minimumDelay - args.elapsedMs, 0, MAX_TYPING_DELAY_MS);
}
