import { GraduationCap } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const inactive = params.error === "inactive";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
            <GraduationCap className="h-8 w-8 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">ระบบจัดการค่าเล่าเรียน</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              โรงเรียนตัวอย่างประถมศึกษา
            </p>
          </div>
        </div>

        {inactive ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-800">
            บัญชียังไม่ได้รับการเปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ
          </p>
        ) : null}

        <LoginForm />
      </div>
    </div>
  );
}
