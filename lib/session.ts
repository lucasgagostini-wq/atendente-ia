import { SignJWT, jwtVerify } from "jose";

export const AUTH_COOKIE = "atendente_admin";

/** Tamanho mínimo aceitável para um segredo configurado manualmente. */
const MIN_SECRET_LENGTH = 16;

type AdminSession = {
  sub: string;
  email: string;
  name: string;
};

/**
 * Lê o segredo de sessão a partir das variáveis aceitas, em ordem de
 * preferência. `JWT_SECRET` é aceito porque já era usado em ambientes
 * existentes (antes só `ADMIN_SESSION_SECRET` era lido, o que silenciosamente
 * caía no fallback inseguro).
 */
function readConfiguredSecret() {
  const candidates = [
    process.env.ADMIN_SESSION_SECRET,
    process.env.JWT_SECRET,
    process.env.NEXTAUTH_SECRET,
  ];

  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value && value.length >= MIN_SECRET_LENGTH) {
      return value;
    }
  }

  return null;
}

let warnedAboutFallbackSecret = false;

function warnOnceAboutFallbackSecret(message: string) {
  if (warnedAboutFallbackSecret) return;
  warnedAboutFallbackSecret = true;
  console.error(`[auth] ${message}`);
}

/**
 * Resolve a chave usada para assinar/verificar a sessão do admin.
 *
 * Edge-safe (usado pelo middleware): sem `node:crypto`, apenas Web Crypto.
 * Assíncrono porque a derivação em produção usa `crypto.subtle.digest`.
 */
async function getAuthSecret() {
  const configured = readConfiguredSecret();
  if (configured) {
    return new TextEncoder().encode(configured);
  }

  // Sem segredo forte configurado.
  if (process.env.NODE_ENV === "production") {
    // NUNCA assinar sessões de produção com uma constante pública: "dev-secret"
    // está no repositório aberto e permitiria forjar tokens de admin.
    // Como rede de segurança, deriva um segredo estável e não-adivinhável a
    // partir de outro segredo de servidor (a string de conexão do banco),
    // válido entre instâncias e deploys. Mesmo assim, o correto é definir
    // ADMIN_SESSION_SECRET na Vercel.
    const derivedFrom = process.env.DATABASE_URL || process.env.DIRECT_URL;
    if (derivedFrom) {
      warnOnceAboutFallbackSecret(
        "ADMIN_SESSION_SECRET ausente em produção — usando segredo derivado do banco. Defina ADMIN_SESSION_SECRET na Vercel para um valor dedicado.",
      );
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`atendente-ia:auth:${derivedFrom}`),
      );
      return new Uint8Array(digest);
    }

    throw new Error(
      "ADMIN_SESSION_SECRET não configurado em produção e sem fonte para derivar um segredo seguro.",
    );
  }

  warnOnceAboutFallbackSecret(
    "Usando segredo de desenvolvimento. Defina ADMIN_SESSION_SECRET (ou JWT_SECRET) no .env.",
  );
  return new TextEncoder().encode("dev-secret");
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
    .sign(await getAuthSecret());
}

export async function verifySessionToken(token?: string | null) {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, await getAuthSecret());
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
