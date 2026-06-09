import { cookies } from "next/headers";
import {
  DEFAULT_PROFILE_SLUG,
  PROFILE_QUERY_PARAM,
  normalizeProfileSlug,
} from "@/lib/profile-utils";
import { ACTIVE_PROFILE_COOKIE } from "@/lib/profile-defaults";

export { PROFILE_QUERY_PARAM } from "@/lib/profile-utils";

export function getProfileSlugFromRequest(request?: Request) {
  const url = request ? new URL(request.url) : null;
  const querySlug = normalizeProfileSlug(
    url?.searchParams.get(PROFILE_QUERY_PARAM),
  );

  if (querySlug) return querySlug;

  try {
    const cookieSlug = normalizeProfileSlug(
      cookies().get(ACTIVE_PROFILE_COOKIE)?.value,
    );
    return cookieSlug || DEFAULT_PROFILE_SLUG;
  } catch {
    return DEFAULT_PROFILE_SLUG;
  }
}
