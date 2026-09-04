import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { WorkspaceErrorBoundary } from "./features/persistence/WorkspaceErrorBoundary";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WorkspaceErrorBoundary>
      <App />
    </WorkspaceErrorBoundary>
  </StrictMode>,
);
