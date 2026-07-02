import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

export function proxy(request: NextRequest) {
  // Validate the session at the edge: refreshes the auth token, redirects
  // unauthenticated requests to /login, and force-signs-out inactive users.
  // (A mere cookie-presence check is not real authentication.)
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
