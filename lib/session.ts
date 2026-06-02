import { SignJWT, jwtVerify } from "jose";

export const AUTH_COOKIE = "atendente_admin";

type AdminSession = {
  sub: string;
  email: string;
  name: string;
};

function getAuthSecret() {
  const secret =
    process.env.ADMIN_SESSION_SECRET || process.env.NEXTAUTH_SECRET || "dev-secret";
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(session: AdminSession) {
  return new SignJWT({
    email: session.email,
    name: session.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getAuthSecret());
}

export async function verifySessionToken(token?: string | null) {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    if (!payload.sub || !payload.email || !payload.name) return null;

    return {
      id: payload.sub,
      email: String(payload.email),
      name: String(payload.name),
    };
  } catch {
    return null;
  }
}
