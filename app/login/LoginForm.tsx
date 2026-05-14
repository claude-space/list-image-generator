"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (r.status === 429) {
        setErr("Too many attempts. Try again in a minute.");
        return;
      }
      if (!r.ok) {
        setErr("Wrong password.");
        return;
      }
      router.replace(next);
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex-1 grid place-items-center px-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-lg bg-zinc-900/50 border border-zinc-800 p-6 space-y-4"
      >
        <div>
          <h1 className="text-xl font-bold">Listicle → Instagram</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Sign in with the team password.
          </p>
        </div>
        <input
          type="password"
          required
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-800 focus:border-zinc-600 outline-none"
        />
        {err && <div className="text-sm text-red-400">{err}</div>}
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full px-4 py-2 rounded bg-white text-zinc-950 font-medium disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
