import { useSession } from "@/components/useSession";
import AutoAssignSetting from "./autoAssignSetting";
import ConfettiSetting from "./confettiSetting";
import EmailSignatureSetting from "./emailSignatureSetting";
import NextTicketPreviewSetting from "./nextTicketPreviewSetting";
import SidePreviewSetting from "./sidePreviewSetting";

const PreferencesSetting = () => {
  const { user } = useSession() ?? {};

  if (!user) return null;

  return (
    <div className="space-y-6">
      <AutoAssignSetting />
      <ConfettiSetting />
      <NextTicketPreviewSetting />
      <SidePreviewSetting />
      <EmailSignatureSetting />
    </div>
  );
};

export default PreferencesSetting;
