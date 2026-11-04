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
  GitBranch,
  Lock,
  Clock,
  Globe,
  Bell,
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

type LogicRule = {
  id: string;
  source_question_id: string;
  operator: "equals" | "not_equals" | "contains" | "is_empty" | "is_not_empty";
  value: string;
  action: "show" | "hide";
};

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
    logic_rules?: LogicRule[];
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
  const [fontFamily, setFontFamily] = useState<"sans" | "serif" | "mono">("sans");
  const [headerImageUrl, setHeaderImageUrl] = useState("");

  // Advanced Settings State
  const [allowMultipleResponses, setAllowMultipleResponses] = useState(true);
  const [passwordProtection, setPasswordProtection] = useState(false);
  const [password, setPassword] = useState("");
  const [closingDate, setClosingDate] = useState("");
  const [responseLimit, setResponseLimit] = useState("");
  const [emailCreator, setEmailCreator] = useState(true);
  const [creatorEmail, setCreatorEmail] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [slugError, setSlugError] = useState("");
  const [slugSuccess, setSlugSuccess] = useState("");
  const [savingSlug, setSavingSlug] = useState(false);

  // Active Logic Drawer
  const [editingLogicQuestionId, setEditingLogicQuestionId] = useState<string | null>(null);

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
      setCustomSlug(form.shareable_slug || "");

      const settings = form.settings || {};
      setConfirmationMessage(settings.confirmation_message || "Your response has been recorded.");
      setAllowMultipleResponses(settings.allow_multiple_responses ?? true);
      setPasswordProtection(Boolean(settings.password_protection));
      setPassword(settings.password || "");
      setClosingDate(settings.closing_date ? settings.closing_date.slice(0, 16) : "");
      setResponseLimit(settings.response_limit !== null && settings.response_limit !== undefined ? String(settings.response_limit) : "");
      const notifs = settings.notifications || {};
      setEmailCreator(notifs.email_creator ?? true);
      setCreatorEmail(notifs.creator_email || "");

      const theme = form.theme || {};
      setPrimaryColor(theme.primary_color || "#4f46e5");
      setBackgroundColor(theme.background_color || "#f8fafc");
      setFontFamily(theme.font_family || "sans");
      setHeaderImageUrl(theme.header_image_url || "");

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
    updatedFont = fontFamily,
    updatedHeaderImg = headerImageUrl,
    updatedAllowMultiple = allowMultipleResponses,
    updatedPasswordProtect = passwordProtection,
    updatedPassword = password,
    updatedClosingDate = closingDate,
    updatedLimit = responseLimit,
    updatedEmailCreator = emailCreator,
    updatedCreatorEmail = creatorEmail,
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
          allow_multiple_responses: updatedAllowMultiple,
          password_protection: updatedPasswordProtect,
          password: updatedPassword.trim() || null,
          closing_date: updatedClosingDate ? new Date(updatedClosingDate).toISOString() : null,
          response_limit: updatedLimit ? parseInt(updatedLimit, 10) : null,
          notifications: {
            email_creator: updatedEmailCreator,
            creator_email: updatedCreatorEmail.trim() || undefined,
          },
        },
        theme: {
          primary_color: updatedPrimary,
          background_color: updatedBg,
          font_family: updatedFont,
          header_image_url: updatedHeaderImg.trim() || null,
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
  }, [
    formId,
    title,
    description,
    questions,
    status,
    confirmationMessage,
    primaryColor,
    backgroundColor,
    fontFamily,
    headerImageUrl,
    allowMultipleResponses,
    passwordProtection,
    password,
    closingDate,
    responseLimit,
    emailCreator,
    creatorEmail,
  ]);

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
        backgroundColor,
        fontFamily,
        headerImageUrl,
        allowMultipleResponses,
        passwordProtection,
        password,
        closingDate,
        responseLimit,
        emailCreator,
        creatorEmail
      );
    }, 800);
  }

  async function handleUpdateSlug() {
    if (!customSlug.trim()) return;
    try {
      setSavingSlug(true);
      setSlugError("");
      setSlugSuccess("");

      const token = await getToken();
      const res = await fetch(`${API_URL}/api/v1/forms/${formId}/slug`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ shareable_slug: customSlug.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Unable to update vanity URL slug.");
      }

      setShareableSlug(data.shareable_slug);
      setSlugSuccess("Custom vanity URL updated successfully!");
    } catch (err) {
      setSlugError(err instanceof Error ? err.message : "Unable to update slug.");
    } finally {
      setSavingSlug(false);
    }
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

  function handleUpdateValidation(id: string, validation_rules: Question['validation_rules']) {
    handleUpdateQuestion(id, { validation_rules });
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
            {status === "published" ? "Published Γ£ô" : "Publish Form"}
          </button>
        </div>
      </header>

      {/* Theme Drawer */}
      {showThemeDrawer && (
        <div className="fixed right-4 top-16 z-40 w-80 max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl animate-in slide-in-from-top-3 duration-150">
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
              <div className="mt-2 flex flex-wrap gap-2">
                {["#4F46E5", "#10B981", "#F43F5E", "#F59E0B", "#8B5CF6", "#475569", "#0284C7"].map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => {
                      setPrimaryColor(hex);
                      scheduleAutosave();
                    }}
                    className={`h-6 w-6 rounded-full border transition ${
                      primaryColor.toLowerCase() === hex.toLowerCase() ? "ring-2 ring-indigo-600 ring-offset-1" : ""
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => {
                    setPrimaryColor(e.target.value);
                    scheduleAutosave();
                  }}
                  className="h-8 w-12 cursor-pointer rounded-lg border border-slate-200 p-0.5"
                />
                <span className="font-mono text-xs text-slate-600 uppercase">{primaryColor}</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Page Background Tint
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  { name: "White", hex: "#FFFFFF" },
                  { name: "Slate", hex: "#F8FAFC" },
                  { name: "Zinc", hex: "#F4F4F5" },
                  { name: "Indigo", hex: "#EEF2FF" },
                  { name: "Mint", hex: "#F0FDF4" },
                ].map((item) => (
                  <button
                    key={item.hex}
                    type="button"
                    onClick={() => {
                      setBackgroundColor(item.hex);
                      scheduleAutosave();
                    }}
                    className={`h-6 w-6 rounded-full border border-slate-300 transition ${
                      backgroundColor.toLowerCase() === item.hex.toLowerCase() ? "ring-2 ring-indigo-600 ring-offset-1" : ""
                    }`}
                    style={{ backgroundColor: item.hex }}
                    title={item.name}
                  />
                ))}
              </div>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => {
                    setBackgroundColor(e.target.value);
                    scheduleAutosave();
                  }}
                  className="h-8 w-12 cursor-pointer rounded-lg border border-slate-200 p-0.5"
                />
                <span className="font-mono text-xs text-slate-600 uppercase">{backgroundColor}</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Font Family
              </label>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {[
                  { id: "sans", label: "Sans", fontClass: "font-sans" },
                  { id: "serif", label: "Serif", fontClass: "font-serif" },
                  { id: "mono", label: "Mono", fontClass: "font-mono" },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setFontFamily(f.id as any);
                      scheduleAutosave();
                    }}
                    className={`rounded-xl border py-2 text-xs font-semibold transition ${f.fontClass} ${
                      fontFamily === f.id
                        ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Header Cover Banner URL
              </label>
              <input
                type="url"
                value={headerImageUrl}
                onChange={(e) => {
                  setHeaderImageUrl(e.target.value);
                  scheduleAutosave();
                }}
                placeholder="https://images.unsplash.com/..."
                className="mt-1.5 w-full rounded-xl border border-slate-200 p-2 text-xs outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20"
              />
              {headerImageUrl && (
                <div className="mt-2 h-20 w-full overflow-hidden rounded-xl border border-slate-200">
                  <img
                    src={headerImageUrl}
                    alt="Cover Banner"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Body */}
      {previewMode ? (
        /* LIVE INTERACTIVE PREVIEW SIMULATOR */
        /* SETTINGS TAB */
        <div className="flex-1 p-6 md:p-10 max-w-3xl mx-auto w-full space-y-6">
          {/* Header Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">Form Settings & Advanced Access</h2>
            <p className="text-xs text-slate-500 mt-1">
              Configure vanity links, security gatekeeping, expiration rules, and notification alerts
            </p>
          </div>

          {/* Vanity URL Slug Manager */}
          <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <Globe size={18} className="text-indigo-600" />
              <span>Custom Vanity URL Slug</span>
            </div>
            <p className="text-xs text-slate-500">
              Customize your public form URL so respondents receive a memorable, branded registration link.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <span className="font-mono text-xs text-slate-400 bg-slate-50 px-3 py-2.5 rounded-xl border border-slate-200 select-all">
                {typeof window !== "undefined" ? window.location.origin : ""}/f/
              </span>
              <input
                type="text"
                value={customSlug}
                onChange={(e) => {
                  setCustomSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ""));
                  setSlugError("");
                  setSlugSuccess("");
                }}
                placeholder="my-custom-form"
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20"
              />
              <button
                type="button"
                onClick={handleUpdateSlug}
                disabled={savingSlug || !customSlug.trim() || customSlug === shareableSlug}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {savingSlug ? "Updating..." : "Update Slug"}
              </button>
            </div>

            {slugError && (
              <p className="text-xs font-medium text-rose-600 animate-in fade-in">{slugError}</p>
            )}
            {slugSuccess && (
              <p className="text-xs font-medium text-emerald-600 animate-in fade-in">{slugSuccess}</p>
            )}
          </div>

          {/* Access Control & Expiration */}
          <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm space-y-5">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <Lock size={18} className="text-indigo-600" />
              <span>Access Control & Lifecycle Gatekeeping</span>
            </div>

            {/* Password Protection */}
            <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Password Protection</h4>
                  <p className="text-xs text-slate-500">Require respondents to enter a password before viewing questions</p>
                </div>
                <input
                  type="checkbox"
                  checked={passwordProtection}
                  onChange={(e) => {
                    setPasswordProtection(e.target.checked);
                    scheduleAutosave();
                  }}
                  className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              {passwordProtection && (
                <div className="pt-2 animate-in fade-in">
                  <input
                    type="text"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      scheduleAutosave();
                    }}
                    placeholder="Enter access password"
                    className="w-full sm:w-64 rounded-xl border border-slate-200 p-2 text-xs outline-none focus:border-indigo-600 bg-white"
                  />
                </div>
              )}
            </div>

            {/* Scheduled Expiration */}
            <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Scheduled Closing Date & Time</h4>
                  <p className="text-xs text-slate-500">Automatically close form submissions when this timestamp arrives</p>
                </div>
                <Clock size={16} className="text-slate-400" />
              </div>
              <input
                type="datetime-local"
                value={closingDate}
                onChange={(e) => {
                  setClosingDate(e.target.value);
                  scheduleAutosave();
                }}
                className="rounded-xl border border-slate-200 p-2 text-xs outline-none focus:border-indigo-600 bg-white"
              />
            </div>

            {/* Response Quota Limit */}
            <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Response Cap / Quota</h4>
                  <p className="text-xs text-slate-500">Close the form automatically once this number of submissions is reached</p>
                </div>
              </div>
              <input
                type="number"
                min="1"
                value={responseLimit}
                onChange={(e) => {
                  setResponseLimit(e.target.value);
                  scheduleAutosave();
                }}
                placeholder="Unlimited responses (leave empty)"
                className="w-full sm:w-64 rounded-xl border border-slate-200 p-2 text-xs outline-none focus:border-indigo-600 bg-white"
              />
            </div>

            {/* Multiple Submissions */}
            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <div>
                <h4 className="text-xs font-bold text-slate-800">Allow Multiple Submissions</h4>
                <p className="text-xs text-slate-500">Allow respondents to submit more than one response</p>
              </div>
              <input
                type="checkbox"
                checked={allowMultipleResponses}
                onChange={(e) => {
                  setAllowMultipleResponses(e.target.checked);
                  scheduleAutosave();
                }}
                className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Submission Alerts */}
          <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <Bell size={18} className="text-indigo-600" />
              <span>Submission Notification Pipeline</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-800">Email Alerts on New Submissions</h4>
                <p className="text-xs text-slate-500">Dispatch an immediate background notification when a respondent submits</p>
              </div>
              <input
                type="checkbox"
                checked={emailCreator}
                onChange={(e) => {
                  setEmailCreator(e.target.checked);
                  scheduleAutosave();
                }}
                className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
            </div>

            {emailCreator && (
              <div className="pt-2 animate-in fade-in">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Recipient Alert Email (Optional override)
                </label>
                <input
                  type="email"
                  value={creatorEmail}
                  onChange={(e) => {
                    setCreatorEmail(e.target.value);
                    scheduleAutosave();
                  }}
                  placeholder="Defaults to your account email"
                  className="w-full rounded-xl border border-slate-200 p-2 text-xs outline-none focus:border-indigo-600"
                />
              </div>
            )}
          </div>

          {/* Post-Submission Messaging */}
          <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Confirmation / Thank You Message</h3>
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
            <p className="text-xs text-slate-400">Displayed to respondents immediately upon successful form submission.</p>
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
                              setEditingLogicQuestionId(
                                editingLogicQuestionId === q.id ? null : q.id
                              );
                            }}
                            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition border ${
                              q.validation_rules?.logic_rules?.length
                                ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                                : "border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                            }`}
                            title="Configure conditional logic rules (DAG)"
                          >
                            <GitBranch size={14} />
                            <span>Logic</span>
                            {q.validation_rules?.logic_rules?.length ? (
                              <span className="ml-1 rounded-full bg-indigo-600 px-1.5 py-0.2 text-[10px] text-white">
                                {q.validation_rules.logic_rules.length}
                              </span>
                            ) : null}
                          </button>

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
                        
                  {/* Conditional Logic Drawer (DAG) */}
                  {isActive && editingLogicQuestionId === q.id && (
                    <div className="mt-4 border-t border-indigo-100 bg-indigo-50/40 p-4 rounded-xl animate-in fade-in duration-150">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <GitBranch size={16} className="text-indigo-600" />
                          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                            Conditional Logic & Skip Branching
                          </h4>
                        </div>
                        <span className="text-[11px] text-slate-400">DAG Rule Engine</span>
                      </div>

                      {(() => {
                        const predecessors = questions.filter((p) => p.order_index < q.order_index);
                        const currentRule = q.validation_rules?.logic_rules?.[0];

                        if (predecessors.length === 0) {
                          return (
                            <p className="text-xs text-slate-500 italic">
                              This is the first question in the form. Conditional logic can only depend on predecessor questions to guarantee no cyclic loops.
                            </p>
                          );
                        }

                        return (
                          <div className="space-y-3">
                            <p className="text-xs text-slate-600">
                              Display this question <span className="font-semibold text-indigo-600">only if</span> the respondent's answer satisfies:
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <select
                                value={currentRule?.source_question_id || ""}
                                onChange={(e) => {
                                  const sourceId = e.target.value;
                                  if (!sourceId) {
                                    handleUpdateValidation(q.id, {
                                      ...q.validation_rules,
                                      logic_rules: [],
                                    });
                                    return;
                                  }
                                  const updatedRules: LogicRule[] = [
                                    {
                                      id: crypto.randomUUID(),
                                      source_question_id: sourceId,
                                      operator: currentRule?.operator || "equals",
                                      value: currentRule?.value || "",
                                      action: "show",
                                    },
                                  ];
                                  handleUpdateValidation(q.id, {
                                    ...q.validation_rules,
                                    logic_rules: updatedRules,
                                  });
                                }}
                                className="rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-800 outline-none focus:border-indigo-600"
                              >
                                <option value="">Select prior question...</option>
                                {predecessors.map((p, pIdx) => (
                                  <option key={p.id} value={p.id}>
                                    {pIdx + 1}. {p.label.slice(0, 35)}
                                  </option>
                                ))}
                              </select>

                              <select
                                value={currentRule?.operator || "equals"}
                                disabled={!currentRule?.source_question_id}
                                onChange={(e) => {
                                  if (!currentRule) return;
                                  const updatedRules: LogicRule[] = [
                                    {
                                      ...currentRule,
                                      operator: e.target.value as any,
                                    },
                                  ];
                                  handleUpdateValidation(q.id, {
                                    ...q.validation_rules,
                                    logic_rules: updatedRules,
                                  });
                                }}
                                className="rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-800 outline-none focus:border-indigo-600 disabled:opacity-50"
                              >
                                <option value="equals">Equals</option>
                                <option value="not_equals">Does not equal</option>
                                <option value="contains">Contains text</option>
                                <option value="is_empty">Is empty / skipped</option>
                                <option value="is_not_empty">Is answered</option>
                              </select>

                              {currentRule?.operator !== "is_empty" && currentRule?.operator !== "is_not_empty" && (
                                <input
                                  type="text"
                                  placeholder="Expected answer value"
                                  value={currentRule?.value || ""}
                                  disabled={!currentRule?.source_question_id}
                                  onChange={(e) => {
                                    if (!currentRule) return;
                                    const updatedRules: LogicRule[] = [
                                      {
                                        ...currentRule,
                                        value: e.target.value,
                                      },
                                    ];
                                    handleUpdateValidation(q.id, {
                                      ...q.validation_rules,
                                      logic_rules: updatedRules,
                                    });
                                  }}
                                  className="rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-800 outline-none focus:border-indigo-600 disabled:opacity-50"
                                />
                              )}
                            </div>

                            {currentRule && (
                              <div className="flex justify-end pt-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleUpdateValidation(q.id, {
                                      ...q.validation_rules,
                                      logic_rules: [],
                                    });
                                  }}
                                  className="text-xs text-rose-600 hover:text-rose-700 font-medium"
                                >
                                  Remove Rule
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}</div>
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
