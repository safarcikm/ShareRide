import { Download, FileText, MessageCircleQuestion, Trash2 } from "lucide-react-native";
import { useMe } from "@/auth/session";
import { ActionRows } from "@/components/action-rows";
import { Row } from "@/components/row";
import { Screen } from "@/components/screen";
import { ScreenHead } from "@/components/screen-head";
import { useLanguage } from "@/i18n/language";
import { BackToMenu } from "@/navigation/back-to-menu";

/**
 * Privacy and your data, a page of Profile (spec 11; plan 4.9): Download
 * my data, Ask about my data, the privacy policy and Delete my account.
 * The title is at the left with what the page is under it, and its rows
 * are a card of rows, each with its picture, as Profile's are; deleting
 * the account takes it away, so its row is red and last (spec 31, 3.19 and
 * R31.3).
 */
export default function PrivacyScreen() {
  const { t } = useLanguage();
  const me = useMe();
  if (me === null) return <BackToMenu />;
  return (
    <Screen>
      <ScreenHead title={t("privacy.title")} line={t("privacy.intro")} back="/profile" />
      <ActionRows>
        <Row icon={Download} title={t("privacy.download")} href="/settings/privacy/download" />
        <Row icon={MessageCircleQuestion} title={t("privacy.ask")} href="/settings/privacy/ask" />
        <Row icon={FileText} title={t("legal.privacy")} href="/legal/privacy" />
        <Row danger icon={Trash2} title={t("privacy.delete")} href="/settings/privacy/delete" />
      </ActionRows>
    </Screen>
  );
}
