import TripDefaultPage from "./default-tab-page";

export function generateStaticParams() {
  return [{ id: "static-export-placeholder" }];
}

export default function TripDefaultPageWrapper({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  void params;
  return <TripDefaultPage />;
}
