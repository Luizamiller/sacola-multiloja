import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";

import "./index.css";
import { AssistenteProvider } from "@/components/assistant";
import { Layout } from "@/components/layout";
import { ToastProvider } from "@/components/toast";
import { ProdutoProvider } from "@/components/product-sheet";
import { HomePage } from "@/pages/home";
import { LoginPage } from "@/pages/login";
import { StorePage } from "@/pages/store";

try {
  const t = localStorage.getItem("tema");
  if (t === "escuro" || (!t && matchMedia("(prefers-color-scheme: dark)").matches)) document.documentElement.classList.add("dark");
} catch { /* sem armazenamento */ }

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

const P = (nome: "ProfilePage" | "AddressesPage" | "SecurityPage" | "CouponsPage" | "BagPage") =>
  async () => ({ Component: (await import("@/pages/profile"))[nome] });

if (import.meta.env.VITE_DEMO) await (await import("./demo/ponte")).iniciarDemo();

const router = createBrowserRouter([
  { path: "/entrar", element: <ToastProvider><LoginPage /></ToastProvider> },
  {
    element: (
      <ToastProvider>
        <ProdutoProvider>
          <AssistenteProvider>
            <Layout />
          </AssistenteProvider>
        </ProdutoProvider>
      </ToastProvider>
    ),
    children: [
      { path: "/busca", lazy: async () => ({ Component: (await import("@/pages/search")).SearchPage }) },
      { path: "/sacola", lazy: P("BagPage") },
      { path: "/perfil", lazy: P("ProfilePage") },
      { path: "/perfil/enderecos", lazy: P("AddressesPage") },
      { path: "/perfil/seguranca", lazy: P("SecurityPage") },
      { path: "/perfil/cupons", lazy: P("CouponsPage") },
      { path: "/", element: <HomePage /> },
      { path: "/loja/:id", element: <StorePage /> },
      { path: "/checkout", lazy: async () => ({ Component: (await import("@/pages/checkout")).CheckoutPage }) },
      { path: "/pedidos", lazy: async () => ({ Component: (await import("@/pages/orders")).OrdersPage }) },
      { path: "/pedidos/:id", lazy: async () => ({ Component: (await import("@/pages/orders")).OrderPage }) },
      { path: "/favoritos", lazy: async () => ({ Component: (await import("@/pages/favorites")).FavoritesPage }) },
    ],
  },
], { basename: import.meta.env.BASE_URL.replace(/\/$/, "") || "/" });

// Pré-carrega as rotas secundárias quando o navegador estiver ocioso: navegação instantânea sem pesar o primeiro carregamento.
const preload = () => { import("@/pages/checkout"); import("@/pages/orders"); import("@/pages/favorites"); import("@/pages/search"); import("@/pages/profile"); };
if ("requestIdleCallback" in window) requestIdleCallback(preload); else setTimeout(preload, 1500);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
