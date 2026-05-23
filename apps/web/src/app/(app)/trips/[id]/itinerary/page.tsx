import ItineraryTab from "./tab-page";

export function generateStaticParams() {
  return [{ id: "static-export-placeholder" }];
}

export default function ItineraryTabWrapper({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  void params;
  return <ItineraryTab />;
}
