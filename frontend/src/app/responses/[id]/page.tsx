
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  Users,
  CalendarDays,
  Clock,
  Loader2,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

type Question = {
  id: string;
  label: string;
  question_type: string;
  order_index: number;
};

type Answer = {
  response_id: string;
  question_id: string;
  answer_value: string | number | boolean | string[] | Record<string, unknown> | null;
};

type Registration = {
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
  status: string;
  response_count: number;
};

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

export default function ResponsesPage() {
  const params = useParams();
  const router = useRouter();
  const formId = params.id as string;

  const [form, setForm] = useState<FormData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [responses, setResponses] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function loadResponses() {
      try {
        setLoading(true);
        setError("");

        if (!API_URL) {
          throw new Error("Backend URL is not configured.");
        }

        const supabase = createClient();
        const { data, error: sessionError } =
          await supabase.auth.getSession();

        if (sessionError || !data.session) {
          throw new Error("Please log in again to view responses.");
        }

        const token = data.session.access_token;

        const response = await fetch(
          `${API_URL}/api/v1/forms/${formId}/responses`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.detail || "Unable to load responses."
          );
        }

        setForm(result.form);
        setQuestions(result.questions || []);
        setResponses(result.responses || []);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong."
        );
      } finally {
        setLoading(false);
      }
    }

    if (formId) {
      loadResponses();
    }
  }, [formId]);

  function formatDate(date: string) {
    if (!date) return "Not available";

    return new Date(date).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  function formatAnswer(value: Answer["answer_value"]) {
    if (value === null || value === undefined || value === "") {
      return "No answer provided";
    }

    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }

    if (typeof value === "object") {
      return Array.isArray(value)
        ? value.join(", ")
        : JSON.stringify(value);
    }

    return String(value);
  }

  function formatDuration(seconds: number | null) {
    if (seconds === null || seconds === undefined) {
      return "Not available";
    }

    if (seconds < 60) {
      return `${seconds} seconds`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${minutes} min ${remainingSeconds} sec`;
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b bg-white px-6 py-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Hypervision
            </h1>
            <p className="text-sm text-slate-500">
              Registration Responses
            </p>
          </div>

          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Dashboard
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl p-6 sm:p-8">
        <button
          onClick={() => router.push("/dashboard")}
          className="mb-6 flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          <ArrowLeft size={16} />
          Back to Events
        </button>

        {loading ? (
          <div className="flex justify-center rounded-2xl bg-white p-20">
            <Loader2
              className="animate-spin text-indigo-600"
              size={32}
            />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
            <h2 className="font-semibold">
              Unable to load responses
            </h2>
            <p className="mt-2 text-sm">{error}</p>

            <button
              onClick={() => router.push("/dashboard")}
              className="mt-4 rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700"
            >
              Return to Dashboard
            </button>
          </div>
        ) : (
          <>
            <div className="mb-8 rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <p className="text-sm font-semibold text-indigo-600">
                    EVENT RESPONSES
                  </p>

                  <h2 className="mt-2 text-2xl font-bold text-slate-900">
                    {form?.title || "Event"}
                  </h2>

                  <p className="mt-2 text-sm text-slate-500">
                    {form?.description || "Registration details"}
                  </p>
                </div>

                <span className="w-fit rounded-full bg-indigo-50 px-4 py-2 text-sm font-semibold capitalize text-indigo-700">
                  {form?.status}
                </span>
              </div>

              <div className="mt-6 grid gap-4 border-t pt-5 sm:grid-cols-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600">
                    <Users size={20} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-900">
                      {responses.length}
                    </p>
                    <p className="text-sm text-slate-500">
                      Total Registrations
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
                    <FileText size={20} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-900">
                      {questions.length}
                    </p>
                    <p className="text-sm text-slate-500">
                      Form Questions
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-green-50 p-3 text-green-600">
                    <CalendarDays size={20} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-900">
                      {form?.response_count ?? responses.length}
                    </p>
                    <p className="text-sm text-slate-500">
                      Recorded Responses
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Student Registrations
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  View SAP IDs and submitted answers.
                </p>
              </div>
            </div>

            {responses.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-white px-5 py-16 text-center">
                <Users
                  className="mx-auto mb-4 text-indigo-500"
                  size={38}
                />

                <h3 className="text-lg font-semibold text-slate-900">
                  No registrations yet
                </h3>

                <p className="mt-2 text-sm text-slate-500">
                  Student registrations will appear here once someone submits the form.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {responses.map((registration, index) => {
                  const isExpanded =
                    expandedId === registration.id;

                  return (
                    <article
                      key={registration.id}
                      className="overflow-hidden rounded-2xl border bg-white shadow-sm"
                    >
                      <button
                        onClick={() =>
                          setExpandedId(
                            isExpanded ? null : registration.id
                          )
                        }
                        className="flex w-full flex-col justify-between gap-4 p-5 text-left sm:flex-row sm:items-center"
                      >
                        <div>
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-sm font-bold text-indigo-700">
                              {index + 1}
                            </span>

                            <div>
                              <h3 className="font-bold text-slate-900">
                                SAP ID: {registration.sap_id}
                              </h3>

                              <p className="mt-1 text-xs text-slate-500">
                                Submitted {formatDate(registration.submitted_at)}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-4 sm:justify-end">
                          <span className="flex items-center gap-2 text-sm text-slate-500">
                            <Clock size={15} />
                            {formatDuration(
                              registration.completion_time_seconds
                            )}
                          </span>

                          {isExpanded ? (
                            <ChevronUp
                              className="text-slate-500"
                              size={20}
                            />
                          ) : (
                            <ChevronDown
                              className="text-slate-500"
                              size={20}
                            />
                          )}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t bg-slate-50 p-5">
                          <h4 className="mb-4 font-semibold text-slate-900">
                            Submitted Answers
                          </h4>

                          {questions.length === 0 ? (
                            <p className="text-sm text-slate-500">
                              No questions found for this form.
                            </p>
                          ) : (
                            <div className="space-y-4">
                              {questions.map((question, questionIndex) => {
                                const answer = registration.answers.find(
                                  (item) =>
                                    item.question_id === question.id
                                );

                                return (
                                  <div
                                    key={question.id}
                                    className="rounded-xl border bg-white p-4"
                                  >
                                    <p className="text-sm font-medium text-slate-500">
                                      Question {questionIndex + 1}
                                    </p>

                                    <p className="mt-1 font-semibold text-slate-900">
                                      {question.label}
                                    </p>

                                    <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-700">
                                      {formatAnswer(
                                        answer?.answer_value ?? null
                                      )}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
