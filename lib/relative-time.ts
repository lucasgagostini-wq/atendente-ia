import { format } from "date-fns";

/**
 * Formata o tempo relativo compacto para a lista de conversas.
 *
 * Regras:
 *   < 1 min  → "agora"
 *   < 60 min → "X min"
 *   < 24 h   → "X h"
 *   < 7 d    → "X d"
 *   ≥ 7 d    → "dd/MM"
 *
 * Usa `now` como âncora (atualiza a cada 30s na UI) para evitar mostrar
 * "1 min" em mensagens recém-chegadas por conta de relativeNow desatualizado.
 */
export function formatRelativeConversationTime(dateStr: string, now: number): string {
  const diffMs = now - new Date(dateStr).getTime();
  if (diffMs < 0) return "agora";            // clock skew
  if (diffMs < 60_000) return "agora";        // < 1 min
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD} d`;
  return format(new Date(dateStr), "dd/MM");
}
