"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  Check,
  CheckSquare,
  ChevronDown,
  Circle,
  Cloud,
  Copy,
  Eye,
  FileText,
  GripVertical,
  Loader2,
  Monitor,
  Palette,
  Plus,
  Radio,
  RotateCcw,
  Share2,
  Smartphone,
  Star,
  Tablet,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";

type QuestionType =
  | "short_text"
  | "long_text"
  | "multiple_choice"
  | "checkboxes"
  | "dropdown"
  | "linear_scale"
  | "date"
  | "file_upload";

type OptionItem = {
  id: string;
  label: string;
  value: string;
};

type Question = {
  id: string;
  field_key: string;
  label: string;
  description: string;
  question_type: QuestionType;
  is_required: boolean;
  order_index: number;
  options: OptionItem[];
  validation_rules: {
    min_length?: number;
    max_length?: number;
    scale_min?: number;
    scale_max?: number;
    min_label?: string;
    max_label?: string;
    max_file_size_mb?: number;
  };
};

const QUESTION_TYPES: { value: QuestionType; label: string; icon: typeof FileText }[] = [
  { value: "short_text", label: "Short Answer", icon: FileText },
  { value: "long_text", label: "Paragraph", icon: FileText },
  { value: "multiple_choice", label: "Multiple Choice", icon: Radio },
  { value: "checkboxes", label: "Checkboxes", icon: CheckSquare },
  { value: "dropdown", label: "Dropdown", icon: ChevronDown },
  { value: "linear_scale", label: "Linear Scale / Rating", icon: Star },
  { value: "date", label: "Date", icon: FileText },
  { value: "file_upload", label: "File Upload", icon: UploadCloud },
];

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

export default function FormEditorPage() {
  const params = useParams();
  const router = useRouter();
  const formId = String(params.id);

  // Form Metadata
  const [title, setTitle] = useState("Untitled Form");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"draft" | "published" | "closed">("draft");
  const [shareableSlug, setShareableSlug] = useState("");
  const [confirmationMessage, setConfirmationMessage] = useState("Your response has been recorded.");
  const [primaryColor, setPrimaryColor] = useState("#4f46e5");
  const [backgroundColor, setBackgroundColor] = useState("#f8fafc");

  // Questions State
  const [questions, setQuestions] = useState<Question[]>([]);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);

  // Editor UI State
  const [activeTab, setActiveTab] = useState<"questions" | "settings">("questions");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [loading, setLoading] = useState(true);
  const [previewMode, setPreviewMode] = useState(false);
  const [previewViewport, setPreviewViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, any>>({});
  const [previewSubmitted, setPreviewSubmitted] = useState(false);
  const [showThemeDrawer, setShowThemeDrawer] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
  const [errorNotice, setErrorNotice] = useState("");

  // Undo Delete Snackbar State
  const [lastDeleted, setLastDeleted] = useState<{ question: Question; index: number } | null>(null);
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Drag and Drop State
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Autosave Timer Ref
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);

  // 1. Get Auth Token
  async function getToken() {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      throw new Error("Please log in to continue.");
    }
    return data.session.access_token;
  }

  // 2. Load Form and Questions from Backend Builder API
  async function loadFormBuilder() {
    try {
      setLoading(true);
      setErrorNotice("");

      const token = await getToken();
      const res = await fetch(`${API_URL}/api/v1/forms/${formId}/builder`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error("Unable to load form. You may not have permission to edit it.");
      }

      const data = await res.json();
      const form = data.form;

      setTitle(form.title || "Untitled Form");
      setDescription(form.description || "");
      setStatus(form.status || "draft");
      setShareableSlug(form.shareable_slug || "");

      const settings = form.settings || {};
      setConfirmationMessage(settings.confirmation_message || "Your response has been recorded.");

      const theme = form.theme || {};
      setPrimaryColor(theme.primary_color || "#4f46e5");
      setBackgroundColor(theme.background_color || "#f8fafc");

      const loadedQuestions: Question[] = (data.questions || []).map((q: any, idx: number) => ({
        id: q.id || crypto.randomUUID(),
        field_key: q.field_key || `q_${idx + 1}`,
        label: q.label || "Untitled Question",
        description: q.description || "",
        question_type: (q.question_type === "rating" ? "linear_scale" : q.question_type) || "short_text",
        is_required: Boolean(q.is_required),
        order_index: idx,
        options: Array.isArray(q.options) && q.options.length > 0 ? q.options : [
          { id: "1", label: "Option 1", value: "Option 1" },
          { id: "2", label: "Option 2", value: "Option 2" },
        ],
        validation_rules: q.validation_rules || {},
      }));

      setQuestions(loadedQuestions);
      if (loadedQuestions.length > 0) {
        setActiveQuestionId(loadedQuestions[0].id);
      }
      setSaveStatus("saved");
    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : "Failed to load form.");
    } finally {
      setLoading(false);
      setTimeout(() => {
        isInitialLoadRef.current = false;
      }, 500);
    }
  }

  useEffect(() => {
    loadFormBuilder();
  }, [formId]);

  // Warn user on tab close if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveStatus === "unsaved" || saveStatus === "saving") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [saveStatus]);

  // 3. Save Form Sync Function
  const syncFormToBackend = useCallback(async (
    updatedTitle = title,
    updatedDesc = description,
    updatedQuestions = questions,
    updatedStatus = status,
    updatedConfirmation = confirmationMessage,
    updatedPrimary = primaryColor,
    updatedBg = backgroundColor,
  ) => {
    try {
      setSaveStatus("saving");
      const token = await getToken();

      const payload = {
        title: updatedTitle.trim() || "Untitled Form",
        description: updatedDesc.trim(),
        status: updatedStatus,
        settings: {
          confirmation_message: updatedConfirmation,
        },
        theme: {
          primary_color: updatedPrimary,
          background_color: updatedBg,
        },
        questions: updatedQuestions.map((q, idx) => ({
          id: q.id,
          field_key: q.field_key,
          question_type: q.question_type,
          label: q.label,
          description: q.description,
          order_index: idx,
          is_required: q.is_required,
          options: q.options,
          validation_rules: q.validation_rules,
        })),
      };

      const res = await fetch(`${API_URL}/api/v1/forms/${formId}/builder`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Failed to auto-save changes.");
      }

      setSaveStatus("saved");
    } catch {
      setSaveStatus("unsaved");
    }
  }, [formId, title, description, questions, status, confirmationMessage, primaryColor, backgroundColor]);

  // Trigger Debounced Autosave on changes
  function scheduleAutosave(newQuestions?: Question[]) {
    if (isInitialLoadRef.current) return;
    setSaveStatus("unsaved");
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = setTimeout(() => {
      syncFormToBackend(
        title,
        description,
        newQuestions || questions,
        status,
        confirmationMessage,
        primaryColor,
        backgroundColor
      );
    }, 800);
  }

  // 4. Question Mutations
  function handleAddQuestion(type: QuestionType = "multiple_choice", insertAfterId?: string) {
    const newId = crypto.randomUUID();
    const newQuestion: Question = {
      id: newId,
      field_key: `q_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      label: "Untitled Question",
      description: "",
      question_type: type,
      is_required: false,
      order_index: questions.length,
      options: [
        { id: "1", label: "Option 1", value: "Option 1" },
        { id: "2", label: "Option 2", value: "Option 2" },
      ],
      validation_rules: type === "linear_scale" ? { scale_min: 1, scale_max: 5, min_label: "Poor", max_label: "Excellent" } : {},
    };

    let updatedList: Question[] = [];
    if (insertAfterId) {
      const idx = questions.findIndex((q) => q.id === insertAfterId);
      updatedList = [
        ...questions.slice(0, idx + 1),
        newQuestion,
        ...questions.slice(idx + 1),
      ];
    } else {
      updatedList = [...questions, newQuestion];
    }

    const reindexed = updatedList.map((q, i) => ({ ...q, order_index: i }));
    setQuestions(reindexed);
    setActiveQuestionId(newId);
    scheduleAutosave(reindexed);
  }

  function handleUpdateQuestion(id: string, partial: Partial<Question>) {
    const updated = questions.map((q) => (q.id === id ? { ...q, ...partial } : q));
    setQuestions(updated);
    scheduleAutosave(updated);
  }

  function handleDeleteQuestion(id: string) {
    const targetIndex = questions.findIndex((q) => q.id === id);
    if (targetIndex === -1) return;

    const deleted = questions[targetIndex];
    setLastDeleted({ question: deleted, index: targetIndex });

    // Clear previous timer
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    undoTimeoutRef.current = setTimeout(() => {
      setLastDeleted(null);
    }, 5000);

    const updated = questions
      .filter((q) => q.id !== id)
      .map((q, i) => ({ ...q, order_index: i }));
    setQuestions(updated);
    if (activeQuestionId === id) {
      setActiveQuestionId(updated.length > 0 ? updated[Math.min(targetIndex, updated.length - 1)].id : null);
    }
    scheduleAutosave(updated);
  }

  function handleUndoDelete() {
    if (!lastDeleted) return;
    const { question, index } = lastDeleted;
    const restored = [...questions];
    restored.splice(index, 0, question);
    const reindexed = restored.map((q, i) => ({ ...q, order_index: i }));
    setQuestions(reindexed);
    setActiveQuestionId(question.id);
    setLastDeleted(null);
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    scheduleAutosave(reindexed);
  }

  function handleDuplicateQuestion(id: string) {
    const target = questions.find((q) => q.id === id);
    if (!target) return;

    const copyId = crypto.randomUUID();
    const copy: Question = {
      ...target,
      id: copyId,
      field_key: `q_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      label: `${target.label} (Copy)`,
      options: target.options.map((opt, i) => ({ ...opt, id: String(i + 1) })),
      validation_rules: { ...target.validation_rules },
    };

    const idx = questions.findIndex((q) => q.id === id);
    const updated = [
      ...questions.slice(0, idx + 1),
      copy,
      ...questions.slice(idx + 1),
    ].map((q, i) => ({ ...q, order_index: i }));

    setQuestions(updated);
    setActiveQuestionId(copyId);
    scheduleAutosave(updated);
  }

  // Option Operations
  function handleAddOption(questionId: string) {
    const q = questions.find((item) => item.id === questionId);
    if (!q) return;
    const newOptions: OptionItem[] = [
      ...q.options,
      {
        id: crypto.randomUUID(),
        label: `Option ${q.options.length + 1}`,
        value: `Option ${q.options.length + 1}`,
      },
    ];
    handleUpdateQuestion(questionId, { options: newOptions });
  }

  function handleAddOtherOption(questionId: string) {
    const q = questions.find((item) => item.id === questionId);
    if (!q) return;
    if (q.options.some((o) => o.label === "Other...")) return;
    const newOptions: OptionItem[] = [
      ...q.options,
      {
        id: crypto.randomUUID(),
        label: "Other...",
        value: "Other",
      },
    ];
    handleUpdateQuestion(questionId, { options: newOptions });
  }

  function handleUpdateOptionLabel(questionId: string, index: number, value: string) {
    const q = questions.find((item) => item.id === questionId);
    if (!q) return;
    const newOptions = [...q.options];
    newOptions[index] = { ...newOptions[index], label: value, value };
    handleUpdateQuestion(questionId, { options: newOptions });
  }

  function handleRemoveOption(questionId: string, index: number) {
    const q = questions.find((item) => item.id === questionId);
    if (!q || q.options.length <= 1) return;
    const newOptions = q.options.filter((_, i) => i !== index);
    handleUpdateQuestion(questionId, { options: newOptions });
  }

  // Drag and Drop
  function handleDragStart(index: number) {
    setDraggedIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const updated = [...questions];
    const [moved] = updated.splice(draggedIndex, 1);
    updated.splice(index, 0, moved);
    const reindexed = updated.map((q, i) => ({ ...q, order_index: i }));

    setDraggedIndex(index);
    setQuestions(reindexed);
  }

  function handleDragEnd() {
    setDraggedIndex(null);
    scheduleAutosave(questions);
  }

  // Publish / Status Toggle
  async function handleToggleStatus() {
    const newStatus = status === "published" ? "draft" : "published";
    setStatus(newStatus);
    await syncFormToBackend(
      title,
      description,
      questions,
      newStatus,
      confirmationMessage,
      primaryColor,
      backgroundColor
    );
  }

  function handleCopyShareLink() {
    const url = `${window.location.origin}/f/${shareableSlug || formId}`;
    navigator.clipboard.writeText(url);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2500);
  }

  // Interactive Preview Input Handlers
  function handlePreviewAnswerChange(questionId: string, val: any) {
    setPreviewAnswers((prev) => ({ ...prev, [questionId]: val }));
  }

  function handlePreviewCheckboxToggle(questionId: string, optionValue: string) {
    setPreviewAnswers((prev) => {
      const currentList: string[] = Array.isArray(prev[questionId]) ? prev[questionId] : [];
      const updated = currentList.includes(optionValue)
        ? currentList.filter((item) => item !== optionValue)
        : [...currentList, optionValue];
      return { ...prev, [questionId]: updated };
    });
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-indigo-600" size={36} />
          <p className="text-sm font-medium text-slate-600">Loading Form Builder...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor }}>
      {/* 1. Header Bar (Google Forms Style) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
            title="Back to Dashboard"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="flex items-center gap-2">
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                scheduleAutosave();
              }}
              placeholder="Untitled Form"
              className="max-w-[160px] sm:max-w-xs md:max-w-md truncate border-b border-transparent px-1.5 py-0.5 text-base font-bold text-slate-900 outline-none hover:border-slate-300 focus:border-indigo-600 transition"
            />
          </div>

          {/* Cloud Auto-save Status Indicator */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            {saveStatus === "saving" ? (
              <>
                <Loader2 size={13} className="animate-spin text-indigo-600" />
                <span>Saving...</span>
              </>
            ) : saveStatus === "saved" ? (
              <>
                <Cloud size={14} className="text-emerald-600" />
                <span className="text-emerald-700">All changes saved in cloud</span>
              </>
            ) : (
              <>
                <Cloud size={14} className="text-amber-500" />
                <span className="text-amber-700">Unsaved changes</span>
              </>
            )}
          </div>
        </div>

        {/* Center Navigation Tabs */}
        <div className="hidden md:flex items-center gap-1 rounded-xl bg-slate-100 p-1">
          <button
            onClick={() => {
              setActiveTab("questions");
              setPreviewMode(false);
            }}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
              activeTab === "questions" && !previewMode
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Questions
          </button>

          <button
            onClick={() => router.push(`/responses/${formId}`)}
            className="rounded-lg px-4 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition flex items-center gap-1"
          >
            <span>Responses</span>
          </button>

          <button
            onClick={() => {
              setActiveTab("settings");
              setPreviewMode(false);
            }}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
              activeTab === "settings"
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Settings
          </button>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2">
          {/* Theme Palette */}
          <button
            onClick={() => setShowThemeDrawer(!showThemeDrawer)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
            title="Customise theme"
          >
            <Palette size={17} />
          </button>

          {/* Preview Toggle */}
          <button
            onClick={() => {
              setPreviewMode(!previewMode);
              setPreviewSubmitted(false);
            }}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
              previewMode
                ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Eye size={15} />
            <span className="hidden sm:inline">{previewMode ? "Editor" : "Preview"}</span>
          </button>

          {/* Share Button */}
          <button
            onClick={handleCopyShareLink}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-sm"
            title="Copy public form link"
          >
            {copiedShare ? <Check size={14} className="text-emerald-600" /> : <Share2 size={14} />}
            <span className="hidden sm:inline">{copiedShare ? "Copied!" : "Share"}</span>
          </button>

          {/* Publish / Status Toggle */}
          <button
            onClick={handleToggleStatus}
            className={`rounded-xl px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition ${
              status === "published"
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "bg-indigo-600 hover:bg-indigo-700"
            }`}
          >
            {status === "published" ? "Published ✓" : "Publish Form"}
          </button>
        </div>
      </header>

      {/* Theme Drawer */}
      {showThemeDrawer && (
        <div className="fixed right-4 top-16 z-40 w-72 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl animate-in slide-in-from-top-3 duration-150">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Theme Options</h3>
            <button
              onClick={() => setShowThemeDrawer(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Primary Header Accent
              </label>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => {
                    setPrimaryColor(e.target.value);
                    scheduleAutosave();
                  }}
                  className="h-9 w-14 cursor-pointer rounded-lg border border-slate-200 p-0.5"
                />
                <span className="font-mono text-xs text-slate-600 uppercase">{primaryColor}</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Page Background Tint
              </label>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => {
                    setBackgroundColor(e.target.value);
                    scheduleAutosave();
                  }}
                  className="h-9 w-14 cursor-pointer rounded-lg border border-slate-200 p-0.5"
                />
                <span className="font-mono text-xs text-slate-600 uppercase">{backgroundColor}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Body */}
      {previewMode ? (
        /* LIVE INTERACTIVE PREVIEW SIMULATOR */
        <div className="flex-1 p-4 md:p-8 flex flex-col items-center">
          {/* Viewport Switcher */}
          <div className="mb-6 flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <button
              onClick={() => setPreviewViewport("desktop")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                previewViewport === "desktop"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Monitor size={14} />
              <span>Desktop</span>
            </button>
            <button
              onClick={() => setPreviewViewport("tablet")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                previewViewport === "tablet"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Tablet size={14} />
              <span>Tablet</span>
            </button>
            <button
              onClick={() => setPreviewViewport("mobile")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                previewViewport === "mobile"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Smartphone size={14} />
              <span>Mobile</span>
            </button>
          </div>

          {/* Form Frame */}
          <div
            className={`w-full transition-all duration-300 ${
              previewViewport === "mobile"
                ? "max-w-sm rounded-[36px] border-[10px] border-slate-900 bg-white p-4 shadow-2xl"
                : previewViewport === "tablet"
                ? "max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-md"
                : "max-w-2xl"
            }`}
          >
            {previewSubmitted ? (
              <div className="rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <Check size={24} />
                </div>
                <h2 className="text-xl font-bold text-slate-900">{title}</h2>
                <p className="mt-2 text-sm text-slate-600">{confirmationMessage}</p>
                <button
                  onClick={() => {
                    setPreviewSubmitted(false);
                    setPreviewAnswers({});
                  }}
                  className="mt-6 text-xs font-semibold text-indigo-600 hover:underline"
                >
                  Submit another response (Preview)
                </button>
              </div>
            ) : (
              <>
                {/* Header Hero */}
                <div
                  className="rounded-2xl border-t-[7px] bg-white p-7 shadow-sm mb-4"
                  style={{ borderTopColor: primaryColor }}
                >
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">{title || "Untitled Form"}</h1>
                  {description && <p className="mt-2 text-sm text-slate-600 leading-relaxed">{description}</p>}
                  <p className="mt-4 text-xs font-semibold text-rose-500">* Indicates required question</p>
                </div>

                {/* Questions List */}
                <div className="space-y-4">
                  {questions.map((q, idx) => (
                    <div key={q.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                      <div className="mb-3">
                        <label className="text-base font-bold text-slate-900">
                          {idx + 1}. {q.label || "Untitled Question"}
                          {q.is_required && <span className="ml-1 text-rose-500">*</span>}
                        </label>
                        {q.description && <p className="mt-1 text-xs text-slate-500">{q.description}</p>}
                      </div>

                      {/* Short Answer */}
                      {q.question_type === "short_text" && (
                        <input
                          value={previewAnswers[q.id] || ""}
                          onChange={(e) => handlePreviewAnswerChange(q.id, e.target.value)}
                          placeholder="Your answer"
                          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                        />
                      )}

                      {/* Paragraph */}
                      {q.question_type === "long_text" && (
                        <textarea
                          value={previewAnswers[q.id] || ""}
                          onChange={(e) => handlePreviewAnswerChange(q.id, e.target.value)}
                          placeholder="Your answer"
                          rows={3}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                        />
                      )}

                      {/* Multiple Choice */}
                      {q.question_type === "multiple_choice" && (
                        <div className="space-y-2.5">
                          {q.options.map((opt) => (
                            <label
                              key={opt.id}
                              className="flex items-center gap-3 text-sm text-slate-700 cursor-pointer p-1 hover:bg-slate-50 rounded-lg"
                            >
                              <input
                                type="radio"
                                name={`preview_${q.id}`}
                                checked={previewAnswers[q.id] === opt.value}
                                onChange={() => handlePreviewAnswerChange(q.id, opt.value)}
                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              />
                              <span>{opt.label}</span>
                            </label>
                          ))}
                        </div>
                      )}

                      {/* Checkboxes */}
                      {q.question_type === "checkboxes" && (
                        <div className="space-y-2.5">
                          {q.options.map((opt) => {
                            const isChecked = Array.isArray(previewAnswers[q.id]) && previewAnswers[q.id].includes(opt.value);
                            return (
                              <label
                                key={opt.id}
                                className="flex items-center gap-3 text-sm text-slate-700 cursor-pointer p-1 hover:bg-slate-50 rounded-lg"
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handlePreviewCheckboxToggle(q.id, opt.value)}
                                  className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                />
                                <span>{opt.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}

                      {/* Dropdown */}
                      {q.question_type === "dropdown" && (
                        <select
                          value={previewAnswers[q.id] || ""}
                          onChange={(e) => handlePreviewAnswerChange(q.id, e.target.value)}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-600 cursor-pointer"
                        >
                          <option value="">Choose an option</option>
                          {q.options.map((opt) => (
                            <option key={opt.id} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      )}

                      {/* Linear Scale / Rating */}
                      {q.question_type === "linear_scale" && (
                        <div className="space-y-2 pt-2">
                          <div className="flex items-center justify-between text-xs font-medium text-slate-500 px-1">
                            <span>{q.validation_rules?.min_label || "1"}</span>
                            <span>{q.validation_rules?.max_label || "5"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {[1, 2, 3, 4, 5].map((val) => (
                              <button
                                key={val}
                                type="button"
                                onClick={() => handlePreviewAnswerChange(q.id, val)}
                                className={`flex-1 h-11 rounded-xl border text-sm font-bold transition ${
                                  previewAnswers[q.id] === val
                                    ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                                    : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300"
                                }`}
                              >
                                {val}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Date */}
                      {q.question_type === "date" && (
                        <input
                          type="date"
                          value={previewAnswers[q.id] || ""}
                          onChange={(e) => handlePreviewAnswerChange(q.id, e.target.value)}
                          className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-700 outline-none focus:border-indigo-600"
                        />
                      )}

                      {/* File Upload */}
                      {q.question_type === "file_upload" && (
                        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-6 text-center text-xs text-slate-500">
                          <UploadCloud size={24} className="mb-2 text-indigo-500" />
                          <span className="font-medium text-slate-700">Upload Attachment</span>
                          <span className="mt-1 text-[11px] text-slate-400">Max size: {q.validation_rules?.max_file_size_mb || 10} MB</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Simulated Submit Button */}
                <div className="mt-6 flex items-center justify-between">
                  <button
                    onClick={() => setPreviewSubmitted(true)}
                    className="rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 transition"
                  >
                    Submit (Simulation)
                  </button>
                  <button
                    onClick={() => setPreviewAnswers({})}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                  >
                    Clear form
                  </button>
                </div>

                <div className="my-8 text-center text-xs text-slate-400 font-medium">
                  Hypervision Form Platform Simulator • Never submit passwords
                </div>
              </>
            )}
          </div>
        </div>
      ) : activeTab === "settings" ? (
        /* SETTINGS TAB */
        <div className="flex-1 p-6 md:p-10 max-w-3xl mx-auto w-full">
          <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Form Settings</h2>
              <p className="text-xs text-slate-500 mt-1">Configure post-submission messaging and lifecycle parameters</p>
            </div>

            <hr className="border-slate-100" />

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">
                Confirmation / Thank You Message
              </label>
              <textarea
                value={confirmationMessage}
                onChange={(e) => {
                  setConfirmationMessage(e.target.value);
                  scheduleAutosave();
                }}
                rows={3}
                placeholder="Your response has been recorded."
                className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20"
              />
              <p className="mt-1.5 text-xs text-slate-400">Displayed to respondents immediately upon successful form submission.</p>
            </div>

            <hr className="border-slate-100" />

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">
                Form Publication Status
              </label>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold capitalize border ${
                    status === "published"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-amber-50 text-amber-700 border-amber-200"
                  }`}
                >
                  {status}
                </span>

                <button
                  onClick={handleToggleStatus}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  {status === "published" ? "Unpublish Form" : "Publish Form"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* QUESTIONS CANVAS (GOOGLE FORMS GRADE) */
        <div className="flex-1 p-4 md:p-8 max-w-3xl mx-auto w-full relative pb-28">
          {/* Header Card */}
          <div
            className="rounded-2xl border-t-[7px] bg-white p-6 sm:p-8 shadow-sm mb-5 transition-shadow hover:shadow"
            style={{ borderTopColor: primaryColor }}
          >
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                scheduleAutosave();
              }}
              placeholder="Form title"
              className="w-full border-b border-transparent py-1 text-2xl sm:text-3xl font-extrabold text-slate-900 outline-none hover:border-slate-200 focus:border-indigo-600 transition"
            />

            <textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                scheduleAutosave();
              }}
              placeholder="Form description"
              rows={2}
              className="mt-3 w-full resize-none border-b border-transparent py-1 text-sm text-slate-600 outline-none hover:border-slate-200 focus:border-indigo-600 transition"
            />
          </div>

          {/* Question Cards List */}
          <div className="space-y-4">
            {questions.map((q, index) => {
              const isActive = activeQuestionId === q.id;

              return (
                <div
                  key={q.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  onClick={() => setActiveQuestionId(q.id)}
                  className={`group relative rounded-2xl bg-white transition-all duration-200 shadow-sm border ${
                    isActive
                      ? "border-l-4 border-l-indigo-600 border-slate-200 ring-2 ring-indigo-500/10 shadow-md"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {/* Drag Handle Top Bar */}
                  <div className="flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition">
                    <GripVertical size={16} />
                  </div>

                  <div className="p-5 sm:p-6 pt-1">
                    {/* Active Question Editor Mode */}
                    {isActive ? (
                      <div className="space-y-5">
                        {/* Question Label & Type Selector Row */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                          <input
                            value={q.label}
                            onChange={(e) => handleUpdateQuestion(q.id, { label: e.target.value })}
                            placeholder="Question"
                            className="flex-1 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-3 text-base font-semibold text-slate-900 outline-none focus:border-indigo-600 focus:bg-white focus:ring-2 focus:ring-indigo-600/20 transition"
                          />

                          {/* Type Dropdown */}
                          <div className="relative w-full sm:w-56">
                            <select
                              value={q.question_type}
                              onChange={(e) => {
                                handleUpdateQuestion(q.id, {
                                  question_type: e.target.value as QuestionType,
                                });
                              }}
                              className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-3 pr-9 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-600 cursor-pointer shadow-sm"
                            >
                              {QUESTION_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                            <ChevronDown
                              size={15}
                              className="pointer-events-none absolute right-3 top-3.5 text-slate-400"
                            />
                          </div>
                        </div>

                        {/* Optional Description */}
                        <div>
                          <input
                            value={q.description}
                            onChange={(e) => handleUpdateQuestion(q.id, { description: e.target.value })}
                            placeholder="Description / helper text (optional)"
                            className="w-full text-xs text-slate-500 border-b border-transparent py-1 outline-none hover:border-slate-200 focus:border-indigo-600 transition"
                          />
                        </div>

                        {/* Question Body Controls */}
                        <div className="py-2">
                          {/* Choice Inputs (Multiple Choice, Checkboxes, Dropdown) */}
                          {(q.question_type === "multiple_choice" ||
                            q.question_type === "checkboxes" ||
                            q.question_type === "dropdown") && (
                            <div className="space-y-3">
                              {q.options.map((opt, optIndex) => (
                                <div key={opt.id} className="flex items-center gap-3">
                                  {q.question_type === "multiple_choice" ? (
                                    <Circle size={17} className="text-slate-300 flex-shrink-0" />
                                  ) : q.question_type === "checkboxes" ? (
                                    <CheckSquare size={17} className="text-slate-300 flex-shrink-0" />
                                  ) : (
                                    <span className="text-xs text-slate-400 font-mono w-4">{optIndex + 1}.</span>
                                  )}

                                  <input
                                    value={opt.label}
                                    onChange={(e) => handleUpdateOptionLabel(q.id, optIndex, e.target.value)}
                                    placeholder={`Option ${optIndex + 1}`}
                                    className="flex-1 border-b border-slate-200 px-2 py-1 text-sm text-slate-800 outline-none focus:border-indigo-600 transition"
                                  />

                                  {q.options.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveOption(q.id, optIndex)}
                                      className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                      title="Remove option"
                                    >
                                      <X size={15} />
                                    </button>
                                  )}
                                </div>
                              ))}

                              {/* Add Option & Add Other Buttons */}
                              <div className="flex items-center gap-4 pt-2 text-xs">
                                <button
                                  type="button"
                                  onClick={() => handleAddOption(q.id)}
                                  className="font-semibold text-indigo-600 hover:text-indigo-800"
                                >
                                  + Add option
                                </button>
                                {(q.question_type === "multiple_choice" || q.question_type === "checkboxes") &&
                                  !q.options.some((o) => o.label === "Other...") && (
                                    <button
                                      type="button"
                                      onClick={() => handleAddOtherOption(q.id)}
                                      className="text-slate-500 hover:text-indigo-600 font-medium"
                                    >
                                      or <span className="text-indigo-600 underline">add &quot;Other&quot;</span>
                                    </button>
                                  )}
                              </div>
                            </div>
                          )}

                          {/* Short Text Preview */}
                          {q.question_type === "short_text" && (
                            <div className="space-y-2">
                              <p className="border-b border-dashed border-slate-300 py-2 text-xs text-slate-400">
                                Short-answer text input
                              </p>
                            </div>
                          )}

                          {/* Paragraph Preview */}
                          {q.question_type === "long_text" && (
                            <p className="border-b border-dashed border-slate-300 py-4 text-xs text-slate-400">
                              Long-answer multi-line paragraph field
                            </p>
                          )}

                          {/* Rating Scale Controls */}
                          {q.question_type === "linear_scale" && (
                            <div className="space-y-3 pt-1">
                              <p className="text-xs font-semibold text-slate-500">Scale: 1 to 5</p>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-[11px] font-semibold text-slate-500">Lowest Label (1)</label>
                                  <input
                                    value={q.validation_rules?.min_label || ""}
                                    onChange={(e) => {
                                      handleUpdateQuestion(q.id, {
                                        validation_rules: {
                                          ...q.validation_rules,
                                          min_label: e.target.value,
                                        },
                                      });
                                    }}
                                    placeholder="e.g., Poor"
                                    className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-indigo-600"
                                  />
                                </div>
                                <div>
                                  <label className="text-[11px] font-semibold text-slate-500">Highest Label (5)</label>
                                  <input
                                    value={q.validation_rules?.max_label || ""}
                                    onChange={(e) => {
                                      handleUpdateQuestion(q.id, {
                                        validation_rules: {
                                          ...q.validation_rules,
                                          max_label: e.target.value,
                                        },
                                      });
                                    }}
                                    placeholder="e.g., Excellent"
                                    className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-indigo-600"
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Date Preview */}
                          {q.question_type === "date" && (
                            <p className="border-b border-dashed border-slate-300 py-2 text-xs text-slate-400">
                              Date calendar selector
                            </p>
                          )}

                          {/* File Upload Preview */}
                          {q.question_type === "file_upload" && (
                            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-4 text-xs text-slate-500 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <UploadCloud size={18} className="text-indigo-500" />
                                <span>Respondent uploads file attachment</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-slate-400">Max MB:</span>
                                <input
                                  type="number"
                                  value={q.validation_rules?.max_file_size_mb || 10}
                                  onChange={(e) => {
                                    handleUpdateQuestion(q.id, {
                                      validation_rules: {
                                        ...q.validation_rules,
                                        max_file_size_mb: Number(e.target.value) || 10,
                                      },
                                    });
                                  }}
                                  className="w-16 rounded border border-slate-200 px-2 py-0.5 text-xs text-center"
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Card Bottom Controls Toolbar */}
                        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDuplicateQuestion(q.id);
                            }}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                            title="Duplicate question"
                          >
                            <Copy size={16} />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteQuestion(q.id);
                            }}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                            title="Delete question"
                          >
                            <Trash2 size={16} />
                          </button>

                          <div className="h-4 w-px bg-slate-200 mx-1" />

                          {/* Required Toggle */}
                          <label
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none"
                          >
                            <span>Required</span>
                            <input
                              type="checkbox"
                              checked={q.is_required}
                              onChange={(e) => handleUpdateQuestion(q.id, { is_required: e.target.checked })}
                              className="sr-only"
                            />
                            <div
                              className={`h-5 w-9 rounded-full p-0.5 transition-colors ${
                                q.is_required ? "bg-indigo-600" : "bg-slate-300"
                              }`}
                            >
                              <div
                                className={`h-4 w-4 rounded-full bg-white transition-transform ${
                                  q.is_required ? "translate-x-4" : "translate-x-0"
                                }`}
                              />
                            </div>
                          </label>
                        </div>
                      </div>
                    ) : (
                      /* Inactive Compact View */
                      <div>
                        <div className="flex items-center justify-between">
                          <p className="text-base font-bold text-slate-800">
                            {q.label || "Untitled Question"}
                            {q.is_required && <span className="ml-1 text-rose-500">*</span>}
                          </p>
                          <span className="text-[11px] font-semibold text-slate-400 capitalize">
                            {q.question_type.replace("_", " ")}
                          </span>
                        </div>
                        {q.description && (
                          <p className="mt-1 text-xs text-slate-500">{q.description}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick-Add Question Floating Action Bar */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2 bg-white p-2.5 rounded-2xl border border-slate-200 shadow-sm max-w-xl mx-auto">
            <button
              onClick={() => handleAddQuestion("multiple_choice", activeQuestionId || undefined)}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 transition"
              title="Add Multiple Choice question"
            >
              <Plus size={15} />
              <span>Add Question</span>
            </button>

            <button
              onClick={() => handleAddQuestion("short_text", activeQuestionId || undefined)}
              className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              title="Add Short Answer"
            >
              Short Text
            </button>

            <button
              onClick={() => handleAddQuestion("checkboxes", activeQuestionId || undefined)}
              className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              title="Add Checkboxes"
            >
              Checkboxes
            </button>

            <button
              onClick={() => handleAddQuestion("dropdown", activeQuestionId || undefined)}
              className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              title="Add Dropdown"
            >
              Dropdown
            </button>

            <button
              onClick={() => handleAddQuestion("linear_scale", activeQuestionId || undefined)}
              className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              title="Add Linear Scale / Rating"
            >
              Rating
            </button>

            <button
              onClick={() => handleAddQuestion("date", activeQuestionId || undefined)}
              className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              title="Add Date"
            >
              Date
            </button>

            <button
              onClick={() => handleAddQuestion("file_upload", activeQuestionId || undefined)}
              className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              title="Add File Upload"
            >
              File
            </button>
          </div>
        </div>
      )}

      {/* Undo Delete Snackbar Notification */}
      {lastDeleted && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 rounded-2xl bg-slate-900 px-5 py-3 text-sm text-white shadow-2xl animate-in slide-in-from-bottom-4">
          <span>Question deleted</span>
          <button
            onClick={handleUndoDelete}
            className="flex items-center gap-1.5 font-bold text-indigo-400 hover:text-indigo-300 transition"
          >
            <RotateCcw size={14} />
            <span>Undo</span>
          </button>
        </div>
      )}
    </div>
  );
}
