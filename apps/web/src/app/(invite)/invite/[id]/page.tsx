import InvitePage from "./invite-page";

export function generateStaticParams() {
  return [{ id: "static-export-placeholder" }];
}

export default function InvitePageWrapper({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  void params;
  return <InvitePage params={params} />;
}
