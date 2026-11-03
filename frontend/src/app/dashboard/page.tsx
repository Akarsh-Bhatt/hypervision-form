
"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Plus,
  CalendarDays,
  FileText,
  Users,
  Pencil,
  Trash2,
  ClipboardList,
  LayoutDashboard,
  Search,
  Bell,
  ChevronRight,
  Sparkles,
  Menu,
  X,
} from "lucide-react";

type EventItem = {
  id: string;
  title: string;
  description: string;
  status: "Draft" | "Published" | "Closed";
  responses: number;
  updated: string;
};

export default function DashboardPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filteredEvents = events.filter((event) =>
    event.title.toLowerCase().includes(search.toLowerCase())
  );

  function createEvent() {
    if (!newTitle.trim()) return;

    const event: EventItem = {
      id: crypto.randomUUID(),
      title: newTitle.trim(),
      description: newDescription.trim(),
      status: "Draft",
      responses: 0,
      updated: "Just now",
    };

    setEvents((current) => [event, ...current]);
    setNewTitle("");
    setNewDescription("");
    setShowCreate(false);
  }

  function deleteEvent(id: string) {
    setEvents((current) => current.filter((event) => event.id !== id));
    setDeleteId(null);
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white p-6 md:flex md:flex-col">
          <Link href="/" className="mb-12 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <FileText size={21} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">
                Hypervision
              </h1>
              <p className="text-xs text-slate-500">Form Platform</p>
            </div>
          </Link>

          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Workspace
          </p>

          <nav className="space-y-2">
            <div className="flex items-center gap-3 rounded-xl bg-indigo-50 px-4 py-3 font-semibold text-indigo-700">
              <LayoutDashboard size={19} />
              Dashboard
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-slate-600 transition hover:bg-slate-100"
            >
              <Plus size={19} />
              Create Event
            </button>
          </nav>

          <div className="mt-auto rounded-2xl bg-indigo-50 p-4">
            <div className="mb-2 flex items-center gap-2 text-indigo-700">
              <Sparkles size={18} />
              <span className="text-sm font-semibold">Quick tip</span>
            </div>
            <p className="text-xs leading-5 text-slate-600">
              Create an event, add questions to its form, and share the
              registration link with participants.
            </p>
          </div>
        </aside>

        {/* Main content */}
        <section className="min-w-0 flex-1">
          <header className="flex h-20 items-center justify-between border-b border-slate-200 bg-white px-5 sm:px-8">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
                aria-label="Toggle menu"
              >
                {menuOpen ? <X size={21} /> : <Menu size={21} />}
              </button>
              <div>
                <p className="text-sm text-slate-500">Workspace</p>
                <h2 className="text-lg font-bold text-slate-900">
                  Dashboard
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                className="rounded-full border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50"
                aria-label="Notifications"
              >
                <Bell size={18} />
              </button>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700">
                HV
              </div>
            </div>
          </header>

          {menuOpen && (
            <div className="border-b border-slate-200 bg-white p-4 md:hidden">
              <button
                onClick={() => {
                  setShowCreate(true);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-slate-700 hover:bg-slate-50"
              >
                <Plus size={18} />
                Create Event
              </button>
            </div>
          )}

          <div className="mx-auto max-w-7xl p-5 sm:p-8">
            {/* Welcome */}
            <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
              <div>
                <p className="mb-2 text-sm font-medium text-indigo-600">
                  YOUR EVENT WORKSPACE
                </p>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  Manage your events.
                </h1>
                <p className="mt-2 text-sm text-slate-500">
                  Create events, build registration forms, and manage responses
                  in one place.
                </p>
              </div>

              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
              >
                <Plus size={18} />
                Create New Event
              </button>
            </div>

            {/* Summary cards */}
            <div className="mb-9 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <SummaryCard
                icon={<CalendarDays size={20} />}
                label="Total Events"
                value={events.length}
                color="indigo"
              />
              <SummaryCard
                icon={<ClipboardList size={20} />}
                label="Published Events"
                value={events.filter((e) => e.status === "Published").length}
                color="emerald"
              />
              <SummaryCard
                icon={<Users size={20} />}
                label="Total Responses"
                value={events.reduce((sum, e) => sum + e.responses, 0)}
                color="amber"
              />
            </div>

            {/* Events section */}
            <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Events</h2>
                <p className="mt-1 text-sm text-slate-500">
                  View and manage the events you create.
                </p>
              </div>

              <div className="relative w-full sm:w-64">
                <Search
                  size={17}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search events..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </div>

            {filteredEvents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-16 text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <CalendarDays size={30} />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {search ? "No matching events" : "No events yet"}
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                  {search
                    ? "Try searching with a different event name."
                    : "Your workspace is ready. Create your first event and start building its registration form."}
                </p>
                {!search && (
                  <button
                    onClick={() => setShowCreate(true)}
                    className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
                  >
                    <Plus size={18} />
                    Add Your First Event
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {filteredEvents.map((event) => (
                  <article
                    key={event.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                        <CalendarDays size={21} />
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          event.status === "Published"
                            ? "bg-emerald-50 text-emerald-700"
                            : event.status === "Closed"
                              ? "bg-slate-100 text-slate-600"
                              : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {event.status}
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-slate-900">
                      {event.title}
                    </h3>
                    <p className="mt-1 min-h-10 text-sm leading-5 text-slate-500">
                      {event.description || "No event description added."}
                    </p>

                    <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                      <Users size={16} />
                      {event.responses} responses
                      <span className="text-slate-300">•</span>
                      Updated {event.updated}
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
                      <button
                        onClick={() => alert("Event editing will be connected to the backend in the next step.")}
                        className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Pencil size={15} />
                        Edit Event
                      </button>
                      <button
                        onClick={() => alert("The form builder will be connected in the next step.")}
                        className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <FileText size={15} />
                        Manage Form
                      </button>
                      <button
                        onClick={() => alert("Response management will be connected in a later step.")}
                        className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Users size={15} />
                        View Responses
                      </button>
                      <button
                        onClick={() => setDeleteId(event.id)}
                        className="flex items-center justify-center gap-2 rounded-lg border border-red-100 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={15} />
                        Delete Event
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <p className="mt-8 text-center text-xs text-slate-400">
              Hypervision Form Platform · Event Management Workspace
            </p>
          </div>
        </section>
      </div>

      {/* Create event modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                Create New Event
              </h2>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
                aria-label="Close"
              >
                <X size={19} />
              </button>
            </div>

            <label className="mb-2 block text-sm font-medium text-slate-700">
              Event Name
            </label>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Enter event name"
              className="mb-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />

            <label className="mb-2 block text-sm font-medium text-slate-700">
              Description
            </label>
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Briefly describe your event"
              rows={3}
              className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={createEvent}
                disabled={!newTitle.trim()}
                className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Create Event
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600">
              <Trash2 size={21} />
            </div>
            <h2 className="text-lg font-bold text-slate-900">
              Delete this event?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              This will remove the event from this temporary dashboard view.
              You can cancel if you do not want to continue.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteEvent(deleteId)}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: "indigo" | "emerald" | "amber";
}) {
  const styles = {
    indigo: "bg-indigo-50 text-indigo-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <div className={`rounded-xl p-2.5 ${styles[color]}`}>{icon}</div>
      </div>
      <p className="mt-4 text-3xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
