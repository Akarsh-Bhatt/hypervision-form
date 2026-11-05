# Hypervision Form Platform
## Step-by-Step Development Plan

---

## 1. Project Overview & Architecture

Hypervision Form Platform is a modular, high-performance form-building and response-collection system. The application allows creators to compose, customize, and share dynamic forms, and enables respondents to submit answers across devices. Creators can review submissions in real-time, view response grids, and export data.

### Technology Stack
- **Frontend:** Next.js (App Router, React, TypeScript), Tailwind CSS, Lucide Icons
- **Backend API:** Python (FastAPI, Pydantic, Asynchronous runtime)
- **Database, Auth & Storage:** Supabase (PostgreSQL, Supabase Auth, Row Level Security, Supabase Storage)

---

## 2. Strict Pair-Programming Protocol (`agent.md`)

All implementation follows these strict execution guardrails:
1. **One Step at a Time:** Never attempt the entire task at once. Break the task down into distinct, logical milestones.
2. **Implement Incrementally:** Execute only the active step with minimal, focused code and commands.
3. **Halt for Verification:** After completing a step, stop immediately and ask for review/test results. Do NOT proceed to the next step until the user explicitly commands `"continue"` or `"next step"`.
4. **Scope Guardrails:** Never modify unrelated files, refactor working logic outside the current step, or introduce speculative features.

---

## 3. Step-by-Step Implementation Roadmap

### Step 1: Database Schema & Supabase Connectivity
- **Objective:** Verify PostgreSQL database tables, security policies, and environment connectivity.
- **Deliverables:**
  - Verify tables: `profiles`, `forms`, `form_questions`, `form_responses`, `form_answers`.
  - Confirm Row Level Security (RLS) policies and triggers.
  - Test frontend and backend Supabase client connections via `.env.local` / `.env`.
- **Verification:** Run database connection check script and verify zero schema errors.

---

### Step 2: Authentication System (Sign In / Sign Up)
- **Objective:** Establish the user authentication experience on the root route.
- **Deliverables:**
  - Root landing page (`/`) serving the Auth Form with **Sign In** and **Create Account** tab switching.
  - Supabase Auth integration (email/password and OAuth providers).
  - Next.js middleware with zero-latency cookie check, protecting `/dashboard` and routing authenticated users.
- **Verification:** User can register a new account, log in, and be routed to `/dashboard`. Unauthenticated requests to protected routes redirect to `/`.

---

### Step 3: Creator Dashboard & Form Listing
- **Objective:** Build the authenticated creator workspace.
- **Deliverables:**
  - `/dashboard` view displaying user's forms as cards (title, submission count, status, updated date).
  - Empty state with guidance when no forms exist.
  - Header with user profile email and working Sign Out action.
- **Verification:** Creator sees their form list, empty state when blank, and can successfully sign out.

---

### Step 4: Form Lifecycle Actions (Create, Rename, Delete)
- **Objective:** Allow creators to manage the lifecycle of forms.
- **Deliverables:**
  - "Create New Form" action: creates a new form record in Supabase and routes to the editor.
  - Quick action to rename form title.
  - Delete form action with confirmation.
  - Status toggle (Draft vs. Published).
- **Verification:** Clicking "Create Form" adds a row to `forms` table and redirects to `/editor/[id]`. Deleting removes the form from dashboard.

---

### Step 5: Form Builder — Core Canvas & Text Questions
- **Objective:** Build the form editor layout and support text-based input fields.
- **Deliverables:**
  - `/editor/[id]` page layout with editable form title and description.
  - Question list rendering active question cards.
  - Add and configure **Short Text** and **Long Text** question types.
  - Required field toggle.
- **Verification:** Creator can change form title, add short and long text questions, and preview them on the canvas.

---

### Step 6: Form Builder — Choice & Rating Questions
- **Objective:** Expand the builder to support choice-based and numeric questions.
- **Deliverables:**
  - Add question types: **Multiple Choice**, **Checkboxes**, **Dropdown**, and **Rating (1–5 scale)**.
  - Option management: add new option, inline text editing, and delete option.
  - Duplicate question action.
- **Verification:** Creator can add multiple choice and dropdown questions, customize options, and duplicate questions seamlessly.

---

### Step 7: Form Builder — Reordering & Persistence
- **Objective:** Ensure all changes save reliably and allow questions to be reordered.
- **Deliverables:**
  - Question reordering controls (Move Up / Move Down buttons or drag handle).
  - Debounced auto-save mechanism updating Supabase/backend on changes.
  - Save status indicator (Saved / Saving / Unsaved changes).
- **Verification:** Reorder questions, refresh page, and verify the order and content remain exactly as set.

---

### Step 8: Public Form Responder View
- **Objective:** Provide a clean, standalone view for respondents to fill out published forms.
- **Deliverables:**
  - Public route `/f/[id]` (or vanity slug `/f/[slug]`).
  - Mobile-responsive layout displaying form title, description, and ordered questions.
  - Interactive inputs corresponding to each question type (text, choices, rating).
  - Draft/Closed state handling if form is not accepting responses.
- **Verification:** Respondent can open a public URL in a private/incognito window and interact with all question inputs.

---

### Step 9: Submission Ingestion & Validation
- **Objective:** Process, validate, and store respondent submissions.
- **Deliverables:**
  - Client-side validation enforcing required fields before submission.
  - Submission ingestion pipeline storing record in `form_responses` and answer items in `form_answers`.
  - Submission success screen with confirmation message.
- **Verification:** Submit an answer payload, verify `form_responses` and `form_answers` receive correct data in Supabase, and view success message.

---

### Step 10: Responses Data Table
- **Objective:** Enable creators to inspect collected responses.
- **Deliverables:**
  - `/responses/[id]` view linked from dashboard and editor.
  - Summary metrics: total responses count, last submission timestamp.
  - Tabular grid displaying each response as a row with question columns and timestamp.
  - Individual response detail modal/drawer.
- **Verification:** Responses submitted in Step 9 show up immediately in the table with accurate timestamps and answers.

---

### Step 11: CSV Export & Response Summary
- **Objective:** Allow creators to export and analyze data.
- **Deliverables:**
  - One-click CSV export: downloads a `.csv` file containing all questions and answers.
  - Summary tab displaying response breakdown (e.g., choice distribution count).
- **Verification:** Click "Export CSV" and open the downloaded file to verify all submission data matches the database.

---

### Step 12: Final Review & Polish
- **Objective:** Perform end-to-end audit, security check, and edge-case handling.
- **Deliverables:**
  - Comprehensive end-to-end test (Create $\rightarrow$ Add questions $\rightarrow$ Publish $\rightarrow$ Respond $\rightarrow$ Inspect responses $\rightarrow$ Export).
  - Root error boundary (`global-error.tsx`) and 404 page verification.
  - Clean production build check (`npm run build`).
- **Verification:** All tests pass, build completes with 0 errors, and application runs smoothly across desktop and mobile viewports.

---

## 4. Progress Tracker

- [x] **Step 1:** Database Schema & Supabase Connectivity
- [x] **Step 2:** Authentication System (Sign In / Sign Up)
- [x] **Step 3:** Creator Dashboard & Form Listing
- [x] **Step 4:** Form Lifecycle Actions (Create, Rename, Delete)
- [x] **Step 5:** Form Builder — Core Canvas & Text Questions
- [x] **Step 6:** Form Builder — Choice & Rating Questions
- [x] **Step 7:** Form Builder — Reordering & Persistence
- [x] **Step 8:** Public Form Responder View
- [x] **Step 9:** Submission Ingestion & Validation
- [x] **Step 10:** Responses Data Table
- [x] **Step 11:** CSV Export & Response Summary
- [x] **Step 12:** Final Review & Polish
