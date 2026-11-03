
"use client";

import { useEffect, useState, FormEvent } from "react";
import { useParams } from "next/navigation";

type Question = {
  id: string;
  field_key: string;
  question_type: string;
  label: string;
  description: string;
  is_required: boolean;
  options: { id?: string; label: string; value: string }[];
  validation_rules: Record<string, unknown>;
};

type FormData = {
  id: string;
  title: string;
  description: string;
  settings: {
    confirmation_message?: string;
  };
  theme: {
    primary_color?: string;
    background_color?: string;
  };
};

type AnswerValue = string | string[] | number;

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

export default function RegistrationPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [form, setForm] = useState<FormData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sapId, setSapId] = useState("");
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function loadForm() {
      try {
        if (!API_URL) {
          throw new Error("Registration service is not configured.");
        }

        const response = await fetch(
          `${API_URL}/api/v1/forms/public/${encodeURIComponent(slug)}`
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.detail || "This form is unavailable.");
        }

        setForm(result.form);
        setQuestions(result.questions || []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unable to load this form."
        );
      } finally {
        setLoading(false);
      }
    }

    if (slug) loadForm();
  }, [slug]);

  function updateAnswer(questionId: string, value: AnswerValue) {
    setAnswers(previous => ({
      ...previous,
      [questionId]: value,
    }));
  }

  function toggleCheckbox(questionId: string, value: string) {
    const current = Array.isArray(answers[questionId])
      ? (answers[questionId] as string[])
      : [];

    const updated = current.includes(value)
      ? current.filter(item => item !== value)
      : [...current, value];

    updateAnswer(questionId, updated);
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!sapId.trim()) {
      setError("Please enter your SAP ID.");
      return;
    }

    const missingQuestion = questions.find(question => {
      if (!question.is_required) return false;

      const value = answers[question.id];

      return (
        value === undefined ||
        value === "" ||
        (Array.isArray(value) && value.length === 0)
      );
    });

    if (missingQuestion) {
      setError(`Please answer: ${missingQuestion.label}`);
      return;
    }

    try {
      setSubmitting(true);

      if (!API_URL) {
        throw new Error("Registration service is not configured.");
      }

      const answerList = Object.entries(answers)
        .filter(([, value]) => {
          return value !== "" &&
            (!Array.isArray(value) || value.length > 0);
        })
        .map(([questionId, answerValue]) => ({
          question_id: questionId,
          answer_value: answerValue,
        }));

      const response = await fetch(
        `${API_URL}/api/v1/forms/public/${encodeURIComponent(slug)}/submit`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sap_id: sapId.trim(),
            answers: answerList,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "Registration failed.");
      }

      setSuccess(
        form?.settings?.confirmation_message ||
        "Your registration has been submitted successfully."
      );
      setSapId("");
      setAnswers({});
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to submit registration."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function renderQuestion(question: Question) {
    const value = answers[question.id] ?? "";
    const inputClass =
      "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-indigo-500";

    switch (question.question_type) {
      case "short_text":
      case "number":
      case "date":
      case "time":
        return (
          <input
            className={inputClass}
            type={
              question.question_type === "short_text"
                ? "text"
                : question.question_type
            }
            required={question.is_required}
            value={String(value)}
            onChange={e =>
              updateAnswer(
                question.id,
                question.question_type === "number"
                  ? Number(e.target.value)
                  : e.target.value
              )
            }
          />
        );

      case "long_text":
        return (
          <textarea
            className={inputClass}
            rows={4}
            required={question.is_required}
            value={String(value)}
            onChange={e => updateAnswer(question.id, e.target.value)}
          />
        );

      case "multiple_choice":
        return (
          <div className="mt-3 space-y-3">
            {question.options?.map((option, index) => (
              <label key={option.id || index} className="flex items-center gap-3 text-sm">
                <input
                  type="radio"
                  name={question.id}
                  value={option.value}
                  checked={value === option.value}
                  required={question.is_required}
                  onChange={() => updateAnswer(question.id, option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        );

      case "checkboxes":
        return (
          <div className="mt-3 space-y-3">
            {question.options?.map((option, index) => (
              <label key={option.id || index} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={
                    Array.isArray(value) && value.includes(option.value)
                  }
                  onChange={() => toggleCheckbox(question.id, option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        );

      case "dropdown":
        return (
          <select
            className={inputClass}
            required={question.is_required}
            value={String(value)}
            onChange={e => updateAnswer(question.id, e.target.value)}
          >
            <option value="">Select an option</option>
            {question.options?.map((option, index) => (
              <option key={option.id || index} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case "linear_scale":
        return (
          <select
            className={inputClass}
            required={question.is_required}
            value={String(value)}
            onChange={e => updateAnswer(question.id, Number(e.target.value))}
          >
            <option value="">Choose a rating</option>
            {Array.from({ length: 11 }, (_, index) => index).map(number => (
              <option key={number} value={number}>
                {number}
              </option>
            ))}
          </select>
        );

      case "file_upload":
        return (
          <p className="mt-2 text-sm text-amber-700">
            File uploads will be available after secure storage is configured.
          </p>
        );

      default:
        return (
          <p className="mt-2 text-sm text-slate-500">
            This question type is not supported yet.
          </p>
        );
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-600">Loading registration form...</p>
      </main>
    );
  }

  if (!form) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">
            Form unavailable
          </h1>
          <p className="mt-2 text-sm text-red-600">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen px-4 py-10 sm:px-6"
      style={{ backgroundColor: form.theme?.background_color || "#F8FAFC" }}
    >
      <div className="mx-auto max-w-2xl">
        <header
          className="rounded-2xl border-t-8 bg-white p-7 shadow-sm"
          style={{ borderTopColor: form.theme?.primary_color || "#4F46E5" }}
        >
          <h1 className="text-2xl font-bold text-slate-900">
            {form.title}
          </h1>
          {form.description && (
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {form.description}
            </p>
          )}
          <p className="mt-5 text-xs text-slate-500">
            * Required questions
          </p>
        </header>

        {success ? (
          <div className="mt-5 rounded-2xl border border-green-200 bg-white p-8 text-center shadow-sm">
            <h2 className="text-xl font-bold text-green-700">
              Registration successful!
            </h2>
            <p className="mt-3 text-sm text-slate-600">{success}</p>
          </div>
        ) : (
          <form onSubmit={submitForm} className="mt-5 space-y-4">
            <section className="rounded-2xl bg-white p-6 shadow-sm">
              <label className="block text-sm font-semibold text-slate-800">
                SAP ID <span className="text-red-500">*</span>
              </label>
              <input
                className={inputClass}
                value={sapId}
                onChange={e => setSapId(e.target.value)}
                placeholder="Enter your SAP ID"
                required
                maxLength={100}
              />
            </section>

            {questions.map((question, index) => (
              <section
                key={question.id}
                className="rounded-2xl bg-white p-6 shadow-sm"
              >
                <label className="block text-sm font-semibold text-slate-800">
                  {index + 1}. {question.label}
                  {question.is_required && (
                    <span className="ml-1 text-red-500">*</span>
                  )}
                </label>

                {question.description && (
                  <p className="mt-2 text-xs text-slate-500">
                    {question.description}
                  </p>
                )}

                {renderQuestion(question)}
              </section>
            ))}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {submitting ? "Submitting..." : "Submit Registration"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-slate-500">
          Powered by Hypervision
        </p>
      </div>
    </main>
  );
}

const inputClass =
  "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-indigo-500";
