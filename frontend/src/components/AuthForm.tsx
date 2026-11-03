
"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, FileText, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "register" | "forgot" | "reset";

const copy = {
  login: {
    title: "Welcome back",
    subtitle: "Sign in to continue to your workspace.",
    button: "Sign in",
  },
  register: {
    title: "Create your account",
    subtitle: "Start building and managing forms in one place.",
    button: "Create account",
  },
  forgot: {
    title: "Reset your password",
    subtitle: "We'll send you a link to reset your password.",
    button: "Send reset link",
  },
  reset: {
    title: "Choose a new password",
    subtitle: "Make sure it's strong and easy to remember.",
    button: "Update password",
  },
};

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const supabase = createClient();

      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/dashboard");
        router.refresh();
      } else if (mode === "register") {
        const { error, data } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name } },
        });
        if (error) throw error;

        setMessage(
          data.session
            ? "Your account is ready. Redirecting…"
            : "Account created. Check your email to confirm your address."
        );

        if (data.session) router.push("/dashboard");
      } else if (mode === "forgot") {
        const { error } =
          await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
          });
        if (error) throw error;

        setMessage(
          "If an account exists for this email, a password reset link has been sent."
        );
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;

        setMessage("Password updated successfully.");
        router.push("/login");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  async function signInWith(provider: "google" | "github") {
    setError("");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to start social sign-in."
      );
    }
  }

  const { title, subtitle, button } = copy[mode];

  return (
    <main className="min-h-screen bg-[#f6f8fc] px-5 py-10 flex items-center justify-center">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-8 flex items-center justify-center gap-2 text-slate-900 font-bold text-xl"
        >
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-white">
            <FileText size={20} />
          </span>
          Hypervision <span className="text-indigo-600">Form</span>
        </Link>

        <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_18px_55px_rgba(15,23,42,0.07)] sm:p-9">
          <div className="mb-7">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
              Your workspace, simplified
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {title}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {subtitle}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <label className="block text-sm font-medium text-slate-700">
                Full name
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="form-field mt-1.5"
                />
              </label>
            )}

            {mode !== "reset" && (
              <label className="block text-sm font-medium text-slate-700">
                Email address
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="form-field mt-1.5"
                />
              </label>
            )}

            {mode !== "forgot" && (
              <label className="block text-sm font-medium text-slate-700">
                Password
                <span className="relative mt-1.5 block">
                  <input
                    required
                    minLength={
                      mode === "reset" || mode === "register" ? 8 : 1
                    }
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      mode === "login"
                        ? "Enter your password"
                        : "At least 8 characters"
                    }
                    className="form-field pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    className="absolute inset-y-0 right-3 text-slate-400 hover:text-slate-700"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </span>
              </label>
            )}

            {mode === "login" && (
              <div className="flex justify-end">
                <Link
                  href="/forgot-password"
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
                >
                  Forgot password?
                </Link>
              </div>
            )}

            {error && (
              <p
                role="alert"
                className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700"
              >
                {error}
              </p>
            )}

            {message && (
              <p
                role="status"
                className="rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700"
              >
                {message}
              </p>
            )}

            <button
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <Loader2 size={17} className="animate-spin" />
              ) : null}
              {button}
              {!loading && <ArrowRight size={17} />}
            </button>
          </form>

          {(mode === "login" || mode === "register") && (
            <>
              <div className="my-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-slate-200" />
                <span className="text-xs text-slate-400">
                  OR CONTINUE WITH
                </span>
                <span className="h-px flex-1 bg-slate-200" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => signInWith("google")}
                  type="button"
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Google
                </button>
                <button
                  onClick={() => signInWith("github")}
                  type="button"
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  GitHub
                </button>
              </div>
            </>
          )}

          <p className="mt-7 text-center text-sm text-slate-500">
            {mode === "login" ? (
              <>
                New to Hypervision?{" "}
                <Link
                  className="font-semibold text-indigo-600"
                  href="/register"
                >
                  Create an account
                </Link>
              </>
            ) : mode === "register" ? (
              <>
                Already have an account?{" "}
                <Link
                  className="font-semibold text-indigo-600"
                  href="/login"
                >
                  Sign in
                </Link>
              </>
            ) : (
              <>
                Remembered your password?{" "}
                <Link
                  className="font-semibold text-indigo-600"
                  href="/login"
                >
                  Back to sign in
                </Link>
              </>
            )}
          </p>
        </section>

        <p className="mt-6 text-center text-xs text-slate-400">
          Secure form creation and response management
        </p>
      </div>
    </main>
  );
}
