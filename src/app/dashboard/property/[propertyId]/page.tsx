import Link from "next/link";
import { notFound } from "next/navigation";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { PropertyAssetCard } from "@/components/ui/PropertyAssetCard";
import { SaleDetailsPanel } from "./SaleDetailsPanel";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { getUserNotifications } from "@/lib/data/notifications";
import { getSoldPropertyDetail } from "@/lib/data/portfolio";
import { getOwnershipsForProperty } from "@/lib/data/propertyOwnership";
import { getPropertyMilestones } from "@/lib/data/construction";
import { ConstructionMilestones } from "@/components/ui/ConstructionMilestones";
import { DocumentPanel } from "@/components/ui/DocumentPanel";
import { ActivityTimeline } from "@/components/ui/ActivityTimeline";
import { getEntityDocuments } from "@/lib/data/documents";
import { getRecordTimeline } from "@/lib/data/activities";
import { isStorageConfigured } from "@/lib/storage";
import { markNotificationReadAction } from "@/app/actions/notifications";
import { formatCurrency, formatDate } from "@/lib/format";
import { Role } from "@/lib/auth/role";

interface SoldPropertyPageProps {
  params: { propertyId: string };
}

/**
 * Admin drill-down into one sold property: who bought it, when, for how
 * much, and where its build has got to.
 *
 * Separate from /dashboard/projects/[id], which is the *catalog* view every
 * signed-in user can reach — a listing, with no buyer information on it at
 * all. This route exists because buyer identity and sale price are admin
 * facts, and putting them behind a role check on the catalog page would mean
 * one page rendering two very different things to two audiences.
 *
 * notFound() covers three distinct cases on purpose — not an admin, no such
 * property in this tenant, and a property that exists but has never been
 * sold. All three are "there is nothing here for you", and distinguishing
 * them in the response would leak which properties exist.
 */
export default async function SoldPropertyPage({ params }: SoldPropertyPageProps) {
  const currentUser = await getCurrentUser();

  if (!currentUser || currentUser.role !== Role.ADMIN) {
    notFound();
  }

  const detail = await getSoldPropertyDetail(currentUser.tenantId, params.propertyId);
  if (!detail) {
    notFound();
  }

  const [notifications, ownerships, milestones, documents, timeline] = await Promise.all([
    getUserNotifications(currentUser.tenantId, currentUser.userId),
    getOwnershipsForProperty(currentUser.tenantId, params.propertyId),
    getPropertyMilestones(currentUser.tenantId, params.propertyId),
    // getEntityDocuments / getRecordTimeline, not their client-visible
    // counterparts: the role check at the top of this page is what licenses
    // the admin readers, and this is the only view that may show internal
    // files and system audit rows.
    getEntityDocuments(currentUser.tenantId, "Property", params.propertyId),
    getRecordTimeline(currentUser.tenantId, "Property", params.propertyId),
  ]);

  return (
    <div className="flex min-h-screen">
      <Sidebar activeKey="property" client={{ property: currentUser.email }} isAdmin />
      <div className="flex flex-1 flex-col">
        <TopNav
          title={detail.property.name}
          subtitle={`${detail.property.area} · ${detail.owners.length} buyer${detail.owners.length === 1 ? "" : "s"}`}
          userName={currentUser.name}
          userInitials={currentUser.initials}
          notifications={notifications}
          onMarkNotificationRead={markNotificationReadAction}
          isAdmin
        />
        <main className="flex-1 space-y-6 bg-stone-50 p-8">
          <Link href="/dashboard/property" className="text-sm font-semibold text-aegean-600 hover:underline">
            &larr; Back to properties sold
          </Link>

          <PropertyAssetCard property={detail.property} />

          {/* The sold unit is the most document-heavy record in the app —
          contracts, deeds, handover photos — and until now had nowhere to
          put any of them. */}
          <DocumentPanel
            documents={documents}
            entityType="Property"
            entityId={params.propertyId}
            canManage
            storageConfigured={isStorageConfigured()}
            title="Contracts, deeds & photos"
          />

          <section className="rounded-lg border border-stone-200 bg-stone-0 p-5 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Buyers</h2>
            <ul className="mt-3 divide-y divide-stone-100">
              {detail.owners.map((owner) => (
                <li key={owner.userId} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                  <div>
                    <Link
                      href={`/dashboard/clients/${owner.userId}`}
                      className="font-medium text-aegean-600 hover:underline"
                    >
                      {owner.name}
                    </Link>
                    <p className="text-xs text-stone-500">{owner.email}</p>
                  </div>
                  <dl className="flex gap-6 text-sm">
                    <div>
                      <dt className="text-xs text-stone-500">Sale date</dt>
                      <dd className="tabular-nums text-stone-900">
                        {owner.saleDate ? formatDate(owner.saleDate) : <span className="text-stone-400">Not recorded</span>}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-stone-500">Sale price</dt>
                      <dd className="tabular-nums text-stone-900">
                        {owner.salePrice === null ? (
                          <span className="text-stone-400">Not recorded</span>
                        ) : (
                          formatCurrency(owner.salePrice)
                        )}
                      </dd>
                    </div>
                    <div>
                      {/* Shown alongside, never instead of, the sale date —
                          they are different facts and conflating them is
                          exactly what migration 0009 refused to do. */}
                      <dt className="text-xs text-stone-500">Recorded in app</dt>
                      <dd className="tabular-nums text-stone-500">{formatDate(owner.recordedAt)}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          </section>

          <SaleDetailsPanel propertyId={detail.property.id} ownerships={ownerships} />

          {milestones.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Construction</h2>
              <ActivityTimeline
            entries={timeline}
            entityType="Property"
            entityId={params.propertyId}
            canManage
            title="Activity & history"
          />

          <ConstructionMilestones milestones={milestones} />
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
