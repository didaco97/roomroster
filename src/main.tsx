import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { InkProvider } from "./lib/ink/react";
import App from "./App";
import "./styles/looseleaf.css";
import "./styles/app.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <InkProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </InkProvider>
  </React.StrictMode>,
);
