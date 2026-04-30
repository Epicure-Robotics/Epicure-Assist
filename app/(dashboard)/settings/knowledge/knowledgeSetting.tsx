import KnowledgeBankSetting from "./knowledgeBankSetting";
import KnowledgeGapsSetting from "./knowledgeGapsSetting";
import WebsiteCrawlSetting from "./websiteCrawlSetting";

const KnowledgeSetting = ({ websitesEnabled }: { websitesEnabled: boolean }) => {
  return (
    <>
      <div className="space-y-6">
        {websitesEnabled && <WebsiteCrawlSetting />}
        <KnowledgeBankSetting />
        <KnowledgeGapsSetting />
      </div>
    </>
  );
};

export default KnowledgeSetting;
