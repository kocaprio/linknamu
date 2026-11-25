export type LinkItem = {
  /** 클릭 수를 저장하는 키. 한 번 정하면 바꾸지 마세요. */
  id: string;
  title: string;
  url: string;
};

export type Profile = {
  name: string;
  bio: string;
  /** public/ 기준 경로 */
  avatar: string;
  links: LinkItem[];
};

// 화면 확인용 더미 값입니다. 진짜 내용은 여기에 채우세요.
export const profile: Profile = {
  name: "이름",
  bio: "한 줄 소개가 들어갈 자리입니다",
  avatar: "/avatar.svg",
  links: [
    { id: "github", title: "Github", url: "https://github.com/" },
    { id: "linkedin", title: "LinkedIn", url: "https://www.linkedin.com/" },
    { id: "blog", title: "Blog", url: "https://example.com/" },
  ],
};
