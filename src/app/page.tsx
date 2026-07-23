import { redirect } from "next/navigation";

// Next's static analysis sees no dynamic data access in this component and
// would otherwise prerender it at build time — but this route still passes
// through clerkMiddleware's auth.protect() on every real request, which a
// statically-served response can't participate in. Confirmed live: without
// this, the deployed root route 404s instead of redirecting (Clerk's
// middleware issues a "protect-rewrite" against a static asset that has
// nothing dynamic behind it to rewrite to).
export const dynamic = "force-dynamic";

export default function RootPage() {
  redirect("/dashboard");
}
