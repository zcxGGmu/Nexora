import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";

import { AppRouter } from "./app/router.js";
import { queryClient } from "./app/query-client.js";
import "./design/tokens.css";

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("Mission Control root element is missing");
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppRouter />
    </QueryClientProvider>
  </StrictMode>,
);
