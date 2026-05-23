import DiscoverPage from "./tab-page";

export function generateStaticParams() {
  return [{ id: "static-export-placeholder" }];
}

export default function DiscoverPageWrapper({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  void params;
  return <DiscoverPage />;
}
