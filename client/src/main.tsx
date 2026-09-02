import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("FORENSIC-X root element was not found.");
}

createRoot(rootElement).render(<App />);
