import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { createApiClient } from "./api";
import { App } from "./App";
import "./styles/tokens.css";
import "./styles/global.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App api={createApiClient()} />
  </StrictMode>,
);
