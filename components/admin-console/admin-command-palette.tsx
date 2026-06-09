"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowsCounterClockwise,
  CheckCircle,
  Command,
  MagnifyingGlass,
  TerminalWindow,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  adminConsoleCommands,
  type AdminConsoleCommandDefinition,
  type AdminConsoleCommandId,
} from "@/lib/admin-console/commands";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CommandExecutionResponse = {
  commandId: AdminConsoleCommandId;
  successMessage: string;
  result: Record<string, unknown>;
};

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  const tag = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tag === "input" ||
    tag === "textarea" ||
    tag === "select"
  );
}

function matchesCommand(command: AdminConsoleCommandDefinition, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  const haystack = [
    command.title,
    command.description,
    command.id,
    ...command.keywords,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

export function AdminCommandPalette() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pendingCommandId, setPendingCommandId] = useState<AdminConsoleCommandId | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const filteredCommands = useMemo(
    () => adminConsoleCommands.filter((command) => matchesCommand(command, query)),
    [query],
  );

  const activeCommand = pendingCommandId
    ? adminConsoleCommands.find((command) => command.id === pendingCommandId) ?? null
    : filteredCommands[selectedIndex] ?? null;

  const openPalette = useCallback(() => {
    setIsOpen(true);
    setQuery("");
    setSelectedIndex(0);
    setPendingCommandId(null);
  }, []);

  const closePalette = useCallback(() => {
    if (isRunning) return;
    setIsOpen(false);
    setQuery("");
    setSelectedIndex(0);
    setPendingCommandId(null);
  }, [isRunning]);

  const togglePalette = useCallback(() => {
    if (isRunning) return;

    if (isOpen) {
      closePalette();
      return;
    }

    openPalette();
  }, [closePalette, isOpen, isRunning, openPalette]);

  const executeCommand = useCallback(async (command: AdminConsoleCommandDefinition) => {
    setIsRunning(true);

    try {
      const payload = await api.post<CommandExecutionResponse>(
        `/api/admin/commands/${command.id}`,
      );

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["leads"] }),
        queryClient.invalidateQueries({ queryKey: ["lead"] }),
        queryClient.invalidateQueries({ queryKey: ["conversations"] }),
        queryClient.invalidateQueries({ queryKey: ["conversation"] }),
      ]);

      router.refresh();
      setIsOpen(false);
      setQuery("");
      setSelectedIndex(0);
      setPendingCommandId(null);
      toast.success(payload.successMessage);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao executar o comando.";
      toast.error(message);
    } finally {
      setIsRunning(false);
    }
  }, [queryClient, router]);

  const handlePrimaryAction = useCallback(() => {
    const command = filteredCommands[selectedIndex];
    if (!command || isRunning) return;
    setPendingCommandId(command.id);
  }, [filteredCommands, isRunning, selectedIndex]);

  useEffect(() => {
    if (!isOpen || pendingCommandId) return;
    setSelectedIndex((current) => {
      if (filteredCommands.length === 0) return 0;
      return Math.min(current, filteredCommands.length - 1);
    });
  }, [filteredCommands, isOpen, pendingCommandId]);

  useEffect(() => {
    if (!isOpen) return;

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 10);

    return () => window.clearTimeout(timer);
  }, [isOpen, pendingCommandId]);

  // Permite que qualquer botão externo abra o console via evento customizado.
  useEffect(() => {
    function onOpenRequest() { openPalette(); }
    window.addEventListener("admin:open-console", onOpenRequest);
    return () => window.removeEventListener("admin:open-console", onOpenRequest);
  }, [openPalette]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return;

      const isQuoteShortcut =
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        (event.key === "'" || event.code === "Quote");
      const isCommandShortcut =
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "k";
      const shouldToggle =
        (isQuoteShortcut || isCommandShortcut) &&
        (isOpen || !isEditableTarget(event.target));

      if (shouldToggle) {
        event.preventDefault();
        togglePalette();
        return;
      }

      if (!isOpen) return;

      if (event.key === "Escape") {
        event.preventDefault();
        if (pendingCommandId) {
          setPendingCommandId(null);
          return;
        }
        closePalette();
        return;
      }

      if (pendingCommandId) {
        if (event.key === "Enter" && activeCommand) {
          event.preventDefault();
          void executeCommand(activeCommand);
        }
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((current) =>
          filteredCommands.length === 0 ? 0 : (current + 1) % filteredCommands.length,
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((current) =>
          filteredCommands.length === 0
            ? 0
            : (current - 1 + filteredCommands.length) % filteredCommands.length,
        );
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        handlePrimaryAction();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeCommand,
    closePalette,
    executeCommand,
    filteredCommands,
    handlePrimaryAction,
    isOpen,
    pendingCommandId,
    togglePalette,
  ]);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={openPalette}
        title="Comandos rápidos (Ctrl+K)"
        aria-label="Abrir console de comandos"
        className="fixed bottom-6 right-6 z-[9999] flex items-center gap-2 rounded-xl border border-indigo-500/50 bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-900/40 transition-all hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
      >
        <TerminalWindow size={15} weight="bold" />
        Comandos
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center px-4 py-14 sm:px-6">
      <button
        type="button"
        aria-label="Fechar console"
        className="absolute inset-0 bg-zinc-950/82 backdrop-blur-sm"
        onClick={closePalette}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Console administrativo"
        className="relative z-[10000] w-full max-w-2xl overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/95 shadow-2xl shadow-black/50"
      >
        <div className="border-b border-zinc-800/70 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-300">
                <Command size={18} weight="duotone" />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-100">Admin Console</p>
                <p className="text-xs text-zinc-500">
                  Comandos rápidos para testes e operação interna.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={closePalette}
              className="flex size-8 items-center justify-center rounded-lg border border-zinc-800/80 bg-zinc-900/60 text-zinc-500 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-200"
              aria-label="Fechar"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {!pendingCommandId ? (
          <>
            <div className="border-b border-zinc-800/70 px-5 py-4">
              <div className="flex items-center gap-3 rounded-lg border border-zinc-800/80 bg-zinc-900/70 px-3">
                <MagnifyingGlass size={16} className="text-zinc-500" />
                <Input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar comando..."
                  className="h-11 border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:border-transparent"
                  autoComplete="off"
                  spellCheck={false}
                  onKeyDown={(event) => {
                    if (event.key === "'" && !event.ctrlKey && !event.metaKey && !event.altKey) {
                      event.preventDefault();
                    }
                  }}
                />
              </div>
            </div>

            <div className="max-h-[420px] overflow-y-auto p-3">
              {filteredCommands.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-800/80 bg-zinc-900/40 px-4 py-10 text-center">
                  <p className="text-sm font-medium text-zinc-200">Nenhum comando encontrado.</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Tente buscar por reset, admin, QA ou número.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredCommands.map((command, index) => {
                    const active = index === selectedIndex;

                    return (
                      <button
                        key={command.id}
                        type="button"
                        onMouseEnter={() => setSelectedIndex(index)}
                        onClick={() => setPendingCommandId(command.id)}
                        className={cn(
                          "w-full rounded-lg border px-4 py-3 text-left transition-all",
                          active
                            ? "border-indigo-500/40 bg-indigo-500/10 shadow-[0_0_0_1px_rgba(99,102,241,0.12)]"
                            : "border-zinc-800/70 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900/80",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={cn(
                              "mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border",
                              active
                                ? "border-indigo-500/30 bg-indigo-500/15 text-indigo-300"
                                : "border-zinc-800/70 bg-zinc-900 text-zinc-500",
                            )}
                          >
                            <ArrowsCounterClockwise size={16} weight="duotone" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <p className="truncate text-sm font-semibold text-zinc-100">
                                {command.title}
                              </p>
                              <span className="rounded-md border border-zinc-800/80 bg-zinc-950/70 px-2 py-1 text-[10px] uppercase tracking-widest text-zinc-500">
                                {command.id}
                              </span>
                            </div>
                            <p className="mt-1 text-xs leading-5 text-zinc-500">
                              {command.description}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-zinc-800/70 px-5 py-3 text-[11px] text-zinc-500">
              <div className="flex items-center gap-3">
                <span className="rounded-md border border-zinc-800/80 bg-zinc-900/70 px-2 py-1 text-zinc-400">
                  &apos;
                </span>
                <span>abre em qualquer tela autenticada</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-zinc-800/80 bg-zinc-900/70 px-2 py-1">Ctrl K abre</span>
                <span className="rounded-md border border-zinc-800/80 bg-zinc-900/70 px-2 py-1">Esc fecha</span>
                <span className="rounded-md border border-zinc-800/80 bg-zinc-900/70 px-2 py-1">Enter executa</span>
              </div>
            </div>
          </>
        ) : activeCommand ? (
          <div className="p-5">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 p-4">
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-300">
                  <WarningCircle size={18} weight="duotone" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-100">
                    {activeCommand.confirmationTitle}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-zinc-400">
                    {activeCommand.confirmationBody}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-zinc-800/70 bg-zinc-900/50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-600">
                Comando
              </p>
              <p className="mt-1 text-sm font-medium text-zinc-100">{activeCommand.title}</p>
              <p className="mt-1 text-xs text-zinc-500">{activeCommand.description}</p>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setPendingCommandId(null)}
                disabled={isRunning}
              >
                Cancelar
              </Button>
              <Button
                variant={activeCommand.variant === "destructive" ? "destructive" : "secondary"}
                onClick={() => void executeCommand(activeCommand)}
                disabled={isRunning}
              >
                {isRunning ? (
                  <>
                    <ArrowsCounterClockwise size={14} className="animate-spin" />
                    Executando...
                  </>
                ) : (
                  <>
                    <CheckCircle size={14} weight="bold" />
                    Confirmar
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
