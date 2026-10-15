import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { API_CONFIG } from "@/lib/config";
import { cn } from "@/lib/utils";

const statusStyles = {
  checking: "bg-slate-700/80 text-slate-100 border-slate-600",
  online: "bg-emerald-600/10 text-emerald-300 border-emerald-500",
  offline: "bg-rose-500/10 text-rose-300 border-rose-400",
  missing: "bg-amber-500/10 text-amber-300 border-amber-400",
};

const statusText = {
  checking: "Checking backend",
  online: "Backend online",
  offline: "Backend offline",
  missing: "Backend URL missing",
};

const BackendStatus = () => {
  const [status, setStatus] = useState<keyof typeof statusText>("checking");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    let baseUrl = API_CONFIG.baseUrl?.trim();
    if (!baseUrl && typeof window !== "undefined") {
      baseUrl = window.location.origin;
    }

    if (!baseUrl) {
      setStatus("missing");
      setMessage("Set VITE_API_URL for backend access.");
      return;
    }

    const healthUrl = `${baseUrl.replace(/\/*$/, "")}/health`;

    fetch(healthUrl, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json().catch(() => null);
        setStatus("online");
        setMessage(data?.status === "ok" ? "Ready to send emails." : "Backend reachable.");
      })
      .catch((error) => {
        setStatus("offline");
        setMessage(error?.message || "Unable to reach the backend.");
      });
  }, []);

  const icon =
    status === "checking" ? (
      <Loader2 className="h-4 w-4 animate-spin" />
    ) : status === "online" ? (
      <CheckCircle2 className="h-4 w-4" />
    ) : (
      <XCircle className="h-4 w-4" />
    );

  return (
    <div
      className={cn(
        "hidden md:flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-all duration-200",
        statusStyles[status]
      )}
      title={message || statusText[status]}
    >
      {icon}
      <span>{statusText[status]}</span>
    </div>
  );
};

export default BackendStatus;
