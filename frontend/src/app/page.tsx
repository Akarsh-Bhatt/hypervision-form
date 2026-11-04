import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#090e1a]" />}>
      <AuthForm mode="login" />
    </Suspense>
  );
}
