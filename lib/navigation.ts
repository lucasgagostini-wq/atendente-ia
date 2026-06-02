import {
  ChatCircleText,
  Gear,
  House,
  MapPin,
  Megaphone,
  Sparkle,
  TreeStructure,
  Users,
} from "@phosphor-icons/react";

export const navGroups = [
  {
    label: "Principal",
    description: "Atendimento e acompanhamento do dia a dia.",
    items: [
      { href: "/dashboard", label: "Dashboard", shortLabel: "Central", icon: House, weight: "duotone" as const },
      { href: "/conversas", label: "Conversas", shortLabel: "Conversas", icon: ChatCircleText, weight: "duotone" as const },
      { href: "/leads", label: "Leads", shortLabel: "Leads", icon: Users, weight: "duotone" as const },
    ],
  },
  {
    label: "Automação",
    description: "Prospecção, campanhas e rotinas automáticas.",
    items: [
      { href: "/disparos", label: "Disparos", shortLabel: "Disparos", icon: Megaphone, weight: "duotone" as const },
      { href: "/automacoes", label: "Automações", shortLabel: "Automações", icon: TreeStructure, weight: "duotone" as const },
      { href: "/prospeccao", label: "Prospecção", shortLabel: "Prospecção", icon: MapPin, weight: "duotone" as const },
    ],
  },
  {
    label: "Sistema",
    description: "Ajustes da IA e integrações da operação.",
    items: [
      { href: "/prompt", label: "Prompt IA", shortLabel: "Prompt", icon: Sparkle, weight: "duotone" as const },
      { href: "/configuracoes", label: "Configurações", shortLabel: "Config", icon: Gear, weight: "duotone" as const },
    ],
  },
];

const routeDescriptions: Record<string, string> = {
  "/dashboard": "Resumo da operação, prontidão da IA e próximos passos do admin.",
  "/conversas": "Acompanhe atendimentos, assuma conversas e monitore respostas da IA.",
  "/leads": "Organize o CRM, edite contatos e aplique ações em massa com rapidez.",
  "/disparos": "Monte campanhas por tag, defina mensagens e intervalos de envio.",
  "/automacoes": "Controle regras, gatilhos e fluxos automáticos da plataforma.",
  "/prospeccao": "Busque leads no Google Maps e envie para o CRM quando fizer sentido.",
  "/prompt": "Defina entonação, objetivo e regras que a IA seguirá no atendimento.",
  "/configuracoes": "Conecte WhatsApp, IA, webhook e serviços externos da plataforma.",
  "/login": "Acesse a central administrativa da operação.",
  "/setup-admin": "Configure o primeiro acesso administrativo.",
};

function findNavItem(pathname: string) {
  for (const group of navGroups) {
    for (const item of group.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
        return { group, item };
      }
    }
  }
  return null;
}

function titleFromSegment(segment: string) {
  return segment
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getPageContext(pathname: string) {
  const active = findNavItem(pathname);

  if (active) {
    return {
      title: active.item.label,
      description: routeDescriptions[active.item.href] ?? active.group.description,
      group: active.group,
      item: active.item,
    };
  }

  const segments = pathname.split("/").filter(Boolean);
  const title = segments.length ? titleFromSegment(segments[segments.length - 1]) : "Dashboard";

  return {
    title,
    description: routeDescriptions[pathname] ?? "Área administrativa da plataforma.",
    group: null,
    item: null,
  };
}

export type NavigationBreadcrumbItem = {
  label: string;
  href?: string;
};

export function buildBreadcrumbItems(pathname: string): NavigationBreadcrumbItem[] {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return [{ label: "Dashboard" }];
  }

  const items: NavigationBreadcrumbItem[] = [{ label: "Dashboard", href: "/dashboard" }];
  let currentPath = "";

  for (const segment of segments) {
    currentPath += `/${segment}`;
    const context = getPageContext(currentPath);

    items.push({
      label: context.title,
      href: currentPath === pathname ? undefined : currentPath,
    });
  }

  if (pathname === "/dashboard") {
    return [{ label: "Dashboard" }];
  }

  return items;
}
