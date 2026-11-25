import Image from "next/image";

type Props = {
  name: string;
  bio: string;
  avatar: string;
};

export default function ProfileHeader({ name, bio, avatar }: Props) {
  return (
    <header className="flex flex-col items-center text-center">
      <Image
        src={avatar}
        alt={`${name} 프로필 사진`}
        width={128}
        height={128}
        loading="eager"
        className="size-32 rounded-full object-cover"
      />
      <h1 className="mt-5 text-2xl font-bold break-words">{name}</h1>
      <p className="mt-2 text-base break-keep text-neutral-600 dark:text-neutral-400">{bio}</p>
    </header>
  );
}
