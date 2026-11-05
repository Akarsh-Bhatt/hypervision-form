import { Metadata } from "next";
import Link from "next/link";
import { FileQuestion, ArrowLeft } from "lucide-react";
import PublicFormViewer from "@/components/PublicFormViewer";

type PageProps = {
  params: Promise<{ slug: string }>;
};

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

async function fetchFormData(slug: string) {
  try {
    const res = await fetch(
      `${BACKEND_URL}/api/v1/forms/public/${encodeURIComponent(slug)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchFormData(slug);

  if (!data?.form) {
    return {
      title: "Form Not Found | Hypervision Form",
      description: "The requested form does not exist or has been removed.",
    };
  }

  const form = data.form;
  const title = `${form.title} | Hypervision Form`;
  const description =
    form.description || "Complete and submit your response online.";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: form.theme?.header_image_url
        ? [{ url: form.theme.header_image_url }]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function PublicFormPage({ params }: PageProps) {
  const { slug } = await params;
  const data = await fetchFormData(slug);

  if (!data?.form) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-16 flex items-center justify-center">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
            <FileQuestion size={32} />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Form Not Found</h1>
          <p className="mt-2 text-sm text-slate-500 leading-relaxed">
            The link you followed may be broken, or the creator may have deleted or unpublished this form.
          </p>
          <div className="mt-6">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 transition"
            >
              <ArrowLeft size={14} />
              <span>Go to Home</span>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <PublicFormViewer
      form={data.form}
      questions={data.questions || []}
      lifecycle={data.lifecycle}
      slug={slug}
    />
  );
}

