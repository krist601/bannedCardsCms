import { NextRequest, NextResponse } from "next/server";
const cookie = "bc_cms_session";
const backend = () => process.env.MEDUSA_BACKEND_URL || "http://localhost:9000";
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return handle(req, context);
}
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return handle(req, context);
}
async function handle(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const path = (await context.params).path.join("/");
  if (req.method === "POST" && req.headers.get("origin") !== req.nextUrl.origin)
    return NextResponse.json(
      { message: "Invalid request origin" },
      { status: 403 },
    );
  if (path === "logout" && req.method === "POST") {
    const res = NextResponse.json({ ok: true });
    res.cookies.delete(cookie);
    return res;
  }
  try {
    if (path === "login" && req.method === "POST") {
      const { email, password } = await req.json();
      const auth = await fetch(`${backend()}/auth/user/emailpass`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        cache: "no-store",
      });
      if (!auth.ok)
        return NextResponse.json(
          { message: "Email or password is incorrect." },
          { status: 401 },
        );
      const { token } = await auth.json();
      const check = await fetch(`${backend()}/admin/cms?resource=me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!check.ok)
        return NextResponse.json(
          { message: "This account does not have CMS administrator access." },
          { status: 403 },
        );
      const res = NextResponse.json(await check.json());
      res.cookies.set(cookie, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 60 * 60 * 8,
      });
      return res;
    }
    if (path !== "data")
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    const token = req.cookies.get(cookie)?.value;
    if (!token)
      return NextResponse.json({ message: "Please sign in." }, { status: 401 });
    const response = await fetch(
      `${backend()}/admin/cms${req.nextUrl.search}`,
      {
        method: req.method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        ...(req.method === "POST" ? { body: await req.text() } : {}),
        cache: "no-store",
      },
    );
    const data = await response
      .json()
      .catch(() => ({ message: "Server returned an invalid response" }));
    const res = NextResponse.json(data, { status: response.status });
    if (response.status === 401 || response.status === 403)
      res.cookies.delete(cookie);
    return res;
  } catch {
    return NextResponse.json(
      {
        message:
          "Cannot reach Banned Cards server. Check the server connection and try again.",
      },
      { status: 502 },
    );
  }
}
