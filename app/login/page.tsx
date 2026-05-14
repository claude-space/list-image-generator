import { Suspense } from "react";
import LoginForm from "./LoginForm";

// Server page wrapper. Suspense lets the client form read useSearchParams()
// without forcing the whole login route into a prerender error.
export default function LoginPage() {
  return (
    <Suspense fallback={<main className="flex-1" />}>
      <LoginForm />
    </Suspense>
  );
}
