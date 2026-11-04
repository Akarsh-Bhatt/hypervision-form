"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global application error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-900 font-sans p-6">
        <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
          <h2 className="text-xl font-bold text-slate-900 mb-2">Something went wrong!</h2>
          <p className="text-sm text-slate-600 mb-6">
            {error.message || "A critical error occurred while loading the application."}
          </p>
          <button
            onClick={() => reset()}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}

