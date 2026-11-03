"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type QuestionType =
  | "short_text"
  | "long_text"
  | "multiple_choice"
  | "checkboxes"
  | "dropdown"
  | "number"
  | "date"
  | "time"
  | "linear_scale";

type Question = {
  id: string;
  form_id: string;
  label: string;
  description: string;
  question_type: QuestionType;
  is_required: boolean;
  order_index: number;
  options: { label: string; value: string }[];
  validation_rules: Record<string, unknown>;
};

const questionTypes: { value: QuestionType; label: string }[] = [
  { value: "short_text", label: "Short answer" },
  { value: "long_text", label: "Paragraph" },
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "checkboxes", label: "Checkboxes" },
  { value: "dropdown", label: "Dropdown" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "time", label: "Time" },
  { value: "linear_scale", label: "Linear scale" },
];

const choiceTypes: QuestionType[] = [
  "multiple_choice",
  "checkboxes",
  "dropdown",
];

const createQuestion = (formId: string, index: number): Question => ({
  id: crypto.randomUUID(),
  form_id: formId,
  label: "Untitled question",
  description: "",
  question_type: "short_text",
  is_required: false,
  order_index: index,
  options: [
    { label: "Option 1", value: "Option 1" },
    { label: "Option 2", value: "Option 2" },
  ],
  validation_rules: {},
});

export default function FormEditorPage() {
  const params = useParams();
  const router = useRouter();
  const formId = String(params.id);
  const supabase = createClient();

  const [title, setTitle] = useState("Untitled Form");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [confirmationMessage, setConfirmationMessage] = useState(
    "Your response has been recorded."
  );
  const [primaryColor, setPrimaryColor] = useState("#6366f1");
  const [backgroundColor, setBackgroundColor] = useState("#f5f5f5");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [notice, setNotice] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [originalIds, setOriginalIds] = useState<string[]>([]);
  const [status, setStatus] = useState("draft");

  useEffect(() => {
    loadForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId]);

  async function loadForm() {
    setLoading(true);
    setNotice("");

    const { data: form, error: formError } = await supabase
      .from("forms")
      .select("*")
      .eq("id", formId)
      .single();

    if (formError || !form) {
      setNotice("Unable to load this form. Please check your access.");
      setLoading(false);
      return;
    }

    setTitle(form.title || "Untitled Form");
    setDescription(form.description || "");
    setStatus(form.status || "draft");

    const settings = form.settings || {};
    setConfirmationMessage(
      settings.confirmation_message || "Your response has been recorded."
    );

    const theme = form.theme || {};
    setPrimaryColor(theme.primary_color || "#6366f1");
    setBackgroundColor(theme.background_color || "#f5f5f5");

    const { data: questionData, error: questionError } = await supabase
      .from("form_questions")
      .select("*")
      .eq("form_id", formId)
      .order("order_index", { ascending: true });

    if (questionError) {
      setNotice("Unable to load questions.");
      setLoading(false);
      return;
    }

    const loadedQuestions = (questionData || []).map((q: any) => ({
      ...q,
      description: q.description || "",
      options: Array.isArray(q.options) ? q.options : [],
      validation_rules: q.validation_rules || {},
    })) as Question[];

    setQuestions(loadedQuestions);
    setOriginalIds(loadedQuestions.map((q) => q.id));
    setLoading(false);
  }

  function updateQuestion(id: string, changes: Partial<Question>) {
    setQuestions((current) =>
      current.map((q) => (q.id === id ? { ...q, ...changes } : q))
    );
  }

  function addQuestion() {
    const question = createQuestion(formId, questions.length);
    setQuestions((current) => [...current, question]);
    setSelectedId(question.id);
    setPreview(false);
  }

  function deleteQuestion(id: string) {
    setQuestions((current) =>
      current
        .filter((q) => q.id !== id)
        .map((q, index) => ({ ...q, order_index: index }))
    );
    setSelectedId(null);
  }

  function duplicateQuestion(id: string) {
    const original = questions.find((q) => q.id === id);
    if (!original) return;

    const copy = {
      ...original,
      id: crypto.randomUUID(),
      label: `${original.label} (Copy)`,
      options: [...original.options],
      order_index: questions.length,
    };

    setQuestions((current) => [...current, copy]);
    setSelectedId(copy.id);
  }

  function moveQuestion(id: string, direction: number) {
    const index = questions.findIndex((q) => q.id === id);
    const target = index + direction;

    if (target < 0 || target >= questions.length) return;

    const updated = [...questions];
    [updated[index], updated[target]] = [updated[target], updated[index]];

    setQuestions(
      updated.map((q, i) => ({ ...q, order_index: i }))
    );
  }

  function addOption(id: string) {
    const question = questions.find((q) => q.id === id);
    if (!question) return;

    updateQuestion(id, {
      options: [
        ...question.options,
        {
          label: `Option ${question.options.length + 1}`,
          value: `Option ${question.options.length + 1}`,
        },
      ],
    });
  }

  function updateOption(id: string, index: number, value: string) {
    const question = questions.find((q) => q.id === id);
    if (!question) return;

    const options = [...question.options];
    options[index] = { label: value, value };

    updateQuestion(id, { options });
  }

  function removeOption(id: string, index: number) {
    const question = questions.find((q) => q.id === id);
    if (!question) return;

    updateQuestion(id, {
      options: question.options.filter((_, i) => i !== index),
    });
  }

  async function saveForm(publish = false) {
    setSaving(true);
    setNotice("");
    setShareUrl("");

    if (!title.trim()) {
      setNotice("Please enter a form title.");
      setSaving(false);
      return;
    }

    if (publish && questions.length === 0) {
      setNotice("Add at least one question before publishing.");
      setSaving(false);
      return;
    }

    const { data: existingForm, error: fetchError } = await supabase
      .from("forms")
      .select("shareable_slug")
      .eq("id", formId)
      .single();

    if (fetchError || !existingForm) {
      setNotice("Could not find this form.");
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("forms")
      .update({
        title: title.trim(),
        description: description.trim(),
        status: publish ? "published" : status,
        settings: {
          confirmation_message: confirmationMessage,
        },
        theme: {
          primary_color: primaryColor,
          background_color: backgroundColor,
        },
      })
      .eq("id", formId);

    if (updateError) {
      setNotice(updateError.message);
      setSaving(false);
      return;
    }

    const rows = questions.map((q, index) => ({
      id: q.id,
      form_id: formId,
      label: q.label,
      description: q.description,
      question_type: q.question_type,
      is_required: q.is_required,
      order_index: index,
      options: q.options,
      validation_rules: q.validation_rules,
    }));

    if (rows.length > 0) {
      const { error: questionError } = await supabase
        .from("form_questions")
        .upsert(rows, { onConflict: "id" });

      if (questionError) {
        setNotice(`Form details saved, but questions could not be saved: ${questionError.message}`);
        setSaving(false);
        return;
      }
    }

    const deletedIds = originalIds.filter(
      (id) => !questions.some((q) => q.id === id)
    );

    if (deletedIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("form_questions")
        .delete()
        .in("id", deletedIds);

      if (deleteError) {
        setNotice(`Some deleted questions could not be removed: ${deleteError.message}`);
        setSaving(false);
        return;
      }
    }

    setOriginalIds(questions.map((q) => q.id));
    if (publish) setStatus("published");

    const slug = existingForm.shareable_slug;

    if (publish && slug) {
      setShareUrl(`${window.location.origin}/register/${slug}`);
      setNotice("Your form has been published successfully!");
    } else {
      setNotice("Your form has been saved successfully!");
    }

    setSaving(false);
  }

  const selectedQuestion = questions.find((q) => q.id === selectedId);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        Loading form editor...
      </main>
    );
  }

  if (notice.startsWith("Unable to load this form")) {
    return (
      <main className="min-h-screen p-8">
        <p>{notice}</p>
        <button onClick={() => router.push("/dashboard")}>
          Back to dashboard
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 text-gray-900">
      <header className="sticky top-0 z-20 border-b bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-100"
          >
            ← Dashboard
          </button>
          <div>
            <p className="font-semibold">Form Builder</p>
            <p className="text-xs text-gray-500">
              Status: {status}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setPreview(!preview)}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-100"
          >
            {preview ? "Edit Form" : "Preview"}
          </button>

          <button
            onClick={() => saveForm(false)}
            disabled={saving}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-100 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>

          <button
            onClick={() => saveForm(true)}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Publish
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl p-4 md:p-8">
        {notice && (
          <div className="mb-5 rounded-lg border bg-white p-4 text-sm">
            {notice}
            {shareUrl && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  className="min-w-0 flex-1 rounded-lg border p-2"
                />
                <button
                  onClick={() => navigator.clipboard.writeText(shareUrl)}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-white"
                >
                  Copy link
                </button>
              </div>
            )}
          </div>
        )}

        {!preview ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <section className="space-y-5">
              <div className="rounded-xl border-t-4 bg-white p-6 shadow-sm" style={{ borderTopColor: primaryColor }}>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Form title"
                  className="w-full border-b py-3 text-2xl font-semibold outline-none focus:border-indigo-500"
                />

                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Form description"
                  rows={2}
                  className="mt-4 w-full resize-none border-b py-2 outline-none focus:border-indigo-500"
                />
              </div>

              {questions.map((q, index) => (
                <div
                  key={q.id}
                  onClick={() => setSelectedId(q.id)}
                  className={`cursor-pointer rounded-xl border bg-white p-5 shadow-sm ${
                    selectedId === q.id
                      ? "border-indigo-500 ring-2 ring-indigo-100"
                      : "border-gray-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="mb-2 text-xs text-gray-500">
                        Question {index + 1}
                      </p>
                      <h3 className="font-medium">{q.label}</h3>
                      {q.description && (
                        <p className="mt-1 text-sm text-gray-500">
                          {q.description}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-1">
                      <button
                        title="Move up"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveQuestion(q.id, -1);
                        }}
                        className="rounded p-2 hover:bg-gray-100"
                      >
                        ↑
                      </button>
                      <button
                        title="Move down"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveQuestion(q.id, 1);
                        }}
                        className="rounded p-2 hover:bg-gray-100"
                      >
                        ↓
                      </button>
                      <button
                        title="Duplicate"
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateQuestion(q.id);
                        }}
                        className="rounded p-2 hover:bg-gray-100"
                      >
                        ⧉
                      </button>
                      <button
                        title="Delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteQuestion(q.id);
                        }}
                        className="rounded p-2 text-red-600 hover:bg-red-50"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div className="mt-4">
                    {choiceTypes.includes(q.question_type) ? (
                      <div className="space-y-2">
                        {q.options.map((option, i) => (
                          <p key={i} className="text-sm text-gray-600">
                            {q.question_type === "checkboxes" ? "□" : "○"}{" "}
                            {option.label}
                          </p>
                        ))}
                      </div>
                    ) : q.question_type === "long_text" ? (
                      <div className="h-12 rounded border-b border-gray-300" />
                    ) : (
                      <div className="max-w-sm border-b border-gray-300 py-3 text-sm text-gray-400">
                        Your answer
                      </div>
                    )}
                  </div>

                  {q.is_required && (
                    <p className="mt-3 text-xs text-red-500">Required</p>
                  )}
                </div>
              ))}

              <button
                onClick={addQuestion}
                className="w-full rounded-xl border-2 border-dashed border-gray-300 bg-white p-5 text-indigo-600 hover:border-indigo-400"
              >
                + Add Question
              </button>
            </section>

            <aside className="h-fit space-y-5 rounded-xl border bg-white p-5 shadow-sm">
              <h2 className="font-semibold">Question Settings</h2>

              {selectedQuestion ? (
                <div className="space-y-4">
                  <label className="block text-sm font-medium">
                    Question
                    <input
                      value={selectedQuestion.label}
                      onChange={(e) =>
                        updateQuestion(selectedQuestion.id, {
                          label: e.target.value,
                        })
                      }
                      className="mt-1 w-full rounded-lg border p-2 font-normal"
                    />
                  </label>

                  <label className="block text-sm font-medium">
                    Description
                    <textarea
                      value={selectedQuestion.description}
                      onChange={(e) =>
                        updateQuestion(selectedQuestion.id, {
                          description: e.target.value,
                        })
                      }
                      className="mt-1 w-full rounded-lg border p-2 font-normal"
                      rows={2}
                    />
                  </label>

                  <label className="block text-sm font-medium">
                    Question type
                    <select
                      value={selectedQuestion.question_type}
                      onChange={(e) =>
                        updateQuestion(selectedQuestion.id, {
                          question_type: e.target.value as QuestionType,
                        })
                      }
                      className="mt-1 w-full rounded-lg border p-2 font-normal"
                    >
                      {questionTypes.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {choiceTypes.includes(selectedQuestion.question_type) && (
                    <div>
                      <p className="mb-2 text-sm font-medium">Options</p>
                      <div className="space-y-2">
                        {selectedQuestion.options.map((option, index) => (
                          <div key={index} className="flex gap-2">
                            <input
                              value={option.label}
                              onChange={(e) =>
                                updateOption(
                                  selectedQuestion.id,
                                  index,
                                  e.target.value
                                )
                              }
                              className="min-w-0 flex-1 rounded-lg border p-2 text-sm"
                            />
                            <button
                              onClick={() =>
                                removeOption(selectedQuestion.id, index)
                              }
                              className="px-2 text-red-500"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => addOption(selectedQuestion.id)}
                        className="mt-3 text-sm text-indigo-600"
                      >
                        + Add option
                      </button>
                    </div>
                  )}

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedQuestion.is_required}
                      onChange={(e) =>
                        updateQuestion(selectedQuestion.id, {
                          is_required: e.target.checked,
                        })
                      }
                    />
                    Required question
                  </label>

                  <button
                    onClick={() => duplicateQuestion(selectedQuestion.id)}
                    className="w-full rounded-lg border p-2 text-sm hover:bg-gray-50"
                  >
                    Duplicate question
                  </button>

                  <button
                    onClick={() => deleteQuestion(selectedQuestion.id)}
                    className="w-full rounded-lg border border-red-200 p-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    Delete question
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  Select a question to edit its settings.
                </p>
              )}

              <hr />

              <h2 className="font-semibold">Form Theme</h2>

              <label className="block text-sm">
                Primary colour
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="mt-2 h-10 w-full cursor-pointer"
                />
              </label>

              <label className="block text-sm">
                Background colour
                <input
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="mt-2 h-10 w-full cursor-pointer"
                />
              </label>

              <hr />

              <h2 className="font-semibold">Confirmation Message</h2>
              <textarea
                value={confirmationMessage}
                onChange={(e) => setConfirmationMessage(e.target.value)}
                rows={3}
                className="w-full rounded-lg border p-2 text-sm"
              />
            </aside>
          </div>
        ) : (
          <section
            className="mx-auto max-w-2xl space-y-5 rounded-xl p-5 md:p-8"
            style={{ backgroundColor }}
          >
            <div
              className="rounded-xl border-t-4 bg-white p-6 shadow-sm"
              style={{ borderTopColor: primaryColor }}
            >
              <h1 className="text-2xl font-bold">{title}</h1>
              <p className="mt-2 text-sm text-gray-600">{description}</p>
              <p className="mt-4 text-sm text-gray-500">
                * Required questions
              </p>
            </div>

            <div className="rounded-xl bg-white p-5 shadow-sm">
              <label className="font-medium">
                SAP ID *
                <input
                  disabled
                  placeholder="Your SAP ID"
                  className="mt-3 w-full rounded-lg border p-3"
                />
              </label>
            </div>

            {questions.map((q, index) => (
              <div key={q.id} className="rounded-xl bg-white p-5 shadow-sm">
                <label className="font-medium">
                  {index + 1}. {q.label}
                  {q.is_required && (
                    <span className="ml-1 text-red-500">*</span>
                  )}
                </label>

                {q.description && (
                  <p className="mt-1 text-sm text-gray-500">
                    {q.description}
                  </p>
                )}

                {choiceTypes.includes(q.question_type) ? (
                  <div className="mt-4 space-y-3">
                    {q.options.map((option, i) => (
                      <label key={i} className="flex items-center gap-2 text-sm">
                        <input
                          disabled
                          type={
                            q.question_type === "checkboxes"
                              ? "checkbox"
                              : "radio"
                          }
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                ) : q.question_type === "long_text" ? (
                  <textarea
                    disabled
                    placeholder="Your answer"
                    className="mt-4 w-full rounded-lg border p-3"
                  />
                ) : (
                  <input
                    disabled
                    type={
                      ["short_text", "number", "date", "time"].includes(
                        q.question_type
                      )
                        ? q.question_type === "short_text"
                          ? "text"
                          : q.question_type
                        : "text"
                    }
                    placeholder="Your answer"
                    className="mt-4 w-full rounded-lg border p-3"
                  />
                )}
              </div>
            ))}

            <p className="text-center text-sm text-gray-500">
              {confirmationMessage}
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
