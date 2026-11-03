
-- HyperVision Form Platform
-- Initial database schema
-- For the temporary development project

-- =====================================================
-- 1. PROFILES
-- =====================================================

CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Automatically create a profile after signup.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, display_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(
            NEW.raw_user_meta_data ->> 'full_name',
            NEW.raw_user_meta_data ->> 'name',
            split_part(COALESCE(NEW.email, ''), '@', 1)
        ),
        NEW.raw_user_meta_data ->> 'avatar_url'
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();


-- =====================================================
-- 2. FORMS / EVENTS
-- =====================================================

CREATE TABLE public.forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    shareable_slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL DEFAULT 'Untitled Form',
    description TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'closed')),
    settings JSONB NOT NULL DEFAULT '{
        "allow_multiple_responses": false,
        "response_limit": null,
        "confirmation_message": "Your response has been recorded.",
        "closing_date": null
    }'::jsonb,
    theme JSONB NOT NULL DEFAULT '{
        "primary_color": "#3B82F6",
        "background_color": "#F8FAFC",
        "font_family": "sans",
        "header_image_url": null
    }'::jsonb,
    response_count INTEGER NOT NULL DEFAULT 0
        CHECK (response_count >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =====================================================
-- 3. FORM QUESTIONS
-- =====================================================

CREATE TABLE public.form_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
    field_key TEXT NOT NULL,
    question_type TEXT NOT NULL CHECK (
        question_type IN (
            'short_text',
            'long_text',
            'multiple_choice',
            'checkboxes',
            'dropdown',
            'number',
            'date',
            'time',
            'linear_scale',
            'file_upload'
        )
    ),
    label TEXT NOT NULL DEFAULT 'Untitled Question',
    description TEXT DEFAULT '',
    order_index INTEGER NOT NULL DEFAULT 0,
    is_required BOOLEAN NOT NULL DEFAULT false,
    validation_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
    options JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_form_field_key UNIQUE (form_id, field_key)
);


-- =====================================================
-- 4. FORM RESPONSES
-- =====================================================

CREATE TABLE public.form_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
    sap_id TEXT NOT NULL CHECK (LENGTH(BTRIM(sap_id)) > 0),
    respondent_ip TEXT,
    completion_time_seconds INTEGER,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One SAP ID can register once per event.
-- The same SAP ID can register for other events.
CREATE UNIQUE INDEX uq_form_response_sap_id
ON public.form_responses (form_id, LOWER(BTRIM(sap_id)));

CREATE INDEX idx_form_responses_form_id
ON public.form_responses (form_id);

CREATE INDEX idx_form_responses_submitted_at
ON public.form_responses (submitted_at DESC);


-- =====================================================
-- 5. FORM ANSWERS
-- =====================================================

CREATE TABLE public.form_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    response_id UUID NOT NULL REFERENCES public.form_responses(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.form_questions(id) ON DELETE CASCADE,
    answer_value JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_response_question UNIQUE (response_id, question_id)
);


-- =====================================================
-- 6. UPDATED_AT TRIGGER FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER tr_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER tr_forms_updated_at
BEFORE UPDATE ON public.forms
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER tr_form_questions_updated_at
BEFORE UPDATE ON public.form_questions
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- =====================================================
-- 7. INDEXES
-- =====================================================

CREATE INDEX idx_forms_creator_id
ON public.forms (creator_id);

CREATE INDEX idx_form_questions_form_order
ON public.form_questions (form_id, order_index);

CREATE INDEX idx_form_answers_response_id
ON public.form_answers (response_id);

CREATE INDEX idx_form_answers_question_id
ON public.form_answers (question_id);


-- =====================================================
-- 8. ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_answers ENABLE ROW LEVEL SECURITY;


-- =====================================================
-- 9. PROFILE POLICIES
-- =====================================================

CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = id);

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = id)
WITH CHECK ((SELECT auth.uid()) = id);


-- =====================================================
-- 10. FORM POLICIES
-- =====================================================

CREATE POLICY "Creators can manage their own forms"
ON public.forms
FOR ALL
TO authenticated
USING ((SELECT auth.uid()) = creator_id)
WITH CHECK ((SELECT auth.uid()) = creator_id);

CREATE POLICY "Public can view published forms"
ON public.forms
FOR SELECT
TO anon, authenticated
USING (status = 'published');


-- =====================================================
-- 11. QUESTION POLICIES
-- =====================================================

CREATE POLICY "Creators can manage their own questions"
ON public.form_questions
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.forms
        WHERE forms.id = form_questions.form_id
        AND forms.creator_id = (SELECT auth.uid())
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.forms
        WHERE forms.id = form_questions.form_id
        AND forms.creator_id = (SELECT auth.uid())
    )
);

CREATE POLICY "Public can view published form questions"
ON public.form_questions
FOR SELECT
TO anon, authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.forms
        WHERE forms.id = form_questions.form_id
        AND forms.status = 'published'
    )
);


-- =====================================================
-- 12. RESPONSE POLICIES
-- =====================================================

CREATE POLICY "Creators can view their responses"
ON public.form_responses
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.forms
        WHERE forms.id = form_responses.form_id
        AND forms.creator_id = (SELECT auth.uid())
    )
);

CREATE POLICY "Creators can delete their responses"
ON public.form_responses
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.forms
        WHERE forms.id = form_responses.form_id
        AND forms.creator_id = (SELECT auth.uid())
    )
);

CREATE POLICY "Public can submit responses to published forms"
ON public.form_responses
FOR INSERT
TO anon
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.forms
        WHERE forms.id = form_responses.form_id
        AND forms.status = 'published'
    )
);


-- =====================================================
-- 13. ANSWER POLICIES
-- =====================================================

CREATE POLICY "Creators can view answers to their forms"
ON public.form_answers
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.form_responses
        JOIN public.forms
          ON forms.id = form_responses.form_id
        WHERE form_responses.id = form_answers.response_id
        AND forms.creator_id = (SELECT auth.uid())
    )
);

CREATE POLICY "Public can submit answers to published forms"
ON public.form_answers
FOR INSERT
TO anon
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.form_responses
        JOIN public.forms
          ON forms.id = form_responses.form_id
        JOIN public.form_questions
          ON form_questions.form_id = forms.id
        WHERE form_responses.id = form_answers.response_id
        AND form_questions.id = form_answers.question_id
        AND forms.status = 'published'
    )
);


-- =====================================================
-- END OF INITIAL SCHEMA
-- =====================================================
