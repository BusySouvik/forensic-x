import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import Home from "./pages/Home";

export default function App() {
  return (
    <ErrorBoundary>
      <TooltipProvider>
        <Toaster />
        <Home />
      </TooltipProvider>
    </ErrorBoundary>
  );
}

// Frontend-only demo: no real disk, recovery, erasure, ledger, or external API operations are performed.
