"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Plus,
  ClipboardList,
  Users,
  Search,
  Trash2,
  Copy,
  Pencil,
  FileText,
  Loader2,
  X,
  LogOut,
  Share2,
  Check,
} from "lucide-react";

type FormItem = {
  id: string;
  title: string;
  description: string;
  status: "draft" | "published" | "closed";
  response_count: number;
  shareable_slug: string;
  updated_at: string;
};

type CurrentUser = {
  id: string;
  email?: string;
  name?: string;
};

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

export default function DashboardPage() {
  const router = useRouter();

  const [forms, setForms] = useState<FormItem[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editingForm, setEditingForm] = useState<FormItem | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"draft" | "published" | "closed">("draft");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function getToken() {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session) {
      throw new Error("Please log in again to access your dashboard.");
    }

    return data.session.access_token;
  }

  async function loadUser() {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUser({
          id: user.id,
          email: user.email,
          name:
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email?.split("@")[0] ||
            "Creator",
        });
      }
    } catch {
      // User fetch fallback
    }
  }

  async function handleSignOut() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } catch {
      router.push("/login");
    }
  }

  async function loadForms() {
    try {
      setLoading(true);
      setError("");

      if (!API_URL) {
        throw new Error("Backend URL is not configured.");
      }

      const token = await getToken();

      const response = await fetch(`${API_URL}/api/v1/forms/`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "Unable to load forms.");
      }

      setForms(result.forms || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUser();
    loadForms();
  }, []);

  function openCreateModal() {
    setTitle("");
    setDescription("");
    setStatus("draft");
    setError("");
    setNotice("");
    setShowCreate(true);
  }

  function openEditModal(form: FormItem) {
    setTitle(form.title);
    setDescription(form.description || "");
    setStatus(form.status);
    setError("");
    setNotice("");
    setEditingForm(form);
  }

  async function createForm() {
    if (!title.trim()) return;

    try {
      setSaving(true);
      setError("");

      if (!API_URL) {
        throw new Error("Backend URL is not configured.");
      }

      const token = await getToken();

      const response = await fetch(`${API_URL}/api/v1/forms/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "Unable to create form.");
      }

      setShowCreate(false);
      setNotice("Form created successfully.");
      await loadForms();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create form.");
    } finally {
      setSaving(false);
    }
  }

  async function updateForm() {
    if (!editingForm || !title.trim()) return;

    try {
      setSaving(true);
      setError("");

      if (!API_URL) {
        throw new Error("Backend URL is not configured.");
      }

      const token = await getToken();

      const response = await fetch(
        `${API_URL}/api/v1/forms/${editingForm.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
            status: status,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "Unable to update form.");
      }

      setEditingForm(null);
      setNotice("Form updated successfully.");
      await loadForms();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update form.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteForm(form: FormItem) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${form.title}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setDeletingId(form.id);
      setError("");
      setNotice("");

      if (!API_URL) {
        throw new Error("Backend URL is not configured.");
      }

      const token = await getToken();

      const response = await fetch(`${API_URL}/api/v1/forms/${form.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "Unable to delete form.");
      }

      setNotice("Form deleted successfully.");
      await loadForms();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete form.");
    } finally {
      setDeletingId(null);
    }
  }

  async function duplicateForm(form: FormItem) {
    try {
      setDuplicatingId(form.id);
      setError("");
      setNotice("");

      if (!API_URL) {
        throw new Error("Backend URL is not configured.");
      }

      const token = await getToken();

      const response = await fetch(
        `${API_URL}/api/v1/forms/${form.id}/duplicate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "Unable to duplicate form.");
      }

      setNotice("Form duplicated successfully.");
      await loadForms();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to duplicate form.");
    } finally {
      setDuplicatingId(null);
    }
  }

  function handleCopyShareLink(slug: string) {
    if (typeof window === "undefined") return;
    const shareUrl = `${window.location.origin}/f/${slug}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedSlug(slug);
    setTimeout(() => {
      setCopiedSlug(null);
    }, 2500);
  }

  const filteredForms = forms.filter((form) => {
    const matchesSearch = form.title
      .toLowerCase()
      .includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || form.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const totalResponses = forms.reduce(
    (sum, form) => sum + (form.response_count || 0),
    0
  );

  const filters = [
    { label: "All", value: "all" },
    { label: "Published", value: "published" },
    { label: "Drafts", value: "draft" },
    { label: "Closed", value: "closed" },
  ];

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Top Navigation with User Profile and Sign Out */}
      <header className="flex items-center justify-between border-b bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-white font-bold">
            <FileText size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">Hypervision Form</h1>
            <p className="text-xs text-slate-500">Central Platform Workspace</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {currentUser && (
            <div className="hidden sm:flex items-center gap-2 text-right">
              <div className="h-8 w-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs uppercase">
                {currentUser.name ? currentUser.name.slice(0, 2) : "U"}
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-slate-800">{currentUser.name}</p>
                <p className="text-[11px] text-slate-500 truncate max-w-[140px]">{currentUser.email}</p>
              </div>
            </div>
          )}

          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition shadow-sm"
            title="Sign out of your account"
          >
            <LogOut size={15} />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl p-6 sm:p-8">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">
              Creator Dashboard
            </p>
            <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">
              Manage your forms.
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Create, edit, and inspect all your forms and their responses.
            </p>
          </div>

          <button
            onClick={openCreateModal}
            className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 shadow-sm transition"
          >
            <Plus size={18} />
            <span>Create New Form</span>
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {notice && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {notice}
          </div>
        )}

        {/* Metrics Row */}
        <div className="mb-9 grid gap-4 sm:grid-cols-3">
          <Summary
            icon={<FileText className="text-indigo-600" size={20} />}
            label="Total Forms"
            value={forms.length}
          />
          <Summary
            icon={<ClipboardList className="text-emerald-600" size={20} />}
            label="Published Forms"
            value={forms.filter((f) => f.status === "published").length}
          />
          <Summary
            icon={<Users className="text-blue-600" size={20} />}
            label="Total Responses"
            value={totalResponses}
          />
        </div>

        {/* Search & Status Filters */}
        <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Your Forms</h2>
            <p className="text-sm text-slate-500">Browse and manage form settings</p>
          </div>

          <div className="relative sm:w-72">
            <Search
              className="absolute left-3 top-3 text-slate-400"
              size={17}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search forms by title..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-indigo-500 shadow-sm"
            />
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {filters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                statusFilter === filter.value
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Forms Grid */}
        {loading ? (
          <div className="flex justify-center rounded-2xl bg-white p-16 border border-slate-200">
            <Loader2 className="animate-spin text-indigo-600" size={30} />
          </div>
        ) : filteredForms.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-16 text-center">
            <FileText
              className="mx-auto mb-4 text-indigo-400"
              size={40}
            />
            <h3 className="text-lg font-semibold text-slate-900">
              {search
                ? "No matching forms found"
                : statusFilter !== "all"
                  ? `No ${statusFilter} forms`
                  : "No forms created yet"}
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              {search || statusFilter !== "all"
                ? "Try searching for a different title or resetting the filter."
                : "Create your first form to start collecting responses."}
            </p>
            {!search && statusFilter === "all" && (
              <button
                onClick={openCreateModal}
                className="mt-5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 shadow-sm"
              >
                <Plus className="mr-1.5 inline" size={17} />
                Create Your First Form
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {filteredForms.map((form) => (
              <article
                key={form.id}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="text-indigo-600" size={22} />
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize border ${
                        form.status === "published"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : form.status === "closed"
                            ? "bg-slate-100 text-slate-700 border-slate-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}
                    >
                      {form.status}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400">
                    Updated {new Date(form.updated_at).toLocaleDateString()}
                  </p>
                </div>

                <h3 className="text-xl font-bold text-slate-900 leading-snug">
                  {form.title}
                </h3>
                <p className="mt-1 text-sm text-slate-500 line-clamp-2">
                  {form.description || "No description provided."}
                </p>

                <div className="mt-4 flex items-center justify-between text-xs text-slate-500 border-t pt-3">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Users size={15} />
                    {form.response_count || 0} responses
                  </span>

                  {form.shareable_slug && (
                    <span className="font-mono text-slate-400 text-[11px]">
                      slug: {form.shareable_slug.slice(0, 10)}…
                    </span>
                  )}
                </div>

                {/* Card Action Buttons */}
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2 border-t pt-4">
                  <button
                    onClick={() => openEditModal(form)}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 p-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    <Pencil size={14} />
                    <span>Edit Form</span>
                  </button>

                  <button
                    onClick={() => router.push(`/editor/${form.id}`)}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/50 p-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition"
                  >
                    <FileText size={14} />
                    <span>Builder</span>
                  </button>

                  <button
                    onClick={() => router.push(`/responses/${form.id}`)}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/50 p-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition"
                  >
                    <Users size={14} />
                    <span>Responses</span>
                  </button>

                  {/* Share Link Action */}
                  <button
                    onClick={() => handleCopyShareLink(form.shareable_slug)}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 p-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                    title="Copy public registration link to clipboard"
                  >
                    {copiedSlug === form.shareable_slug ? (
                      <>
                        <Check size={14} className="text-emerald-600" />
                        <span className="text-emerald-600">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Share2 size={14} />
                        <span>Share Link</span>
                      </>
                    )}
                  </button>

                  {/* Duplicate Form Action */}
                  <button
                    onClick={() => duplicateForm(form)}
                    disabled={duplicatingId === form.id}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 p-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
                  >
                    {duplicatingId === form.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Copy size={14} />
                    )}
                    <span>{duplicatingId === form.id ? "Duplicating..." : "Duplicate"}</span>
                  </button>

                  {/* Delete Form Action */}
                  <button
                    onClick={() => deleteForm(form)}
                    disabled={deletingId === form.id}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/50 p-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition"
                  >
                    {deletingId === form.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                    <span>{deletingId === form.id ? "Deleting..." : "Delete"}</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Form Modal with Status Controls */}
      {(showCreate || editingForm) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">
                {editingForm ? "Edit Form Settings" : "Create New Form"}
              </h2>

              <button
                onClick={() => {
                  setShowCreate(false);
                  setEditingForm(null);
                  setError("");
                }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-700">
              Form Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Annual Customer Feedback Survey"
              className="mb-4 w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20"
            />

            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-700">
              Description (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide context or instructions for your respondents..."
              rows={3}
              className="mb-4 w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20"
            />

            {/* Status Selector in Edit Modal */}
            {editingForm && (
              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Form Status
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["draft", "published", "closed"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className={`rounded-xl py-2 px-3 text-xs font-semibold capitalize border transition ${
                        status === s
                          ? s === "published"
                            ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                            : s === "closed"
                              ? "bg-slate-700 text-white border-slate-700 shadow-sm"
                              : "bg-amber-500 text-white border-amber-500 shadow-sm"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  {status === "published"
                    ? "✓ Form is public and actively collecting responses."
                    : status === "closed"
                      ? "✕ Form is closed; respondents will see a closed notice."
                      : "⚙ Form is in draft mode and not accessible to the public."}
                </p>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3 border-t pt-4">
              <button
                onClick={() => {
                  setShowCreate(false);
                  setEditingForm(null);
                  setError("");
                }}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                onClick={editingForm ? updateForm : createForm}
                disabled={!title.trim() || saving}
                className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition shadow-sm"
              >
                {saving
                  ? "Saving..."
                  : editingForm
                    ? "Save Changes"
                    : "Create Form"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Summary({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between text-slate-500">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        {icon}
      </div>
      <p className="mt-3 text-3xl font-extrabold text-slate-900">{value}</p>
    </div>
  );
}
