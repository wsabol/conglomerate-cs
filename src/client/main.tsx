import React from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./design/fonts";
import "./design/tokens.css";
import "./design/global.css";
import { App } from "./App";

registerSW({ immediate: true });

const container = document.getElementById("root");
if (!container) throw new Error("Root element #root not found");

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
