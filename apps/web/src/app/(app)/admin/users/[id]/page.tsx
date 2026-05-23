import AdminUserDetailPage from "./client-page";

export const dynamic = "force-static";

export function generateStaticParams() {
  return [{ id: "static-export-placeholder" }];
}

export default function AdminUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  void params;
  return <AdminUserDetailPage />;
}
