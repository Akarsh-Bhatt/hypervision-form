"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  Users,
  Clock,
  Loader2,
  FileText,
  Download,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  ListOrdered,
  User,
  Table as TableIcon,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  ExternalLink,
  Printer,
  Calendar,
  Sparkles,
} from "lucide-react";

type Question = {
  id: string;
  label: string;
  question_type: string;
  order_index: number;
  options?: { id?: string; label: string; value: string }[];
  validation_rules?: Record<string, unknown>;
};

type Answer = {
  response_id: string;
  question_id: string;
  answer_value: string | number | boolean | string[] | Record<string, unknown> | null;
};

type ResponseItem = {
  id: string;
  sap_id: string;
  submitted_at: string;
  completion_time_seconds: number | null;
  answers: Answer[];
};

type FormData = {
  id: string;
  title: string;
  description: string;
  status: "published" | "draft" | "closed";
  response_count: number;
  shareable_slug?: string;
};

type QuestionSummary = {
  question_id: string;
  label: string;
  question_type: string;
  total_answers: number;
  options_distribution?: { label: string; count: number; percentage: number }[];
  rating_stats?: {
    average: number | null;
    min: number | null;
    max: number | null;
    distribution: { score: number; count: number; percentage: number }[];
  };
  text_responses?: { response: string }[];
  files?: { url: string; file_name: string; file_size?: number }[];
};

type SummaryData = {
  total_responses: number;
  average_completion_time_seconds: number | null;
  timeline: { date: string; count: number }[];
  question_summaries: QuestionSummary[];
};

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

type ActiveTab = "summary" | "question" | "individual" | "spreadsheet";

export default function ResponsesPage() {
  const params = useParams();
  const router = useRouter();
  const formId = params.id as string;

  const [form, setForm] = useState<FormData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [responses, setResponses] = useState<ResponseItem[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>("summary");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Controls State
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deletingResponseId, setDeletingResponseId] = useState<string | null>(null);

  // Question Tab State
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);

  // Individual Tab State
  const [selectedResponseIndex, setSelectedResponseIndex] = useState(0);

  // Spreadsheet Tab State
  const [tableSearch, setTableSearch] = useState("");
  const [tableSortColumn, setTableSortColumn] = useState<string>("submitted_at");
  const [tableSortDirection, setTableSortDirection] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  async function getAuthToken(): Promise<string> {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      throw new Error("Please sign in again to access responses.");
    }
    return data.session.access_token;
  }

  async function loadAllData() {
    try {
      setLoading(true);
      setError("");

      const token = await getAuthToken();

      // 1. Fetch raw responses & questions
      const respRes = await fetch(`${API_URL}/api/v1/forms/${formId}/responses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const respResult = await respRes.json();
      if (!respRes.ok) throw new Error(respResult.detail || "Unable to load responses.");

      setForm(respResult.form);
      setQuestions(respResult.questions || []);
      setResponses(respResult.responses || []);

      // 2. Fetch analytical summary
      const sumRes = await fetch(`${API_URL}/api/v1/forms/${formId}/responses/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const sumResult = await sumRes.json();
      if (sumRes.ok) {
        setSummaryData({
          total_responses: sumResult.total_responses,
          average_completion_time_seconds: sumResult.average_completion_time_seconds,
          timeline: sumResult.timeline || [],
          question_summaries: sumResult.question_summaries || [],
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load responses.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (formId) loadAllData();
  }, [formId]);

  // Supabase Realtime Subscription for Live Incoming Submissions
  useEffect(() => {
    if (!formId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`realtime-responses-${formId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'form_responses',
          filter: `form_id=eq.${formId}`,
        },
        () => {
          setNotice('New response received in real time!');
          loadAllData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [formId]);

  // Status Toggle (Accepting Responses)
  async function handleToggleStatus() {
    if (!form || togglingStatus) return;
    try {
      setTogglingStatus(true);
      const token = await getAuthToken();
      const res = await fetch(`${API_URL}/api/v1/forms/${formId}/toggle-status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Unable to update status.");
      setForm((prev) => (prev ? { ...prev, status: data.status } : null));
      setNotice(data.message);
      setTimeout(() => setNotice(""), 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle status.");
    } finally {
      setTogglingStatus(false);
    }
  }

  // Delete Single Response
  async function handleDeleteResponse(responseId: string) {
    if (!window.confirm("Are you sure you want to delete this response? This cannot be undone.")) return;
    try {
      setDeletingResponseId(responseId);
      const token = await getAuthToken();
      const res = await fetch(`${API_URL}/api/v1/forms/${formId}/responses/${responseId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Unable to delete response.");

      setResponses((prev) => prev.filter((r) => r.id !== responseId));
      if (form) {
        setForm({ ...form, response_count: Math.max(0, form.response_count - 1) });
      }
      setNotice("Response deleted.");
      setTimeout(() => setNotice(""), 3000);
      loadAllData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete response.");
    } finally {
      setDeletingResponseId(null);
    }
  }

  // Delete All Responses
  async function handleDeleteAllResponses() {
    try {
      setIsDeletingAll(true);
      const token = await getAuthToken();
      const res = await fetch(`${API_URL}/api/v1/forms/${formId}/responses`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Unable to delete all responses.");

      setShowDeleteAllModal(false);
      setResponses([]);
      if (form) setForm({ ...form, response_count: 0 });
      setNotice("All responses have been reset.");
      setTimeout(() => setNotice(""), 3500);
      loadAllData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset responses.");
    } finally {
      setIsDeletingAll(false);
    }
  }

  // Exports Triggers
  async function triggerExport(type: "csv" | "xlsx") {
    try {
      const token = await getAuthToken();
      const url = `${API_URL}/api/v1/forms/${formId}/export/${type}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export failed.");

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `${form?.shareable_slug || formId}_responses.${type}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export data.");
    }
  }

  // Filtered & Sorted Table Rows for Spreadsheet View
  const filteredAndSortedRows = useMemo(() => {
    let result = [...responses];

    if (tableSearch.trim()) {
      const query = tableSearch.toLowerCase();
      result = result.filter((r) => {
        if (r.sap_id.toLowerCase().includes(query)) return true;
        return r.answers.some((a) => {
          const val = a.answer_value;
          if (val === null || val === undefined) return false;
          if (typeof val === "object") return JSON.stringify(val).toLowerCase().includes(query);
          return String(val).toLowerCase().includes(query);
        });
      });
    }

    result.sort((a, b) => {
      let valA: string | number = a.submitted_at;
      let valB: string | number = b.submitted_at;

      if (tableSortColumn === "sap_id") {
        valA = a.sap_id;
        valB = b.sap_id;
      } else if (tableSortColumn !== "submitted_at") {
        const ansA = a.answers.find((ans) => ans.question_id === tableSortColumn)?.answer_value;
        const ansB = b.answers.find((ans) => ans.question_id === tableSortColumn)?.answer_value;
        valA = ansA ? String(ansA) : "";
        valB = ansB ? String(ansB) : "";
      }

      if (valA < valB) return tableSortDirection === "asc" ? -1 : 1;
      if (valA > valB) return tableSortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [responses, tableSearch, tableSortColumn, tableSortDirection]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredAndSortedRows.slice(start, start + rowsPerPage);
  }, [filteredAndSortedRows, currentPage]);

  const totalPages = Math.ceil(filteredAndSortedRows.length / rowsPerPage) || 1;

  function renderAnswerCell(val: unknown) {
    if (val === undefined || val === null || val === "") {
      return <span className="text-slate-300 italic">—</span>;
    }
    if (typeof val === "object" && val !== null && "url" in val) {
      const file = val as { url: string; file_name?: string };
      return (
        <a
          href={file.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline font-medium"
        >
          <span>{file.file_name || "Attachment"}</span>
          <ExternalLink size={11} />
        </a>
      );
    }
    if (Array.isArray(val)) {
      return (
        <div className="flex flex-wrap gap-1">
          {val.map((item, idx) => (
            <span key={idx} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
              {String(item)}
            </span>
          ))}
        </div>
      );
    }
    return <span className="text-xs text-slate-800 line-clamp-2">{String(val)}</span>;
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={32} className="animate-spin text-indigo-600 mx-auto mb-3" />
          <p className="text-xs font-semibold text-slate-500">Loading responses & analytics...</p>
        </div>
      </main>
    );
  }

  const currentIndividualResponse = responses[selectedResponseIndex];
  const selectedQuestion = questions[selectedQuestionIndex];

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Top Header & Action Controls Bar */}
      <header className="border-b bg-white sticky top-0 z-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-8 py-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
              title="Back to Dashboard"
            >
              <ArrowLeft size={16} />
            </Link>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900 leading-tight truncate max-w-sm sm:max-w-md">
                  {form?.title || "Form Responses"}
                </h1>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold border ${
                    form?.status === "published"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-slate-100 text-slate-600 border-slate-200"
                  }`}
                >
                  {form?.status === "published" ? "Accepting responses" : "Closed"}
                </span>
                <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Sync
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {responses.length} total {responses.length === 1 ? "submission" : "submissions"}
              </p>
            </div>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {/* Accepting Responses Toggle */}
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-1.5">
              <span className="text-xs font-semibold text-slate-700">Accepting</span>
              <button
                type="button"
                onClick={handleToggleStatus}
                disabled={togglingStatus}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  form?.status === "published" ? "bg-emerald-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    form?.status === "published" ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Export Buttons */}
            <button
              onClick={() => triggerExport("csv")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-sm"
              title="Download CSV export"
            >
              <Download size={13} />
              <span>CSV</span>
            </button>

            <button
              onClick={() => triggerExport("xlsx")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition shadow-sm"
              title="Download Excel spreadsheet"
            >
              <FileSpreadsheet size={13} />
              <span>Excel</span>
            </button>

            {/* Delete All Danger Button */}
            {responses.length > 0 && (
              <button
                onClick={() => setShowDeleteAllModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
                title="Reset / delete all responses"
              >
                <Trash2 size={13} />
                <span className="hidden sm:inline">Delete all</span>
              </button>
            )}
          </div>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="mx-auto max-w-7xl px-4 sm:px-8 flex gap-6 border-t">
          <button
            onClick={() => setActiveTab("summary")}
            className={`flex items-center gap-2 py-3 text-xs font-semibold border-b-2 transition ${
              activeTab === "summary"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <BarChart3 size={15} />
            <span>Summary</span>
          </button>

          <button
            onClick={() => setActiveTab("question")}
            className={`flex items-center gap-2 py-3 text-xs font-semibold border-b-2 transition ${
              activeTab === "question"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <ListOrdered size={15} />
            <span>Question</span>
          </button>

          <button
            onClick={() => setActiveTab("individual")}
            className={`flex items-center gap-2 py-3 text-xs font-semibold border-b-2 transition ${
              activeTab === "individual"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <User size={15} />
            <span>Individual</span>
          </button>

          <button
            onClick={() => setActiveTab("spreadsheet")}
            className={`flex items-center gap-2 py-3 text-xs font-semibold border-b-2 transition ${
              activeTab === "spreadsheet"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <TableIcon size={15} />
            <span>Spreadsheet</span>
          </button>
        </div>
      </header>

      {/* Notice & Error Banners */}
      <div className="mx-auto max-w-7xl px-4 sm:px-8 mt-4">
        {notice && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>{notice}</span>
          </div>
        )}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-8 py-6">
        {/* Zero Responses Empty State */}
        {responses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <Users size={28} />
            </div>
            <h2 className="text-base font-bold text-slate-900">Waiting for responses</h2>
            <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
              Share your public form link with respondents to begin collecting and analyzing responses.
            </p>
            {form?.shareable_slug && (
              <div className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2 text-xs font-mono text-slate-600">
                <span>/f/{form.shareable_slug}</span>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* ================================================================ */}
            {/* TAB 1: SUMMARY (Visual Analytics & Charts) */}
            {/* ================================================================ */}
            {activeTab === "summary" && (
              <div className="space-y-6">
                {/* Metric Cards Row */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Total Responses
                    </span>
                    <p className="mt-2 text-3xl font-extrabold text-slate-900">
                      {summaryData?.total_responses ?? responses.length}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Average Completion Time
                    </span>
                    <p className="mt-2 text-3xl font-extrabold text-slate-900">
                      {summaryData?.average_completion_time_seconds
                        ? `${Math.floor(summaryData.average_completion_time_seconds / 60)}m ${Math.round(
                            summaryData.average_completion_time_seconds % 60
                          )}s`
                        : "—"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Form Status
                    </span>
                    <p className="mt-2 text-xl font-bold capitalize text-slate-900 flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          form?.status === "published" ? "bg-emerald-500" : "bg-slate-400"
                        }`}
                      />
                      {form?.status}
                    </p>
                  </div>
                </div>

                {/* Question Analytics Cards */}
                <div className="space-y-5">
                  {(summaryData?.question_summaries || []).map((qs, idx) => (
                    <div
                      key={qs.question_id}
                      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                    >
                      <div className="mb-4 flex items-start justify-between border-b pb-3">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">
                            {idx + 1}. {qs.label}
                          </h3>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {qs.total_answers} {qs.total_answers === 1 ? "response" : "responses"} ·{" "}
                            <span className="capitalize">{qs.question_type.replace("_", " ")}</span>
                          </p>
                        </div>
                      </div>

                      {/* Choice & Checkbox Distribution Chart */}
                      {qs.options_distribution && (
                        <div className="space-y-3">
                          {qs.options_distribution.map((opt, oIdx) => (
                            <div key={oIdx} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-medium text-slate-700">{opt.label}</span>
                                <span className="text-slate-500">
                                  {opt.count} ({opt.percentage}%)
                                </span>
                              </div>
                              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full bg-indigo-600 transition-all duration-300"
                                  style={{ width: `${Math.min(100, Math.max(2, opt.percentage))}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Rating Scale Breakdown */}
                      {qs.rating_stats && (
                        <div>
                          {qs.rating_stats.average !== null && (
                            <div className="mb-4 inline-flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-1.5 text-xs font-bold text-amber-900">
                              <Sparkles size={14} className="text-amber-500" />
                              <span>Average Rating: {qs.rating_stats.average} / 5.0</span>
                            </div>
                          )}

                          <div className="grid grid-cols-5 gap-2">
                            {qs.rating_stats.distribution.map((dist) => (
                              <div key={dist.score} className="text-center">
                                <div className="h-24 w-full bg-slate-100 rounded-xl flex items-end p-1">
                                  <div
                                    className="w-full bg-indigo-600 rounded-lg transition-all"
                                    style={{ height: `${dist.percentage}%` }}
                                  />
                                </div>
                                <p className="mt-1.5 text-xs font-bold text-slate-800">{dist.score}</p>
                                <p className="text-[11px] text-slate-400">{dist.count} votes</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Text Answers Card List */}
                      {qs.text_responses && (
                        <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                          {qs.text_responses.map((txt, tIdx) => (
                            <div
                              key={tIdx}
                              className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs text-slate-800"
                            >
                              {txt.response}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* File Uploads List */}
                      {qs.files && (
                        <div className="space-y-2">
                          {qs.files.map((f, fIdx) => (
                            <div
                              key={fIdx}
                              className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs"
                            >
                              <span className="font-semibold text-slate-800 truncate max-w-sm">
                                {f.file_name}
                              </span>
                              <a
                                href={f.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline"
                              >
                                <span>Download</span>
                                <ExternalLink size={12} />
                              </a>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ================================================================ */}
            {/* TAB 2: QUESTION (Question-by-Question Deep Dive) */}
            {/* ================================================================ */}
            {activeTab === "question" && (
              <div className="space-y-6">
                {/* Question Selector Bar */}
                <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <button
                    onClick={() => setSelectedQuestionIndex((prev) => Math.max(0, prev - 1))}
                    disabled={selectedQuestionIndex === 0}
                    className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  <div className="text-center">
                    <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">
                      Question {selectedQuestionIndex + 1} of {questions.length}
                    </p>
                    <h3 className="mt-0.5 text-sm font-bold text-slate-900">
                      {selectedQuestion?.label}
                    </h3>
                  </div>

                  <button
                    onClick={() =>
                      setSelectedQuestionIndex((prev) => Math.min(questions.length - 1, prev + 1))
                    }
                    disabled={selectedQuestionIndex === questions.length - 1}
                    className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                {/* All Answers for this Specific Question */}
                <div className="space-y-3">
                  {responses.map((resp, idx) => {
                    const ans = resp.answers.find((a) => a.question_id === selectedQuestion?.id);
                    return (
                      <div
                        key={resp.id}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex items-start justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <p className="text-[11px] font-mono text-slate-400">
                            Response #{idx + 1} · {resp.sap_id} ·{" "}
                            {new Date(resp.submitted_at).toLocaleDateString()}
                          </p>
                          <div>{renderAnswerCell(ans?.answer_value)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ================================================================ */}
            {/* TAB 3: INDIVIDUAL (Step-Through Response Inspector) */}
            {/* ================================================================ */}
            {activeTab === "individual" && currentIndividualResponse && (
              <div className="space-y-6">
                {/* Individual Stepper Bar */}
                <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedResponseIndex((prev) => Math.max(0, prev - 1))}
                      disabled={selectedResponseIndex === 0}
                      className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-xs font-bold text-slate-800">
                      {selectedResponseIndex + 1} of {responses.length}
                    </span>
                    <button
                      onClick={() =>
                        setSelectedResponseIndex((prev) => Math.min(responses.length - 1, prev + 1))
                      }
                      disabled={selectedResponseIndex === responses.length - 1}
                      className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => window.print()}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Printer size={13} />
                      <span>Print</span>
                    </button>
                    <button
                      onClick={() => handleDeleteResponse(currentIndividualResponse.id)}
                      disabled={deletingResponseId === currentIndividualResponse.id}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                    >
                      <Trash2 size={13} />
                      <span>Delete response</span>
                    </button>
                  </div>
                </div>

                {/* Response Metadata Card */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-500">Respondent Identifier</span>
                    <span className="font-mono font-bold text-slate-900">
                      {currentIndividualResponse.sap_id}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-500">Submitted At</span>
                    <span className="text-slate-800">
                      {new Date(currentIndividualResponse.submitted_at).toLocaleString()}
                    </span>
                  </div>
                  {currentIndividualResponse.completion_time_seconds && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-500">Time Taken</span>
                      <span className="text-slate-800">
                        {Math.floor(currentIndividualResponse.completion_time_seconds / 60)}m{" "}
                        {currentIndividualResponse.completion_time_seconds % 60}s
                      </span>
                    </div>
                  )}
                </div>

                {/* Form Questions with Exact Answer */}
                <div className="space-y-4">
                  {questions.map((q, qIdx) => {
                    const ans = currentIndividualResponse.answers.find(
                      (a) => a.question_id === q.id
                    );
                    return (
                      <div
                        key={q.id}
                        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                      >
                        <h4 className="text-xs font-bold text-slate-500 mb-2">
                          {qIdx + 1}. {q.label}
                        </h4>
                        <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
                          {renderAnswerCell(ans?.answer_value)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ================================================================ */}
            {/* TAB 4: SPREADSHEET (Interactive Data Grid) */}
            {/* ================================================================ */}
            {activeTab === "spreadsheet" && (
              <div className="space-y-4">
                {/* Search & Sort Bar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="relative w-full sm:w-80">
                    <Search size={15} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={tableSearch}
                      onChange={(e) => {
                        setTableSearch(e.target.value);
                        setCurrentPage(1);
                      }}
                      placeholder="Search submissions..."
                      className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-4 text-xs outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600/20"
                    />
                  </div>

                  <div className="text-xs text-slate-500">
                    Showing {paginatedRows.length} of {filteredAndSortedRows.length} rows
                  </div>
                </div>

                {/* Virtualized / Scrollable Spreadsheet Table */}
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="sticky left-0 bg-slate-50 z-10 px-4 py-3 border-r">
                          Respondent
                        </th>
                        <th
                          onClick={() => {
                            setTableSortColumn("submitted_at");
                            setTableSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
                          }}
                          className="px-4 py-3 cursor-pointer hover:bg-slate-100 border-r whitespace-nowrap"
                        >
                          Submitted At {tableSortColumn === "submitted_at" && (tableSortDirection === "asc" ? "▲" : "▼")}
                        </th>
                        {questions.map((q) => (
                          <th
                            key={q.id}
                            onClick={() => {
                              setTableSortColumn(q.id);
                              setTableSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
                            }}
                            className="px-4 py-3 cursor-pointer hover:bg-slate-100 border-r whitespace-nowrap max-w-xs truncate"
                            title={q.label}
                          >
                            {q.label} {tableSortColumn === q.id && (tableSortDirection === "asc" ? "▲" : "▼")}
                          </th>
                        ))}
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {paginatedRows.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/60 transition">
                          <td className="sticky left-0 bg-white font-mono font-semibold text-slate-900 px-4 py-3 border-r whitespace-nowrap">
                            {row.sap_id}
                          </td>
                          <td className="px-4 py-3 border-r text-slate-500 whitespace-nowrap">
                            {new Date(row.submitted_at).toLocaleString()}
                          </td>
                          {questions.map((q) => {
                            const ans = row.answers.find((a) => a.question_id === q.id);
                            return (
                              <td key={q.id} className="px-4 py-3 border-r max-w-xs">
                                {renderAnswerCell(ans?.answer_value)}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <button
                              onClick={() => handleDeleteResponse(row.id)}
                              disabled={deletingResponseId === row.id}
                              className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 transition"
                              title="Delete row"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Table Pagination Controls */}
                <div className="flex items-center justify-between bg-white p-3.5 rounded-2xl border border-slate-200 text-xs text-slate-600 shadow-sm">
                  <span>
                    Page {currentPage} of {totalPages}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="rounded-lg border px-2.5 py-1 disabled:opacity-40 hover:bg-slate-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="rounded-lg border px-2.5 py-1 disabled:opacity-40 hover:bg-slate-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete All Confirmation Modal */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <AlertCircle size={22} />
              <h3 className="text-base font-bold text-slate-900">Delete all responses?</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              This will permanently delete all {responses.length} submissions and answers associated with this form. This action cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowDeleteAllModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAllResponses}
                disabled={isDeletingAll}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {isDeletingAll ? "Deleting..." : "Yes, delete all"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
