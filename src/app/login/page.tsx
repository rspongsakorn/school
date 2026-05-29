import Image from "next/image";
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
          <Image
            src="/school-logo.png"
            alt="โลโก้โรงเรียนบัวใหญ่วิทยา"
            width={80}
            height={80}
            className="rounded-full object-cover"
            priority
          />
          <div>
            <h1 className="text-2xl font-semibold">โรงเรียนบัวใหญ่วิทยา</h1>
            <p className="mt-1 text-sm text-muted-foreground">ระบบจัดการค่าเล่าเรียน</p>
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
