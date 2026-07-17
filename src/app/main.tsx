import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { recordErrorSafely } from "@/services/errorLog";
import { initCloseGuard } from "@/services/closeGuard";
import { runStartupBackupCheck } from "@/services/backup/scheduler";
import "../styles/index.css";

initCloseGuard();
void runStartupBackupCheck();

window.addEventListener("error", (event) => {
  console.error("[SODIAC] Error global no controlado:", event.error ?? event.message);
  void recordErrorSafely("window_error", event.message, event.error?.stack);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason);
  console.error("[SODIAC] Promesa rechazada sin controlar:", reason);
  void recordErrorSafely("unhandled_rejection", message, reason instanceof Error ? reason.stack : undefined);
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
