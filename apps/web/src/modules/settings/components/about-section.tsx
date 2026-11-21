import {
  Download04Icon,
  GithubIcon,
  InformationCircleIcon,
  SecurityCheckIcon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/display/skeleton";
import { useT } from "@/lib/i18n";
import { REPOSITORY_URL } from "@/modules/settings/constants/settings.constants";
import { DESKTOP_DOWNLOAD_URL, versionQuery } from "@/modules/system/api/system.api";
import { ExternalLinkButton } from "./external-link-button";
import { SettingsRow } from "./settings-row";
import { SettingsSection } from "./settings-section";

export function AboutSection() {
  const { data: version } = useQuery(versionQuery);
  const t = useT();

  return (
    <SettingsSection icon={InformationCircleIcon} title={t("settings.about.title")}>
      <SettingsRow label={t("settings.about.version")}>
        {version ? (
          <span className="text-[13px] text-muted-foreground tabular-nums">runelay v{version.current}</span>
        ) : (
          <Skeleton className="h-4 w-24" />
        )}
      </SettingsRow>
      {!window.runelayDesktop && (
        <SettingsRow label={t("settings.about.desktopApp")} description={t("settings.about.desktopDescription")}>
          <ExternalLinkButton href={DESKTOP_DOWNLOAD_URL}>
            <HugeiconsIcon icon={Download04Icon} size={15} strokeWidth={1.7} />
            {t("settings.about.download")}
          </ExternalLinkButton>
        </SettingsRow>
      )}
      <SettingsRow label={t("settings.about.openSource")} description={t("settings.about.starDescription")}>
        <ExternalLinkButton href={REPOSITORY_URL}>
          <HugeiconsIcon icon={GithubIcon} size={15} strokeWidth={1.7} />
          <HugeiconsIcon
            icon={StarIcon}
            size={14}
            strokeWidth={1.8}
            className="text-chart-1 transition-transform duration-200 group-hover:rotate-[72deg] group-hover:scale-110"
          />
          {t("settings.about.star")}
        </ExternalLinkButton>
      </SettingsRow>
      <SettingsRow label={t("settings.about.privacy")} description={t("settings.about.privacyDescription")}>
        <ExternalLinkButton href={t("settings.about.privacyUrl")}>
          <HugeiconsIcon icon={SecurityCheckIcon} size={15} strokeWidth={1.7} />
          {t("settings.about.privacyLink")}
        </ExternalLinkButton>
      </SettingsRow>
    </SettingsSection>
  );
}
