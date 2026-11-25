import { after, NextResponse } from "next/server";
import { recordClick } from "@/lib/clicks";
import { profile } from "@/lib/profile";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const link = profile.links.find((item) => item.id === id);
  if (!link) return new NextResponse("링크를 찾을 수 없습니다.", { status: 404 });

  // 이동을 늦추지 않도록 응답을 보낸 뒤에 기록합니다.
  after(async () => {
    try {
      await recordClick(link.id);
    } catch (error) {
      console.error("클릭 수 기록 실패:", error);
    }
  });

  return NextResponse.redirect(link.url, 307);
}
