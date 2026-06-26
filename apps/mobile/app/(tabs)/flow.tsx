import { ScreenPlaceholder } from "../../src/components/ScreenPlaceholder";
import { useLocale } from "../../src/i18n";

export default function FlowScreen() {
  const { t } = useLocale();
  return <ScreenPlaceholder title={t("tab.flow")} />;
}
