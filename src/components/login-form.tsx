"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabaseBrowser } from "@/lib/supabase/browser";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPasskeySignIn() {
    setError(null);
    setPasskeyBusy(true);
    try {
      const supabase = supabaseBrowser();
      const { error: signInError } = await supabase.auth.signInWithPasskey();
      if (signInError) throw signInError;
      const sync = await fetch("/api/auth/sync", { method: "POST" });
      if (!sync.ok) throw new Error("Failed to provision account");
      const body = (await sync.json()) as { redirectTo?: string };
      router.push((body.redirectTo ?? "/") as "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Passkey sign-in failed");
    } finally {
      setPasskeyBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Login failed");
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Sign in to truffe.ai</CardTitle>
        {!sent && (
          <CardDescription>Use a passkey, or enter your email for a magic link.</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {sent ? (
          <Alert>
            <AlertTitle>Check your email</AlertTitle>
            <AlertDescription>
              We sent a sign-in link to <strong>{email}</strong>. Click it to continue. In local
              dev, check Inbucket at{" "}
              <a
                href="http://127.0.0.1:54324"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                127.0.0.1:54324
              </a>
              .
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Sign-in error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button
              type="button"
              variant="default"
              className="w-full"
              disabled={passkeyBusy || busy}
              onClick={onPasskeySignIn}
            >
              {passkeyBusy ? "Authenticating…" : "Sign in with passkey"}
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-[#4A2E1A]" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-[#3A2414] px-2 text-[#C4B8A8]">or</span>
              </div>
            </div>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                  disabled={busy || passkeyBusy}
                />
              </div>
              <Button
                type="submit"
                variant="outline"
                disabled={busy || passkeyBusy || !email}
                className="w-full"
              >
                {busy ? "Sending…" : "Send magic link"}
              </Button>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
