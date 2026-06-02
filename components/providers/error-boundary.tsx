"use client";

import React, { Component, ReactNode } from "react";
import { Warning, ArrowsClockwise } from "@phosphor-icons/react";

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

/**
 * ErrorBoundary — captura erros de React não tratados e exibe uma tela amigável
 * em vez de derrubar toda a aplicação.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 rounded-xl border border-red-900/40 bg-red-950/20 p-8 text-center">
        <div className="grid size-12 place-items-center rounded-xl bg-red-900/30 ring-1 ring-red-700/30">
          <Warning size={22} weight="duotone" className="text-red-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-red-300">Algo deu errado</p>
          <p className="mt-1 max-w-xs text-xs text-red-500/80">
            {this.state.error?.message ?? "Erro inesperado no componente"}
          </p>
        </div>
        <button
          onClick={() => this.setState({ hasError: false, error: null })}
          className="flex items-center gap-1.5 rounded-lg border border-red-800/40 bg-red-900/20 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-900/30"
        >
          <ArrowsClockwise size={12} weight="bold" />
          Tentar novamente
        </button>
      </div>
    );
  }
}
