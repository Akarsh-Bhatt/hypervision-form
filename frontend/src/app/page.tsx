"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  CheckCircle2,
  FileText,
  ArrowRight,
  Database,
  Server,
  Layout,
  LogIn,
  UserPlus,
  Loader2,
  Sparkles,
} from "lucide-react";

export default function Home() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user) {
          setIsAuthenticated(true);
          setUserEmail(session.user.email || null);
        } else {
          setIsAuthenticated(false);
        }
      } catch {
        setIsAuthenticated(false);
      }
    }
    checkAuth();
  }, []);

  function handleGoToDashboard() {
    setNavigating(true);
    const destination = isAuthenticated ? "/dashboard" : "/login?next=/dashboard";
    router.push(destination);

    // Guaranteed fallback to prevent any stuck client-side link navigation
    setTimeout(() => {
      if (typeof window !== "undefined") {
        window.location.href = destination;
      }
    }, 250);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-6 sm:p-12 md:p-20 max-w-6xl mx-auto">
      {/* Top Header Navbar */}
      <header className="z-10 w-full flex items-center justify-between font-mono text-sm border-b border-slate-200 pb-6">
        <Link href="/" className="flex items-center gap-2.5 font-bold text-slate-800 text-base">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-500/20">
            <FileText className="w-5 h-5" />
          </div>
          <span>
            Hypervision <span className="text-blue-600 font-extrabold">Form</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-block text-xs font-sans text-slate-500 font-medium">
                {userEmail}
              </span>
              <button
                onClick={handleGoToDashboard}
                disabled={navigating}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-sans text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition shadow-sm"
              >
                {navigating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ArrowRight className="w-3.5 h-3.5" />
                )}
                <span>Dashboard</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 font-sans">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition shadow-sm shadow-blue-500/20"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Get Started</span>
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <div className="my-16 text-center max-w-3xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/60 mb-6 shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          <span>High-Performance Forms Platform</span>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-slate-900 mb-6 leading-[1.12]">
          Form Creation & Response Management
        </h1>
        <p className="text-base sm:text-lg text-slate-600 mb-8 leading-relaxed max-w-2xl mx-auto">
          Central platform for composing dynamic forms, sharing public response links, and inspecting
          collected data in real-time. Built with Next.js, FastAPI, and Supabase.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3.5">
          <button
            onClick={handleGoToDashboard}
            disabled={navigating}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.98] transition-all shadow-md shadow-blue-600/20 cursor-pointer disabled:opacity-75"
          >
            {navigating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Opening Dashboard...</span>
              </>
            ) : (
              <>
                <span>Go to Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <a
            href="http://localhost:8000/api/v1/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 active:scale-[0.98] transition-all shadow-sm"
          >
            <span>API Documentation</span>
          </a>
        </div>
      </div>

      {/* Feature Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-left">
        <div className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
            <Layout className="w-5 h-5" />
          </div>
          <h2 className="text-base font-bold text-slate-900 mb-2">Next.js & Tailwind</h2>
          <p className="text-xs sm:text-sm text-slate-600 mb-4 leading-relaxed">
            Interactive drag-and-drop builder with responsive public responder screens.
          </p>
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>App Router & Client SSR Configured</span>
          </div>
        </div>

        <div className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
            <Server className="w-5 h-5" />
          </div>
          <h2 className="text-base font-bold text-slate-900 mb-2">Python & FastAPI</h2>
          <p className="text-xs sm:text-sm text-slate-600 mb-4 leading-relaxed">
            High performance asynchronous validation, submission ingestion, and streaming export pipelines.
          </p>
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Pydantic Models & ASGI Ready</span>
          </div>
        </div>

        <div className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
            <Database className="w-5 h-5" />
          </div>
          <h2 className="text-base font-bold text-slate-900 mb-2">Supabase Platform</h2>
          <p className="text-xs sm:text-sm text-slate-600 mb-4 leading-relaxed">
            PostgreSQL relational schemas with JSONB flexibility, Row-Level Security, and Auth.
          </p>
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>SQL Migrations & RLS Policies Ready</span>
          </div>
        </div>
      </div>
    </main>
  );
}
