import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function App(): React.JSX.Element {
  return (
    <main>
      <p>Nexora Mission Control</p>
      <h1>Control plane is starting</h1>
    </main>
  );
}

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("Mission Control root element is missing");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
