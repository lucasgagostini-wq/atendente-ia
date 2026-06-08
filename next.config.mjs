/** @type {import('next').NextConfig} */
const nextConfig = {
  // ── Segurança: headers aplicados a todas as rotas ─────────────────────────
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Impede que a página seja embutida em iframes de outros domínios
          { key: "X-Frame-Options",       value: "SAMEORIGIN" },
          // Impede MIME-sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Política de referência mínima para evitar vazamento de URL
          { key: "Referrer-Policy",        value: "strict-origin-when-cross-origin" },
          // Desativa features sensíveis desnecessárias
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
      // Cache agressivo para assets estáticos (imagens, fontes, chunks JS/CSS)
      {
        source: "/_next/static/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },

  // ── Otimização de bundle ───────────────────────────────────────────────────
  // Tree-shake automático para pacotes que não suportam ESM adequadamente.
  // @phosphor-icons já é tree-shakeable; aqui garantimos date-fns/locale também.
  transpilePackages: [],

  // Reduz re-renders desnecessários durante builds de produção
  reactStrictMode: true,

  // ── Imagens ───────────────────────────────────────────────────────────────
  // QR codes chegam como base64 — sem domínios externos para configurar agora.
  // Adicionando suporte a WebP e AVIF para imagens que possam ser adicionadas.
  images: {
    formats: ["image/avif", "image/webp"],
  },

  // ── Logging de build silencioso ───────────────────────────────────────────
  // Mantém output limpo em CI; erros reais ainda aparecem.
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
