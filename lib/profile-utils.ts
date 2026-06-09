import { ACTIVE_PROFILE_COOKIE, DEFAULT_PROFILE_SLUG } from "@/lib/profile-defaults";

export const PROFILE_QUERY_PARAM = "profile";

export function normalizeProfileSlug(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

export function buildProfileHref(
  href: string,
  profileSlug?: string | null,
) {
  const normalized = normalizeProfileSlug(profileSlug);
  if (!normalized) return href;

  const url = new URL(href, "http://profile.local");
  url.searchParams.set(PROFILE_QUERY_PARAM, normalized);
  const search = url.searchParams.toString();
  return `${url.pathname}${search ? `?${search}` : ""}`;
}

export function buildProfileCookieValue(profileSlug?: string | null) {
  return normalizeProfileSlug(profileSlug) || DEFAULT_PROFILE_SLUG;
}

function readCookieValue(name: string) {
  if (typeof document === "undefined") return null;

  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`));

  if (!cookie) return null;
  return decodeURIComponent(cookie.split("=").slice(1).join("="));
}

export function getClientProfileSlug() {
  if (typeof window === "undefined") {
    return DEFAULT_PROFILE_SLUG;
  }

  const urlSlug = normalizeProfileSlug(
    new URLSearchParams(window.location.search).get(PROFILE_QUERY_PARAM),
  );
  if (urlSlug) return urlSlug;

  const cookieSlug = normalizeProfileSlug(readCookieValue(ACTIVE_PROFILE_COOKIE));
  return cookieSlug || DEFAULT_PROFILE_SLUG;
}

export { ACTIVE_PROFILE_COOKIE, DEFAULT_PROFILE_SLUG };
