import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-25 p-6">
      <SignIn />
    </div>
  );
}
