export function GoogleSignInButton() {
  return (
    <a
      href="/api/auth/google"
      className="flex items-center justify-center gap-2 rounded-full border border-line bg-paper-raised px-4 py-2 font-body text-sm font-medium text-ink transition-colors hover:bg-line/30"
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M19.6 10.23c0-.68-.06-1.32-.17-1.94H10v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.75 2.99-4.33 2.99-7.48Z"
        />
        <path
          fill="#34A853"
          d="M10 20c2.7 0 4.96-.9 6.61-2.42l-3.23-2.5c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H1.06v2.59A10 10 0 0 0 10 20Z"
        />
        <path
          fill="#FBBC05"
          d="M4.41 11.92A6 6 0 0 1 4.09 10c0-.67.11-1.32.32-1.92V5.49H1.06A10 10 0 0 0 0 10c0 1.61.39 3.14 1.06 4.51l3.35-2.59Z"
        />
        <path
          fill="#EA4335"
          d="M10 3.96c1.47 0 2.79.5 3.83 1.5l2.87-2.87C14.95.99 12.7 0 10 0 6.09 0 2.7 2.24 1.06 5.49l3.35 2.59C5.2 5.72 7.4 3.96 10 3.96Z"
        />
      </svg>
      Continue with Google
    </a>
  );
}
