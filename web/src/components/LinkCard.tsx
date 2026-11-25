import type { LinkItem } from "@/lib/profile";

export default function LinkCard({ link }: { link: LinkItem }) {
  // next/link 는 미리 불러오기로 클릭 수가 부풀 수 있어 일반 <a> 를 사용합니다.
  return (
    <a
      href={`/go/${encodeURIComponent(link.id)}`}
      target="_blank"
      rel="noopener"
      className="flex min-h-20 w-full items-center justify-center rounded-2xl border border-neutral-300 bg-white px-5 py-4 text-center text-lg font-medium break-words transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-neutral-700 dark:bg-neutral-900"
    >
      {link.title}
    </a>
  );
}
