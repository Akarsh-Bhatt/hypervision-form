import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  const protectedRoute =
    path.startsWith("/dashboard") || path.startsWith("/editor");

  const authRoute = ["/login", "/register"].includes(path);

  if (protectedRoute && !user) {
    const destination = request.nextUrl.clone();
    destination.pathname = "/login";
    destination.searchParams.set("next", path);

    return NextResponse.redirect(destination);
  }

  if (authRoute && user) {
    const destination = request.nextUrl.clone();
    destination.pathname = "/dashboard";
    destination.search = "";

    return NextResponse.redirect(destination);
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/editor/:path*", "/login", "/register"],
};
