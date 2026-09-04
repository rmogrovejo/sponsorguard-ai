import { Component, type ErrorInfo, type ReactNode } from "react";

import { isLocale } from "../../i18n/locale";
import { translate } from "../../i18n/translations";

interface WorkspaceErrorBoundaryProps {
  children: ReactNode;
  onReload?: () => void;
}

interface WorkspaceErrorBoundaryState {
  failed: boolean;
}

function boundaryLocale() {
  return isLocale(document.documentElement.lang) ? document.documentElement.lang : "en";
}

export class WorkspaceErrorBoundary extends Component<
  WorkspaceErrorBoundaryProps,
  WorkspaceErrorBoundaryState
> {
  state: WorkspaceErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): WorkspaceErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error("CreatorPreflight workspace render failed", error, info.componentStack);
    }
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    const reload = this.props.onReload ?? (() => window.location.reload());
    const locale = boundaryLocale();
    return (
      <div className="app-shell workspace-fault">
        <div className="page-frame workspace-fault__inner">
          <p className="mono-label">{translate(locale, "fault.kicker")}</p>
          <h1>{translate(locale, "fault.title")}</h1>
          <p>{translate(locale, "fault.body")}</p>
          <button className="secondary-button" type="button" onClick={reload}>
            {translate(locale, "fault.reload")}
          </button>
        </div>
      </div>
    );
  }
}
