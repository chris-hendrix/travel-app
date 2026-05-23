import PhotosTab from "./tab-page";

export function generateStaticParams() {
  return [{ id: "static-export-placeholder" }];
}

export default function PhotosTabWrapper({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  void params;
  return <PhotosTab />;
}
