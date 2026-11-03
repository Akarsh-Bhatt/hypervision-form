"use client";

import { useState, useRef, FormEvent, DragEvent, ChangeEvent } from "react";
import {
  CheckCircle2,
  AlertCircle,
  UploadCloud,
  File,
  X,
  Loader2,
  Calendar,
  Lock,
  Clock,
  ArrowRight,
  RotateCcw,
} from "lucide-react";

export type QuestionOption = {
  id?: string;
  label: string;
  value: string;
};

export type QuestionRules = {
  min_length?: number;
  max_length?: number;
  min_select?: number;
  max_select?: number;
  min_value?: number;
  max_value?: number;
  allowed_file_types?: string[];
  max_file_size_mb?: number;
  low_label?: string;
  high_label?: string;
};

export type PublicQuestion = {
  id: string;
  field_key: string;
  question_type: string;
  label: string;
  description?: string;
  order_index: number;
  is_required: boolean;
  options?: QuestionOption[];
  validation_rules?: QuestionRules;
};

export type PublicFormTheme = {
  primary_color?: string;
  background_color?: string;
  header_image_url?: string | null;
  font_family?: string;
};

export type PublicFormSettings = {
  confirmation_message?: string;
  allow_multiple_responses?: boolean;
  closing_date?: string | null;
  response_limit?: number | null;
};

export type PublicFormData = {
  id: string;
  title: string;
  description: string;
  status: "draft" | "published" | "closed";
  settings?: PublicFormSettings;
  theme?: PublicFormTheme;
  shareable_slug: string;
  response_count?: number;
};

export type PublicFormLifecycle = {
  is_open: boolean;
  reason: "draft" | "closed" | "expired" | "quota_reached" | null;
  message?: string;
};

type FileUploadValue = {
  url: string;
  file_name: string;
  file_size: number;
};

type AnswerState = Record<string, string | string[] | number | FileUploadValue>;

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

interface PublicFormViewerProps {
  form: PublicFormData;
  questions: PublicQuestion[];
  lifecycle?: PublicFormLifecycle;
  slug: string;
}

export default function PublicFormViewer({
  form,
  questions,
  lifecycle = { is_open: true, reason: null },
  slug,
}: PublicFormViewerProps) {
  const [answers, setAnswers] = useState<AnswerState>({});
  const [respondentId, setRespondentId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState("");

  const startTimeRef = useRef<number>(Date.now());
  const questionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const primaryColor = form.theme?.primary_color || "#4F46E5";
  const bgColor = form.theme?.background_color || "#F8FAFC";

  // 1. GATEKEEPING SCREENS (Closed, Draft, Quota, Expired)
  if (!lifecycle.is_open) {
    let icon = <Lock size={40} className="text-amber-500" />;
    let title = "Form is currently closed";
    let message =
      lifecycle.message ||
      "This form is not accepting responses at this time.";

    if (lifecycle.reason === "draft") {
      title = "Form Not Yet Published";
      message = "This form is in draft mode and is not yet available to the public.";
    } else if (lifecycle.reason === "quota_reached") {
      title = "Response Limit Reached";
      message = "This form has received the maximum allowed number of submissions.";
    } else if (lifecycle.reason === "expired") {
      icon = <Clock size={40} className="text-amber-500" />;
      title = "Submission Deadline Passed";
      message = "The closing date for this form has passed.";
    }

    return (
      <main
        className="min-h-screen px-4 py-12 flex items-center justify-center"
        style={{ backgroundColor: bgColor }}
      >
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
            {icon}
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="mt-3 text-sm text-slate-600 leading-relaxed">
            {message}
          </p>
          <div className="mt-8 border-t pt-6">
            <p className="text-xs text-slate-400">
              Powered by <span className="font-semibold text-slate-700">Hypervision Form</span>
            </p>
          </div>
        </div>
      </main>
    );
  }

  // 2. COMPLETION / SUCCESS SCREEN
  if (submitted) {
    const confirmationMsg =
      form.settings?.confirmation_message ||
      "Your response has been recorded. Thank you for your submission!";
    const allowMultiple = form.settings?.allow_multiple_responses;

    return (
      <main
        className="min-h-screen px-4 py-12 flex items-center justify-center"
        style={{ backgroundColor: bgColor }}
      >
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl animate-in fade-in zoom-in-95 duration-200">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 size={36} />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            {form.title}
          </h1>
          <p className="mt-4 text-sm text-slate-600 leading-relaxed whitespace-pre-line">
            {confirmationMsg}
          </p>

          {receiptId && (
            <div className="mt-6 inline-block rounded-xl bg-slate-50 border border-slate-200 px-4 py-2 text-xs text-slate-500 font-mono">
              Receipt ID: {receiptId}
            </div>
          )}

          {allowMultiple && (
            <div className="mt-8 border-t pt-6">
              <button
                onClick={() => {
                  setAnswers({});
                  setRespondentId("");
                  setErrors({});
                  setSubmitted(false);
                  setReceiptId(null);
                  startTimeRef.current = Date.now();
                }}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90"
                style={{ backgroundColor: primaryColor }}
              >
                <RotateCcw size={14} />
                <span>Submit another response</span>
              </button>
            </div>
          )}

          <div className="mt-8 text-xs text-slate-400">
            Hypervision Form Submission Engine
          </div>
        </div>
      </main>
    );
  }

  // 3. VALIDATION HELPER
  function validateQuestion(q: PublicQuestion, value: unknown): string | null {
    if (q.is_required) {
      if (
        value === undefined ||
        value === null ||
        value === "" ||
        (Array.isArray(value) && value.length === 0)
      ) {
        return "This question is required.";
      }
    }

    if (value !== undefined && value !== null && value !== "") {
      const rules = q.validation_rules || {};

      // Text bounds
      if (typeof value === "string") {
        if (rules.min_length && value.length < rules.min_length) {
          return `Please enter at least ${rules.min_length} characters.`;
        }
        if (rules.max_length && value.length > rules.max_length) {
          return `Please enter at most ${rules.max_length} characters.`;
        }
      }

      // Checkbox counts
      if (Array.isArray(value)) {
        if (rules.min_select && value.length < rules.min_select) {
          return `Please select at least ${rules.min_select} options.`;
        }
        if (rules.max_select && value.length > rules.max_select) {
          return `Please select at most ${rules.max_select} options.`;
        }
      }
    }

    return null;
  }

  function handleBlur(q: PublicQuestion) {
    const error = validateQuestion(q, answers[q.id]);
    setErrors((prev) => {
      const next = { ...prev };
      if (error) {
        next[q.id] = error;
      } else {
        delete next[q.id];
      }
      return next;
    });
  }

  function updateAnswer(qId: string, val: string | string[] | number | FileUploadValue) {
    setAnswers((prev) => ({ ...prev, [qId]: val }));
    setErrors((prev) => {
      if (prev[qId]) {
        const next = { ...prev };
        delete next[qId];
        return next;
      }
      return prev;
    });
  }

  function toggleCheckbox(qId: string, optionVal: string) {
    const current = Array.isArray(answers[qId])
      ? (answers[qId] as string[])
      : [];
    const next = current.includes(optionVal)
      ? current.filter((v) => v !== optionVal)
      : [...current, optionVal];
    updateAnswer(qId, next);
  }

  // 4. SECURE FILE UPLOAD PIPELINE
  async function handleFileUpload(qId: string, file: File) {
    const maxMb = 10;
    if (file.size > maxMb * 1024 * 1024) {
      setErrors((prev) => ({
        ...prev,
        [qId]: `File size exceeds the ${maxMb}MB limit.`,
      }));
      return;
    }

    try {
      setUploadingField(qId);
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy[qId];
        return copy;
      });

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${BACKEND_URL}/api/v1/forms/public/${slug}/upload`, {
        method: "POST",
        body: formData,
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.detail || "File upload failed.");
      }

      updateAnswer(qId, {
        url: result.file_url,
        file_name: result.file_name || file.name,
        file_size: result.file_size || file.size,
      });
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [qId]: err instanceof Error ? err.message : "Unable to upload file.",
      }));
    } finally {
      setUploadingField(null);
    }
  }

  // 5. FORM SUBMISSION HANDLER
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setGeneralError("");

    const newErrors: Record<string, string> = {};
    let firstInvalidId: string | null = null;

    for (const q of questions) {
      const err = validateQuestion(q, answers[q.id]);
      if (err) {
        newErrors[q.id] = err;
        if (!firstInvalidId) firstInvalidId = q.id;
      }
    }

    if (firstInvalidId) {
      setErrors(newErrors);
      // Auto-scroll smoothly to first failing question
      const targetElement = questionRefs.current[firstInvalidId];
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    try {
      setSubmitting(true);
      const completionSeconds = Math.round(
        (Date.now() - startTimeRef.current) / 1000
      );

      const formattedAnswers = Object.entries(answers)
        .filter(([, val]) => val !== undefined && val !== null && val !== "")
        .map(([qId, val]) => ({
          question_id: qId,
          answer_value: val,
        }));

      const payload = {
        respondent_identifier: respondentId.trim() || undefined,
        completion_time_seconds: completionSeconds,
        answers: formattedAnswers,
      };

      const res = await fetch(`${BACKEND_URL}/api/v1/forms/public/${slug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.detail || "Submission failed.");
      }

      setReceiptId(result.response_id || null);
      setSubmitted(true);
    } catch (err) {
      setGeneralError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      className="min-h-screen px-4 py-8 sm:py-12"
      style={{ backgroundColor: bgColor }}
    >
      <div className="mx-auto max-w-2xl">
        {/* Top Header Card */}
        <div
          className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          style={{ borderTop: `6px solid ${primaryColor}` }}
        >
          {form.theme?.header_image_url && (
            <div className="h-40 w-full overflow-hidden bg-slate-100">
              <img
                src={form.theme.header_image_url}
                alt={form.title}
                className="h-full w-full object-cover"
              />
            </div>
          )}

          <div className="p-6 sm:p-8">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight">
              {form.title}
            </h1>

            {form.description && (
              <p className="mt-3 text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                {form.description}
              </p>
            )}

            <div className="mt-5 border-t pt-4 flex items-center justify-between text-xs text-slate-500">
              <span className="text-rose-600 font-medium">
                * Indicates required question
              </span>
              <span>{questions.length} questions</span>
            </div>
          </div>
        </div>

        {generalError && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 animate-in fade-in duration-150">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <span>{generalError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {/* Optional Respondent Identifier Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <label className="block text-sm font-semibold text-slate-900 mb-1">
              Your Name or Identifier{" "}
              <span className="text-xs font-normal text-slate-400">
                (Optional)
              </span>
            </label>
            <p className="text-xs text-slate-500 mb-3">
              Enter your name, email, or respondent identifier if required by the organizer.
            </p>
            <input
              type="text"
              value={respondentId}
              onChange={(e) => setRespondentId(e.target.value)}
              placeholder="e.g., Alex Johnson (alex@example.com)"
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/15"
            />
          </div>

          {/* Render All 8 Questions */}
          {questions.map((q, idx) => {
            const error = errors[q.id];
            const currentVal = answers[q.id];

            return (
              <div
                key={q.id}
                ref={(el) => {
                  questionRefs.current[q.id] = el;
                }}
                className={`rounded-2xl border bg-white p-6 shadow-sm transition-all duration-150 ${
                  error
                    ? "border-rose-400 ring-2 ring-rose-400/20"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="mb-4">
                  <div className="flex items-start justify-between gap-3">
                    <label className="block text-base font-semibold text-slate-900 leading-snug">
                      <span className="text-slate-400 mr-1.5 font-normal">
                        {idx + 1}.
                      </span>
                      {q.label}
                      {q.is_required && (
                        <span className="ml-1 text-rose-600">*</span>
                      )}
                    </label>
                  </div>

                  {q.description && (
                    <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                      {q.description}
                    </p>
                  )}
                </div>

                {/* Question Type: Short Text */}
                {q.question_type === "short_text" && (
                  <input
                    type="text"
                    value={(currentVal as string) || ""}
                    onChange={(e) => updateAnswer(q.id, e.target.value)}
                    onBlur={() => handleBlur(q)}
                    placeholder="Your answer"
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/15"
                  />
                )}

                {/* Question Type: Long Text */}
                {q.question_type === "long_text" && (
                  <textarea
                    rows={4}
                    value={(currentVal as string) || ""}
                    onChange={(e) => updateAnswer(q.id, e.target.value)}
                    onBlur={() => handleBlur(q)}
                    placeholder="Type your response here..."
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/15"
                  />
                )}

                {/* Question Type: Multiple Choice */}
                {q.question_type === "multiple_choice" && (
                  <div className="space-y-2.5">
                    {(q.options || []).map((opt, oIdx) => {
                      const isSelected = currentVal === opt.value;
                      return (
                        <label
                          key={opt.id || oIdx}
                          className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm cursor-pointer transition ${
                            isSelected
                              ? "border-indigo-600 bg-indigo-50/40 text-indigo-950 font-medium"
                              : "border-slate-200 hover:bg-slate-50 text-slate-700"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`q_${q.id}`}
                            value={opt.value}
                            checked={isSelected}
                            onChange={() => updateAnswer(q.id, opt.value)}
                            onBlur={() => handleBlur(q)}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                          <span>{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* Question Type: Checkboxes */}
                {q.question_type === "checkboxes" && (
                  <div className="space-y-2.5">
                    {(q.options || []).map((opt, oIdx) => {
                      const arr = Array.isArray(currentVal)
                        ? (currentVal as string[])
                        : [];
                      const isChecked = arr.includes(opt.value);
                      return (
                        <label
                          key={opt.id || oIdx}
                          className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm cursor-pointer transition ${
                            isChecked
                              ? "border-indigo-600 bg-indigo-50/40 text-indigo-950 font-medium"
                              : "border-slate-200 hover:bg-slate-50 text-slate-700"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleCheckbox(q.id, opt.value)}
                            onBlur={() => handleBlur(q)}
                            className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                          <span>{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* Question Type: Dropdown */}
                {q.question_type === "dropdown" && (
                  <select
                    value={(currentVal as string) || ""}
                    onChange={(e) => updateAnswer(q.id, e.target.value)}
                    onBlur={() => handleBlur(q)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/15 cursor-pointer"
                  >
                    <option value="">Select an option...</option>
                    {(q.options || []).map((opt, oIdx) => (
                      <option key={opt.id || oIdx} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}

                {/* Question Type: Linear Scale / Rating */}
                {(q.question_type === "linear_scale" ||
                  q.question_type === "rating") && (
                  <div>
                    <div className="flex items-center justify-between gap-2 py-2">
                      {[1, 2, 3, 4, 5].map((score) => {
                        const isSelected = currentVal === score;
                        return (
                          <button
                            key={score}
                            type="button"
                            onClick={() => updateAnswer(q.id, score)}
                            onBlur={() => handleBlur(q)}
                            className={`flex-1 h-12 rounded-xl font-bold text-sm transition border ${
                              isSelected
                                ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                                : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            {score}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-400 px-1">
                      <span>{q.validation_rules?.low_label || "1 - Poor"}</span>
                      <span>{q.validation_rules?.high_label || "5 - Excellent"}</span>
                    </div>
                  </div>
                )}

                {/* Question Type: Date */}
                {q.question_type === "date" && (
                  <div className="relative">
                    <input
                      type="date"
                      value={(currentVal as string) || ""}
                      onChange={(e) => updateAnswer(q.id, e.target.value)}
                      onBlur={() => handleBlur(q)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/15 cursor-pointer"
                    />
                  </div>
                )}

                {/* Question Type: File Upload */}
                {q.question_type === "file_upload" && (
                  <div>
                    {uploadingField === q.id ? (
                      <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-indigo-300 bg-indigo-50/50 p-6 text-sm text-indigo-700">
                        <Loader2 size={18} className="animate-spin" />
                        <span>Uploading attachment...</span>
                      </div>
                    ) : currentVal && typeof currentVal === "object" && "url" in currentVal ? (
                      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                        <div className="flex items-center gap-2.5 truncate">
                          <File size={18} className="text-indigo-600 shrink-0" />
                          <span className="text-xs font-semibold text-slate-800 truncate">
                            {(currentVal as FileUploadValue).file_name}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            ({Math.round(((currentVal as FileUploadValue).file_size || 0) / 1024)} KB)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateAnswer(q.id, "")}
                          className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
                          title="Remove file"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ) : (
                      <div
                        onDragOver={(e: DragEvent<HTMLDivElement>) => e.preventDefault()}
                        onDrop={(e: DragEvent<HTMLDivElement>) => {
                          e.preventDefault();
                          if (e.dataTransfer.files?.[0]) {
                            handleFileUpload(q.id, e.dataTransfer.files[0]);
                          }
                        }}
                        className="rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center hover:border-indigo-400 transition cursor-pointer bg-slate-50/50"
                        onClick={() => {
                          const fileInput = document.getElementById(
                            `file-input-${q.id}`
                          ) as HTMLInputElement;
                          fileInput?.click();
                        }}
                      >
                        <UploadCloud
                          size={28}
                          className="mx-auto mb-2 text-indigo-500"
                        />
                        <p className="text-xs font-semibold text-slate-700">
                          Click to browse or drag and drop your file here
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          Max file size: 10MB
                        </p>
                        <input
                          id={`file-input-${q.id}`}
                          type="file"
                          className="hidden"
                          onChange={(e: ChangeEvent<HTMLInputElement>) => {
                            if (e.target.files?.[0]) {
                              handleFileUpload(q.id, e.target.files[0]);
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Inline Error Message */}
                {error && (
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-rose-600 font-medium">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Form Action Controls */}
          <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-6">
            <button
              type="button"
              onClick={() => {
                setAnswers({});
                setRespondentId("");
                setErrors({});
              }}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 transition"
            >
              Clear form
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-7 py-3 text-sm font-semibold text-white shadow-md transition hover:opacity-95 disabled:opacity-60"
              style={{ backgroundColor: primaryColor }}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <span>Submit</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </form>

        <p className="mt-8 text-center text-xs text-slate-400">
          Never submit passwords or sensitive credentials through Hypervision Form.
        </p>
      </div>
    </main>
  );
}

