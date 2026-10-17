import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ToastContainer } from "@/components/ToastNotification";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Dashboard from "./pages/Dashboard";
import Upload from "./pages/Upload";
import Analysis from "./pages/Analysis";
import Graph from "./pages/Graph";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Patterns from "./pages/Patterns";
import Benchmarks from "./pages/Benchmarks";
import Heatmap from "./pages/Heatmap";
import AuthCallback from "./pages/AuthCallback";
import LiveThreatMap from "./pages/LiveThreatMap";
import WarRoom from "./pages/WarRoom";
import AgentChat from "./pages/AgentChat";
import Governance from "./pages/Governance";
import FederatedDemo from "./pages/FederatedDemo";
import ComplianceDashboard from "./pages/ComplianceDashboard";
import Documentation from "./pages/Documentation";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <ToastContainer />
        <BrowserRouter>
        <Routes>
          <Route path="/cryptoflow" element={<Index />} />
          <Route path="/cryptoflow/auth/callback" element={<AuthCallback />} />
          <Route path="/cryptoflow/dashboard" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />
          <Route path="/cryptoflow/threats" element={
            <ProtectedRoute>
              <LiveThreatMap />
            </ProtectedRoute>
          } />
          <Route path="/cryptoflow/warroom" element={
            <ProtectedRoute>
              <WarRoom />
            </ProtectedRoute>
          } />
          <Route path="/cryptoflow/upload" element={
            <ProtectedRoute>
              <Upload />
            </ProtectedRoute>
          } />
          <Route path="/cryptoflow/analysis" element={
            <ProtectedRoute>
              <Analysis />
            </ProtectedRoute>
          } />
          <Route path="/cryptoflow/graph" element={
            <ProtectedRoute>
              <Graph />
            </ProtectedRoute>
          } />
          <Route path="/cryptoflow/heatmap" element={
            <ProtectedRoute>
              <Heatmap />
            </ProtectedRoute>
          } />
          <Route path="/cryptoflow/reports" element={
            <ProtectedRoute>
              <Reports />
            </ProtectedRoute>
          } />
          <Route path="/cryptoflow/settings" element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          } />
          <Route path="/cryptoflow/patterns" element={
            <ProtectedRoute>
              <Patterns />
            </ProtectedRoute>
          } />
          <Route path="/cryptoflow/benchmarks" element={
            <ProtectedRoute>
              <Benchmarks />
            </ProtectedRoute>
          } />
          <Route path="/cryptoflow/agent" element={
            <ProtectedRoute>
              <AgentChat />
            </ProtectedRoute>
          } />
          <Route path="/cryptoflow/governance" element={
            <ProtectedRoute>
              <Governance />
            </ProtectedRoute>
          } />
          <Route path="/cryptoflow/federated" element={
            <ProtectedRoute>
              <FederatedDemo />
            </ProtectedRoute>
          } />
          <Route path="/cryptoflow/compliance" element={
            <ProtectedRoute>
              <ComplianceDashboard />
            </ProtectedRoute>
          } />
          <Route path="/cryptoflow/documentation" element={
            <ProtectedRoute>
              <Documentation />
            </ProtectedRoute>
          } />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;

