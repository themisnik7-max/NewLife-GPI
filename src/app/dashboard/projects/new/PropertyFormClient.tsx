"use client";

import { useRouter } from "next/navigation";
import { PropertyForm } from "@/components/ui/PropertyForm";
import { createPropertyAction } from "../actions";

/**
 * Thin client boundary between the Server Component page and PropertyForm:
 * only needed so router.push() can run after createPropertyAction resolves —
 * see that action's own comment for why it returns data instead of calling
 * redirect() itself.
 */
export function PropertyFormClient() {
  const router = useRouter();

  return (
    <PropertyForm
      submitLabel="Create Property"
      onSubmit={async (values) => {
        const created = await createPropertyAction(values);
        router.push(`/dashboard/projects/${created.id}`);
      }}
    />
  );
}
