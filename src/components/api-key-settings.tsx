"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Settings, Loader2, Eye, EyeOff, CheckCircle2, XCircle, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type KeyStatus = {
  masked: string;
  configured: boolean;
};

type KeyFormState = {
  tavily: string;
  serper: string;
  apiserpent: string;
  openrouter: string;
};

type KeyStatusMap = {
  tavily?: KeyStatus;
  serper?: KeyStatus;
  apiserpent?: KeyStatus;
  openrouter?: KeyStatus;
};

const SEARCH_PROVIDERS = [
  {
    id: "tavily" as const,
    label: "Tavily",
    placeholder: "tvly-...",
    hint: "Get yours at tavily.com",
  },
  {
    id: "serper" as const,
    label: "Serper",
    placeholder: "xxx...",
    hint: "Get yours at serper.dev — free tier: 2,500/month",
  },
  {
    id: "apiserpent" as const,
    label: "Apiserpent",
    placeholder: "xxx...",
    hint: "Get yours at apiserpent.com",
  },
];

const AI_PROVIDERS = [
  {
    id: "openrouter" as const,
    label: "OpenRouter",
    placeholder: "sk-or-...",
    hint: "Get yours at openrouter.ai — powers AI outfit analysis (VLM)",
  },
];

const ALL_PROVIDERS = [...SEARCH_PROVIDERS, ...AI_PROVIDERS];

export function ApiKeySettings() {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [form, setForm] = useState<KeyFormState>({
    tavily: "",
    serper: "",
    apiserpent: "",
    openrouter: "",
  });
  const [statusMap, setStatusMap] = useState<KeyStatusMap>({});

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/keys");
      if (res.ok) {
        const data: KeyStatusMap = await res.json();
        setStatusMap(data);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchStatus();
      setForm({ tavily: "", serper: "", apiserpent: "", openrouter: "" });
      setShowKeys(false);
    }
  }, [open, fetchStatus]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const keysToSave: Partial<KeyFormState> = {};
      for (const p of ALL_PROVIDERS) {
        const val = form[p.id].trim();
        if (val) {
          keysToSave[p.id] = val;
        }
      }

      if (Object.keys(keysToSave).length === 0) {
        toast.error("No keys to save — enter at least one API key");
        setSaving(false);
        return;
      }

      const res = await fetch("/api/keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: keysToSave }),
      });

      if (!res.ok) {
        throw new Error("Failed to save keys");
      }

      toast.success("API keys saved");
      await fetchStatus();
      setForm({ tavily: "", serper: "", apiserpent: "", openrouter: "" });
      setShowKeys(false);
    } catch {
      toast.error("Could not save keys");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async (provider: string) => {
    try {
      const res = await fetch("/api/keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: { [provider]: "" } }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(`${ALL_PROVIDERS.find((p) => p.id === provider)?.label} key removed`);
      await fetchStatus();
    } catch {
      toast.error("Could not remove key");
    }
  };

  const renderProviderField = (p: typeof ALL_PROVIDERS[number], idx: number) => {
    const status = statusMap[p.id];
    const isConfigured = status?.configured;
    return (
      <div key={p.id} className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={p.id} className="text-sm font-medium">
            <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
              {idx + 1}
            </span>
            {p.label}
          </Label>
          {isConfigured ? (
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              <span className="text-xs text-muted-foreground">{status?.masked}</span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-1 h-6 px-1.5 text-xs text-destructive hover:text-destructive"
                onClick={() => handleClear(p.id)}
              >
                Remove
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <XCircle className="h-3.5 w-3.5 text-muted-foreground/40" />
              <span className="text-xs text-muted-foreground">Not set</span>
            </div>
          )}
        </div>
        <div className="relative">
          <Input
            id={p.id}
            type={showKeys ? "text" : "password"}
            placeholder={p.placeholder}
            value={form[p.id]}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, [p.id]: e.target.value }))
            }
            className="pr-9"
            autoComplete="off"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
            onClick={() => setShowKeys((v) => !v)}
          >
            {showKeys ? (
              <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {p.hint}
        </p>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <Settings className="h-4 w-4" />
          <span className="sr-only">API Key Settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            API Keys
          </DialogTitle>
          <DialogDescription>
            Configure API keys for product search. Image generation is powered by Z.ai — no key needed.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 py-2">
            {/* Product Search Keys */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <Search className="h-3.5 w-3.5" />
                Product Search
              </div>
              <p className="text-[11px] text-muted-foreground">
                Tried in order: Tavily → Serper → Apiserpent
              </p>
            </div>
            {SEARCH_PROVIDERS.map((p, idx) => renderProviderField(p, idx))}

            {/* AI Analysis Keys */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                AI Analysis
              </div>
              <p className="text-[11px] text-muted-foreground">
                Powers AI outfit analysis (vision model)
              </p>
            </div>
            {AI_PROVIDERS.map((p, idx) => renderProviderField(p, idx))}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
              </>
            ) : (
              "Save keys"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
