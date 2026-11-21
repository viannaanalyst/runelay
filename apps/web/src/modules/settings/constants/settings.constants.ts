import {
  AiChat02Icon,
  AiNetworkIcon,
  CodeIcon,
  CommandLineIcon,
  ComputerIcon,
  MinimizeScreenIcon,
  Moon02Icon,
  PowerServiceIcon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { MessageKey } from "@/lib/i18n";
import type { Theme } from "@/lib/theme";

export const AVATAR_SIZE = 256;

export const AVATAR_QUALITY = 0.85;

export const AVATAR_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const AVATAR_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export const THEME_OPTIONS = [
  { value: "system", label: "settings.preferences.themes.system", icon: ComputerIcon },
  { value: "light", label: "settings.preferences.themes.light", icon: Sun03Icon },
  { value: "dark", label: "settings.preferences.themes.dark", icon: Moon02Icon },
] as const satisfies readonly { value: Theme; label: MessageKey; icon: IconSvgElement }[];

export const LOCAL_HOSTNAMES = ["localhost", "127.0.0.1", "[::1]"];

export const TAILNET_IP = /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/;

export const TAILNET_DOMAIN_SUFFIX = ".ts.net";

export const MCP_PATH = "/v1/mcp";

export const HOSTED_AGENTS_DOCS_URL = "https://docs.runelay.com/connect-agents#hosted-agents";

export const REPOSITORY_URL = "https://github.com/runelay/runelay";

export const SERVER_NAME_MAX_LENGTH = 60;

export const STARTUP_LOOP_MS = 6400;

const STARTUP_EASING = "cubic-bezier(0.2, 0, 0, 1)";

const loopFrames = (times: number[], values: Record<string, (string | number)[]>): Keyframe[] =>
  times.map((offset, index) => ({
    offset,
    easing: STARTUP_EASING,
    ...Object.fromEntries(Object.entries(values).map(([property, frames]) => [property, frames[index]])),
  }));

export const STARTUP_SCREEN_OFF_FRAMES = loopFrames([0, 0.14, 0.22, 0.94, 1], { opacity: [1, 1, 0, 0, 1] });

export const STARTUP_POWER_FRAMES = loopFrames([0, 0.07, 0.14, 1], {
  opacity: [0.4, 1, 1, 0.4],
  transform: ["scale(1)", "scale(0.84)", "scale(1)", "scale(1)"],
});

export const STARTUP_TRAY_FRAMES = loopFrames([0, 0.28, 0.36, 0.92, 1], {
  opacity: [0, 0, 1, 1, 0],
  transform: ["scale(0.6)", "scale(0.6)", "scale(1)", "scale(1)", "scale(0.9)"],
});

export const STARTUP_AGENT_ROWS = [12, 48, 84] as const;

export const STARTUP_LINKS = STARTUP_AGENT_ROWS.map((y, index) => {
  const start = 0.42 + index * 0.05;
  return {
    y,
    frames: loopFrames([0, start, start + 0.08, 0.92, 1], {
      strokeDashoffset: [1, 1, 0, 0, 0],
      opacity: [0, 1, 1, 1, 0],
    }),
  };
});

const badgeFrames = (from: number) =>
  loopFrames([0, from, from + 0.06, 0.92, 1], {
    opacity: [0, 0, 1, 1, 0],
    transform: ["translateY(4px)", "translateY(4px)", "translateY(0)", "translateY(0)", "translateY(0)"],
  });

export const STARTUP_ONLINE_FRAMES = badgeFrames(0.62);

export const STARTUP_OFFLINE_FRAMES = badgeFrames(0.34);

const agentFrames = (index: number) => {
  const lit = 0.5 + index * 0.05;
  return loopFrames([0, lit, lit + 0.05, 0.92, 1], {
    opacity: [0, 0, 1, 1, 0],
    transform: ["scale(0.85)", "scale(0.85)", "scale(1)", "scale(1)", "scale(1)"],
  });
};

export const STARTUP_AGENTS = [
  { id: "chat", icon: AiChat02Icon, frames: agentFrames(0) },
  { id: "terminal", icon: CommandLineIcon, frames: agentFrames(1) },
  { id: "editor", icon: CodeIcon, frames: agentFrames(2) },
] as const satisfies readonly { id: string; icon: IconSvgElement; frames: Keyframe[] }[];

export const STARTUP_POINTS = [
  { icon: PowerServiceIcon, label: "settings.startup.points.boot" },
  { icon: MinimizeScreenIcon, label: "settings.startup.points.tray" },
  { icon: AiNetworkIcon, label: "settings.startup.points.agents" },
] as const satisfies readonly { icon: IconSvgElement; label: MessageKey }[];
