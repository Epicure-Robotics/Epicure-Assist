import { useSession } from "@/components/useSession";
import AutoAssignSetting from "./autoAssignSetting";
import EmailSignatureSetting from "./emailSignatureSetting";

const PreferencesSetting = () => {
  const { user } = useSession() ?? {};

  if (!user) return null;

  return (
    <div className="space-y-6">
      <AutoAssignSetting />
      <EmailSignatureSetting />
    </div>
  );
};

export default PreferencesSetting;
