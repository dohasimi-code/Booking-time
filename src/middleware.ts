import { NextResponse, type NextRequest } from "next/server";

// First line of defence only: sends visitors without a session cookie to the login page.
// Every admin page and API route still verifies the session against the database.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/admin") && !["/admin/login", "/admin/setup"].includes(pathname) && !req.cookies.has("btd_admin")) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
