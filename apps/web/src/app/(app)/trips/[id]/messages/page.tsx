import MessagesTab from "./tab-page";

export function generateStaticParams() {
  return [{ id: "static-export-placeholder" }];
}

export default function MessagesTabWrapper({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  void params;
  return <MessagesTab />;
}
