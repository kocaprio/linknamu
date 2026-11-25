import LinkList from "@/components/LinkList";
import ProfileHeader from "@/components/ProfileHeader";
import { profile } from "@/lib/profile";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center gap-10 px-6 py-12">
      <ProfileHeader name={profile.name} bio={profile.bio} avatar={profile.avatar} />
      <LinkList links={profile.links} />
    </main>
  );
}
