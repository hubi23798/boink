"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { supabaseBrowser } from "@/lib/supabase/browser";

export function PasskeyRegisterButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onRegister() {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const supabase = supabaseBrowser();
      const { data, error: regError } = await supabase.auth.registerPasskey();
      if (regError) throw regError;
      setMessage(`Passkey registered${data?.id ? ` (${data.id.slice(0, 8)}…)` : ""}.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {message ? (
        <Alert>
          <AlertTitle>Passkey added</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Registration error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="button" onClick={onRegister} disabled={busy}>
        {busy ? "Registering…" : "Add a passkey"}
      </Button>
      <p className="text-xs text-[#C4B8A8]">
        Requires Touch ID, Face ID, or a security key. First-time users should sign in with a magic
        link once, then register a passkey here.
      </p>
    </div>
  );
}
