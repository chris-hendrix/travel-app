import { Suspense } from "react";
import AdminUserDetailPage from "./client-page";

export default function AdminUserDetailServerPage() {
  return (
    <Suspense>
      <AdminUserDetailPage />
    </Suspense>
  );
}
