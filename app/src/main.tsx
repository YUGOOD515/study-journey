import React from "react";
import ReactDOM from "react-dom/client";
import Root from "./Root";
import "./index.css";
import { ICON_STROKE_WIDTH, LucideProvider } from "./lib/icons";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LucideProvider strokeWidth={ICON_STROKE_WIDTH}>
      <Root />
    </LucideProvider>
  </React.StrictMode>
);
