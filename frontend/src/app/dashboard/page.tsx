"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Plus,
  CalendarDays,
  ClipboardList,
  Users,
  Search,
  Trash2,
  Pencil,
  FileText,
  Loader2,
  X,
} from "lucide-react";

type EventItem = {
  id: string;
  title: string;
  description: string;
  status: "draft" | "published" | "closed";
  response_count: number;
  updated_at: string;
};

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

export default function DashboardPage() {
  const router = useRouter();

  const [events, setEvents] = useState<EventItem[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
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

  async function loadEvents() {
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
        throw new Error(result.detail || "Unable to load events.");
      }

      setEvents(result.forms || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEvents();
  }, []);

  function openCreateModal() {
    setTitle("");
    setDescription("");
    setError("");
    setNotice("");
    setShowCreate(true);
  }

  function openEditModal(event: EventItem) {
    setTitle(event.title);
    setDescription(event.description || "");
    setError("");
    setNotice("");
    setEditingEvent(event);
  }

  async function createEvent() {
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
        throw new Error(result.detail || "Unable to create event.");
      }

      setShowCreate(false);
      setNotice("Event created successfully.");
      await loadEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create event.");
    } finally {
      setSaving(false);
    }
  }

  async function updateEvent() {
    if (!editingEvent || !title.trim()) return;

    try {
      setSaving(true);
      setError("");

      if (!API_URL) {
        throw new Error("Backend URL is not configured.");
      }

      const token = await getToken();

      const response = await fetch(
        `${API_URL}/api/v1/forms/${editingEvent.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "Unable to update event.");
      }

      setEditingEvent(null);
      setNotice("Event updated successfully.");
      await loadEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update event.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEvent(event: EventItem) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${event.title}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setDeletingId(event.id);
      setError("");
      setNotice("");

      if (!API_URL) {
        throw new Error("Backend URL is not configured.");
      }

      const token = await getToken();

      const response = await fetch(
        `${API_URL}/api/v1/forms/${event.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "Unable to delete event.");
      }

      setNotice("Event deleted successfully.");
      await loadEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete event.");
    } finally {
      setDeletingId(null);
    }
  }
async function duplicateEvent(event: EventItem) {
  try {
    setDuplicatingId(event.id);
    setError("");
    setNotice("");

    if (!API_URL) {
      throw new Error("Backend URL is not configured.");
    }

    const token = await getToken();

    const response = await fetch(
      `${API_URL}/api/v1/forms/${event.id}/duplicate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.detail || "Unable to duplicate event.");
    }

    setNotice("Event duplicated successfully.");
    await loadEvents();
  } catch (err) {
    setError(
      err instanceof Error ? err.message : "Unable to duplicate event."
    );
  } finally {
    setDuplicatingId(null);
  }
}
  const filteredEvents = events.filter((event) => {
    const matchesSearch = event.title
      .toLowerCase()
      .includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || event.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const totalResponses = events.reduce(
    (sum, event) => sum + (event.response_count || 0),
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
      <header className="flex items-center justify-between border-b bg-white px-6 py-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Hypervision</h1>
          <p className="text-sm text-slate-500">
            Event Management Workspace
          </p>
        </div>

        <span className="rounded-full bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700">
          Creator Dashboard
        </span>
      </header>

      <div className="mx-auto max-w-7xl p-6 sm:p-8">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold text-indigo-600">
              YOUR WORKSPACE
            </p>

            <h2 className="mt-2 text-3xl font-bold text-slate-900">
              Manage your events.
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Create events and manage their registration forms.
            </p>
          </div>

          <button
            onClick={openCreateModal}
            className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700"
          >
            <Plus size={18} /> Create New Event
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {notice && (
          <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            {notice}
          </div>
        )}

        <div className="mb-9 grid gap-4 sm:grid-cols-3">
          <Summary
            icon={<CalendarDays />}
            label="Total Events"
            value={events.length}
          />

          <Summary
            icon={<ClipboardList />}
            label="Published Events"
            value={events.filter((e) => e.status === "published").length}
          />

          <Summary
            icon={<Users />}
            label="Total Responses"
            value={totalResponses}
          />
        </div>

        <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Events</h2>
            <p className="text-sm text-slate-500">Your saved events</p>
          </div>

          <div className="relative sm:w-64">
            <Search
              className="absolute left-3 top-3 text-slate-400"
              size={17}
            />

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search events..."
              className="w-full rounded-xl border bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-indigo-400"
            />
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {filters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                statusFilter === filter.value
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center rounded-2xl bg-white p-16">
            <Loader2 className="animate-spin text-indigo-600" size={30} />
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-white px-5 py-16 text-center">
            <CalendarDays
              className="mx-auto mb-4 text-indigo-500"
              size={36}
            />

            <h3 className="text-lg font-semibold text-slate-900">
              {search
                ? "No matching events"
                : statusFilter !== "all"
                  ? `No ${statusFilter} events`
                  : "No events yet"}
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              {search || statusFilter !== "all"
                ? "Try changing your search or selected filter."
                : "Create your first event to get started."}
            </p>

            {!search && statusFilter === "all" && (
              <button
                onClick={openCreateModal}
                className="mt-5 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white"
              >
                <Plus className="mr-2 inline" size={17} />
                Add Your First Event
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {filteredEvents.map((event) => (
              <article
                key={event.id}
                className="rounded-2xl border bg-white p-5 shadow-sm"
              >
                <div className="mb-4 flex items-center justify-between">
                  <CalendarDays className="text-indigo-600" size={23} />

                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold capitalize text-amber-700">
                    {event.status}
                  </span>
                </div>

                <h3 className="text-lg font-bold text-slate-900">
                  {event.title}
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  {event.description || "No description added."}
                </p>

                <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                  <Users size={16} />
                  {event.response_count || 0} responses
                </p>

                <div className="mt-5 grid grid-cols-2 gap-2 border-t pt-4">
                  <button
                    onClick={() => openEditModal(event)}
                    className="flex items-center justify-center gap-2 rounded-lg border p-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <Pencil size={15} /> Edit Event
                  </button>

                  <button
                    onClick={() => router.push(`/editor/${event.id}`)}
                    className="flex items-center justify-center gap-2 rounded-lg border p-2 text-sm text-indigo-600 hover:bg-indigo-50"
                  >
                    <FileText size={15} /> Manage Form
                  </button>

                  <button
                    onClick={() => router.push(`/responses/${event.id}`)}
                    className="flex items-center justify-center gap-2 rounded-lg border p-2 text-sm text-green-600 hover:bg-green-50"
                  >
                    <Users size={15} /> View Responses
                  </button>

                  <button
                    onClick={() => deleteEvent(event)}
                    disabled={deletingId === event.id}
                    className="flex items-center justify-center gap-2 rounded-lg border border-red-200 p-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {deletingId === event.id ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Trash2 size={15} />
                    )}

                    {deletingId === event.id
                      ? "Deleting..."
                      : "Delete Event"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {(showCreate || editingEvent) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold">
                {editingEvent ? "Edit Event" : "Create New Event"}
              </h2>

              <button
                onClick={() => {
                  setShowCreate(false);
                  setEditingEvent(null);
                  setError("");
                }}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <label className="mb-2 block text-sm font-medium">
              Event Name
            </label>

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter event name"
              className="mb-4 w-full rounded-xl border p-3 text-sm"
            />

            <label className="mb-2 block text-sm font-medium">
              Description
            </label>

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your event"
              rows={3}
              className="w-full rounded-xl border p-3 text-sm"
            />

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreate(false);
                  setEditingEvent(null);
                  setError("");
                }}
                className="rounded-xl border px-4 py-2.5 text-sm"
              >
                Cancel
              </button>

              <button
                onClick={editingEvent ? updateEvent : createEvent}
                disabled={!title.trim() || saving}
                className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving
                  ? "Saving..."
                  : editingEvent
                    ? "Save Changes"
                    : "Create Event"}
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
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between text-slate-500">
        <span className="text-sm font-medium">{label}</span>
        {icon}
      </div>

      <p className="mt-4 text-3xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
