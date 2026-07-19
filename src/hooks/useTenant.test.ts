import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAuth } from "@clerk/nextjs";
import { useTenant } from "./useTenant";

vi.mock("@clerk/nextjs", () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

describe("useTenant", () => {
  it("returns the loading state while Clerk auth has not loaded yet", () => {
    mockedUseAuth.mockReturnValue({
      isLoaded: false,
      isSignedIn: undefined,
      userId: undefined,
      orgId: undefined,
    } as unknown as ReturnType<typeof useAuth>);

    const { result } = renderHook(() => useTenant());

    expect(result.current).toEqual({ tenantId: null, isLoaded: false, isSignedIn: false });
  });

  it("returns the unauthenticated state when loaded but not signed in", () => {
    mockedUseAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      orgId: null,
    } as unknown as ReturnType<typeof useAuth>);

    const { result } = renderHook(() => useTenant());

    expect(result.current).toEqual({ tenantId: null, isLoaded: true, isSignedIn: false });
  });

  it("resolves tenantId to the active organization id in multi-tenant org mode", () => {
    mockedUseAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: "user_123",
      orgId: "org_123",
    } as unknown as ReturnType<typeof useAuth>);

    const { result } = renderHook(() => useTenant());

    expect(result.current).toEqual({ tenantId: "org_123", isLoaded: true, isSignedIn: true });
  });

  it("falls back to the personal user id in single-tenant mode when no org is active", () => {
    mockedUseAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: "user_123",
      orgId: null,
    } as unknown as ReturnType<typeof useAuth>);

    const { result } = renderHook(() => useTenant());

    expect(result.current).toEqual({ tenantId: "user_123", isLoaded: true, isSignedIn: true });
  });
});
