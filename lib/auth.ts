import { cookies } from "next/headers";
import { AUTH_COOKIE, createSessionToken, verifySessionToken } from "@/lib/session";

export { AUTH_COOKIE, createSessionToken, verifySessionToken };

export async function getCurrentAdmin() {
  const token = cookies().get(AUTH_COOKIE)?.value;
  return verifySessionToken(token);
}
