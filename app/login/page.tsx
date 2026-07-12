import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-4 py-16">
      <div className="mb-6 flex items-baseline gap-3">
        <span aria-hidden="true" className="inline-block h-3 w-3 rounded-[3px] bg-emerald" />
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          Log in
        </h1>
      </div>
      <LoginForm />
      <p className="mt-6 font-body text-sm text-ink-muted">
        No account?{" "}
        <Link href="/signup" className="font-medium text-emerald-strong hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
