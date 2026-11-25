import LinkCard from "@/components/LinkCard";
import type { LinkItem } from "@/lib/profile";

export default function LinkList({ links }: { links: LinkItem[] }) {
  return (
    <nav aria-label="링크 목록" className="w-full">
      <ul className="flex flex-col gap-5">
        {links.map((link) => (
          <li key={link.id}>
            <LinkCard link={link} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
