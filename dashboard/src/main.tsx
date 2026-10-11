import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import { MagicSurfaceEffects } from '@/components/ui/magic-surface-effects';
import "leaflet/dist/leaflet.css";
import "@/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MagicSurfaceEffects />
    <App />
  </React.StrictMode>,
);
