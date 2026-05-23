import SettleTab from "./tab-page";

export function generateStaticParams() {
  return [{ id: "static-export-placeholder" }];
}

export default function SettleTabWrapper({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  void params;
  return <SettleTab />;
}
