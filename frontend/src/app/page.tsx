import Link from "next/link";
import { CheckCircle2, FileText, ArrowRight, Database, Server, Layout } from "lucide-react";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-6 sm:p-12 md:p-24 max-w-6xl mx-auto">
      <div className="z-10 w-full flex items-center justify-between font-mono text-sm border-b border-slate-200 pb-6">
        <div className="flex items-center gap-2 font-bold text-slate-800 text-base">
          <FileText className="w-5 h-5 text-blue-600" />
          <span>Hypervision Form</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
            Phase 1 Initialized
          </span>
        </div>
      </div>

      <div className="my-16 text-center max-w-3xl">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-slate-900 mb-6">
          Form Creation & Response Management
        </h1>
        <p className="text-lg text-slate-600 mb-8 leading-relaxed">
          Central platform for composing dynamic forms, sharing public response links, and inspecting collected data in real-time. Built with Next.js, FastAPI, and Supabase.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm"
          >
            <span>Go to Dashboard</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="http://localhost:8000/api/v1/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <span>API Documentation</span>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-left">
        <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
            <Layout className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Next.js & Tailwind</h2>
          <p className="text-sm text-slate-600 mb-4">
            Interactive drag-and-drop builder with responsive public responder screens.
          </p>
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
            <CheckCircle2 className="w-4 h-4" />
            <span>App Router & Client SSR Configured</span>
          </div>
        </div>

        <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
            <Server className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Python & FastAPI</h2>
          <p className="text-sm text-slate-600 mb-4">
            High performance asynchronous validation, submission ingestion, and streaming export pipelines.
          </p>
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
            <CheckCircle2 className="w-4 h-4" />
            <span>Pydantic Models & ASGI Ready</span>
          </div>
        </div>

        <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
            <Database className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Supabase Platform</h2>
          <p className="text-sm text-slate-600 mb-4">
            PostgreSQL relational schemas with JSONB flexibility, Row-Level Security, and Auth.
          </p>
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
            <CheckCircle2 className="w-4 h-4" />
            <span>SQL Migrations & RLS Policies Ready</span>
          </div>
        </div>
      </div>
    </main>
  );
}
