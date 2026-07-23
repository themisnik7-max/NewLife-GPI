import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useOrganization } from "@clerk/nextjs";
import { TeamOrganizationPanel } from "@/components/ui/TeamOrganizationPanel";

vi.mock("@clerk/nextjs", () => ({
  useOrganization: vi.fn(),
  CreateOrganization: () => <div data-testid="create-organization" />,
  OrganizationProfile: () => <div data-testid="organization-profile" />,
}));

const mockedUseOrganization = vi.mocked(useOrganization);

describe("TeamOrganizationPanel", () => {
  it("renders nothing while Clerk is still loading", () => {
    mockedUseOrganization.mockReturnValue({ isLoaded: false, organization: undefined } as never);

    const { container } = render(<TeamOrganizationPanel />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows CreateOrganization when the admin has no active organization yet", () => {
    mockedUseOrganization.mockReturnValue({ isLoaded: true, organization: null } as never);

    render(<TeamOrganizationPanel />);

    expect(screen.getByTestId("create-organization")).toBeInTheDocument();
    expect(screen.queryByTestId("organization-profile")).not.toBeInTheDocument();
  });

  it("shows OrganizationProfile once an organization already exists", () => {
    mockedUseOrganization.mockReturnValue({
      isLoaded: true,
      organization: { id: "org_abc123", name: "Acme Org" },
    } as never);

    render(<TeamOrganizationPanel />);

    expect(screen.getByTestId("organization-profile")).toBeInTheDocument();
    expect(screen.queryByTestId("create-organization")).not.toBeInTheDocument();
  });
});
