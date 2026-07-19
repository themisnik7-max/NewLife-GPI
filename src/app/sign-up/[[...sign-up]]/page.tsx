import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-25 p-6">
      <SignUp />
    </div>
  );
}
