import { Component, type ErrorInfo, type ReactNode } from "react";

interface WorkspaceErrorBoundaryProps {
  children: ReactNode;
  onReload?: () => void;
}

interface WorkspaceErrorBoundaryState {
  failed: boolean;
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
    return (
      <div className="app-shell workspace-fault">
        <div className="page-frame workspace-fault__inner">
          <p className="mono-label">CREATORPREFLIGHT</p>
          <h1>Workspace encountered an unexpected interface error.</h1>
          <p>Reload the workspace to continue. Your locally saved draft is not rewritten by this message.</p>
          <button className="secondary-button" type="button" onClick={reload}>
            Reload workspace
          </button>
        </div>
      </div>
    );
  }
}
