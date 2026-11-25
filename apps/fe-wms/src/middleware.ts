import { NextResponse, type NextRequest } from "next/server";

const jposHost = "jpos.joyworldcityfuns.vn";

export function middleware(request: NextRequest) {
  if (request.headers.get("host") !== jposHost) return NextResponse.next();

  const url = request.nextUrl.clone();
  if (url.pathname === "/") {
    if (url.searchParams.get("payment") === "payos") {
      // A browser return does not confirm payment. The register checks PayOS separately.
      return new NextResponse("Quay lại ứng dụng JPOS tại quầy để kiểm tra kết quả thanh toán.", {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    }
    url.pathname = "/jpos/overview";
    return NextResponse.redirect(url);
  }
  if (url.pathname === "/login") {
    url.pathname = "/jpos/login";
    return NextResponse.rewrite(url);
  }
  if (url.pathname === "/jpos" || url.pathname.startsWith("/jpos/")) {
    return NextResponse.next();
  }
  return new NextResponse(null, { status: 404 });
}

export const config = {
  matcher: ["/((?!_next/|logo/|manifest\\.webmanifest$|favicon\\.ico$).*)"],
};
