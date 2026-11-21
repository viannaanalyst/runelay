import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export const githubUrl = "https://github.com/runelay/runelay";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <img src="/favicon.svg" alt="" width={22} height={22} className="rounded-md" />
          <span className="font-semibold">runelay</span>
        </>
      ),
    },
    githubUrl,
    links: [{ text: "runelay.com", url: "https://runelay.com", external: true }],
  };
}
