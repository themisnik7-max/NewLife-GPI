import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DocumentPanel } from "@/components/ui/DocumentPanel";
import type { DocumentView } from "@/lib/documents";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("@/app/dashboard/documents/actions", () => ({
  uploadDocumentAction: vi.fn(),
  updateDocumentAction: vi.fn(),
  deleteDocumentAction: vi.fn(),
  getDocumentUrlAction: vi.fn(),
}));

import {
  deleteDocumentAction,
  getDocumentUrlAction,
  updateDocumentAction,
  uploadDocumentAction,
} from "@/app/dashboard/documents/actions";

const mockedUpload = vi.mocked(uploadDocumentAction);
const mockedUpdate = vi.mocked(updateDocumentAction);
const mockedDelete = vi.mocked(deleteDocumentAction);
const mockedGetUrl = vi.mocked(getDocumentUrlAction);

const PROPERTY_ID = "22222222-2222-2222-2222-222222222222";

function makeDocument(overrides: Partial<DocumentView> = {}): DocumentView {
  return {
    id: "doc-1",
    entityType: "Property",
    entityId: PROPERTY_ID,
    category: "LEASE_AGREEMENT",
    categoryLabel: "Lease agreement",
    filename: "lease.pdf",
    contentType: "application/pdf",
    sizeBytes: 2048,
    description: null,
    visibleToClient: false,
    uploadedByUserId: "user_admin",
    uploadedByName: "Themis Nikolaou",
    createdAt: "2026-07-01T10:00:00.000Z",
    isImage: false,
    ...overrides,
  };
}

beforeEach(() => {
  mockRefresh.mockReset();
  mockedUpload.mockReset().mockResolvedValue(undefined);
  mockedUpdate.mockReset().mockResolvedValue(undefined);
  mockedDelete.mockReset().mockResolvedValue(undefined);
  mockedGetUrl.mockReset().mockResolvedValue("https://signed.example/doc");
  vi.stubGlobal("open", vi.fn());
  vi.stubGlobal("confirm", vi.fn(() => true));
});

describe("DocumentPanel rendering", () => {
  it("shows the file count so the panel doubles as a badge", () => {
    render(
      <DocumentPanel
        documents={[makeDocument(), makeDocument({ id: "doc-2", filename: "deed.pdf" })]}
        entityType="Property"
        entityId={PROPERTY_ID}
      />,
    );

    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("says so plainly when there are no files", () => {
    render(<DocumentPanel documents={[]} entityType="Property" entityId={PROPERTY_ID} />);

    expect(screen.getByText("No files yet.")).toBeInTheDocument();
  });

  it("renders the category, size, date and uploader alongside the filename", () => {
    render(
      <DocumentPanel
        documents={[makeDocument({ sizeBytes: 1024 * 1024 })]}
        entityType="Property"
        entityId={PROPERTY_ID}
      />,
    );

    expect(screen.getByText("lease.pdf")).toBeInTheDocument();
    expect(screen.getByText(/Lease agreement/)).toBeInTheDocument();
    expect(screen.getByText(/1\.0 MB/)).toBeInTheDocument();
    expect(screen.getByText(/Themis Nikolaou/)).toBeInTheDocument();
  });
});

describe("read-only mode (a client viewing their own files)", () => {
  it("offers no upload form", () => {
    render(<DocumentPanel documents={[makeDocument()]} entityType="Property" entityId={PROPERTY_ID} />);

    expect(screen.queryByLabelText("Choose a file to upload")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Upload file/ })).not.toBeInTheDocument();
  });

  it("offers no delete or share control", () => {
    render(<DocumentPanel documents={[makeDocument()]} entityType="Property" entityId={PROPERTY_ID} />);

    expect(screen.queryByLabelText(/Delete lease\.pdf/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Share lease\.pdf/)).not.toBeInTheDocument();
  });

  it("hides the internal/shared badge, which is admin vocabulary", () => {
    render(<DocumentPanel documents={[makeDocument()]} entityType="Property" entityId={PROPERTY_ID} />);

    expect(screen.queryByText("Internal")).not.toBeInTheDocument();
  });

  it("still allows downloading, which is the whole point of the client view", async () => {
    const user = userEvent.setup();
    render(<DocumentPanel documents={[makeDocument()]} entityType="Property" entityId={PROPERTY_ID} />);

    await user.click(screen.getByLabelText("Download lease.pdf"));

    await waitFor(() => expect(mockedGetUrl).toHaveBeenCalledWith("doc-1"));
  });
});

describe("admin mode", () => {
  const adminProps = {
    entityType: "Property" as const,
    entityId: PROPERTY_ID,
    canManage: true,
  };

  it("offers only categories that make sense for the entity type", () => {
    render(<DocumentPanel documents={[]} {...adminProps} />);

    const select = screen.getByRole("combobox");
    expect(within(select).getByRole("option", { name: "Progress photo" })).toBeInTheDocument();
    // Identity documents belong on a person, not a building.
    expect(within(select).queryByRole("option", { name: "Identity document" })).not.toBeInTheDocument();
  });

  it("leaves 'visible to client' unchecked, so a forgotten checkbox under-shares", () => {
    render(<DocumentPanel documents={[]} {...adminProps} />);

    expect(screen.getByRole("checkbox", { name: /Visible to the client/ })).not.toBeChecked();
  });

  it("disables the upload button until a file is chosen", () => {
    render(<DocumentPanel documents={[]} {...adminProps} />);

    expect(screen.getByRole("button", { name: /Upload file/ })).toBeDisabled();
  });

  it("rejects a disallowed file type dropped onto the panel", async () => {
    render(<DocumentPanel documents={[]} {...adminProps} />);

    // Exercised through the DROP path, not the file input: the input carries
    // an `accept` allowlist that the browser's own picker enforces, so an SVG
    // can only reach the client-side check by being dragged in. SVG is
    // excluded deliberately — these files come back through signed URLs a
    // browser renders, and an SVG can carry script.
    const svg = new File(["<svg />"], "logo.svg", { type: "image/svg+xml" });
    const dropzone = screen.getByText("Drag a file here, or").closest("div")!;
    fireEvent.drop(dropzone, { dataTransfer: { files: [svg] } });

    expect(await screen.findByRole("alert")).toHaveTextContent(/not a PDF or a supported image/);
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it("accepts a valid file dropped onto the panel", async () => {
    const user = userEvent.setup();
    render(<DocumentPanel documents={[]} {...adminProps} />);

    const pdf = new File(["x"], "dropped.pdf", { type: "application/pdf" });
    const dropzone = screen.getByText("Drag a file here, or").closest("div")!;
    fireEvent.drop(dropzone, { dataTransfer: { files: [pdf] } });

    // The dropped file never passes through the input, which is why the
    // submit handler sets it from state rather than reading the form.
    expect(await screen.findByText("dropped.pdf")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Upload file/ }));

    await waitFor(() => expect(mockedUpload).toHaveBeenCalledTimes(1));
    expect(mockedUpload.mock.calls[0][0].get("file")).toBeInstanceOf(File);
  });

  it("accepts a PDF and submits it with the entity identifiers attached", async () => {
    const user = userEvent.setup();
    render(<DocumentPanel documents={[]} {...adminProps} />);

    const pdf = new File(["x"], "contract.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("Choose a file to upload"), pdf);
    await user.click(screen.getByRole("button", { name: /Upload file/ }));

    await waitFor(() => expect(mockedUpload).toHaveBeenCalledTimes(1));
    const formData = mockedUpload.mock.calls[0][0];
    expect(formData.get("entityType")).toBe("Property");
    expect(formData.get("entityId")).toBe(PROPERTY_ID);
    expect(formData.get("file")).toBeInstanceOf(File);
  });

  it("surfaces a rejected upload inline instead of throwing", async () => {
    const user = userEvent.setup();
    mockedUpload.mockRejectedValueOnce(new Error("File is too large (max 25 MB)."));
    render(<DocumentPanel documents={[]} {...adminProps} />);

    const pdf = new File(["x"], "contract.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("Choose a file to upload"), pdf);
    await user.click(screen.getByRole("button", { name: /Upload file/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/File is too large/);
  });

  it("distinguishes internal files from shared ones at a glance", () => {
    render(
      <DocumentPanel
        documents={[
          makeDocument({ id: "a", filename: "internal.pdf", visibleToClient: false }),
          makeDocument({ id: "b", filename: "shared.pdf", visibleToClient: true }),
        ]}
        {...adminProps}
      />,
    );

    expect(screen.getByText("Internal")).toBeInTheDocument();
    expect(screen.getByText("Shared")).toBeInTheDocument();
  });

  it("toggles visibility through the update action", async () => {
    const user = userEvent.setup();
    render(<DocumentPanel documents={[makeDocument()]} {...adminProps} />);

    await user.click(screen.getByLabelText("Share lease.pdf with the client"));

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith("doc-1", "Property", PROPERTY_ID, {
        visibleToClient: true,
      }),
    );
  });

  it("confirms before deleting, because there is no undo", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("confirm", vi.fn(() => false));
    render(<DocumentPanel documents={[makeDocument()]} {...adminProps} />);

    await user.click(screen.getByLabelText("Delete lease.pdf"));

    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it("deletes once confirmed", async () => {
    const user = userEvent.setup();
    render(<DocumentPanel documents={[makeDocument()]} {...adminProps} />);

    await user.click(screen.getByLabelText("Delete lease.pdf"));

    await waitFor(() =>
      expect(mockedDelete).toHaveBeenCalledWith("doc-1", "Property", PROPERTY_ID),
    );
  });

  it("explains itself rather than failing on click when storage is unconfigured", () => {
    render(<DocumentPanel documents={[]} {...adminProps} storageConfigured={false} />);

    expect(screen.getByText(/File storage is not configured/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Upload file/ })).not.toBeInTheDocument();
  });
});

describe("gallery view", () => {
  it("does not mint signed URLs on mount — one round-trip per image would not scale", () => {
    render(
      <DocumentPanel
        documents={[makeDocument({ isImage: true, contentType: "image/jpeg", filename: "site.jpg" })]}
        entityType="Property"
        entityId={PROPERTY_ID}
      />,
    );

    expect(mockedGetUrl).not.toHaveBeenCalled();
  });

  it("loads a thumbnail on demand and then renders it", async () => {
    const user = userEvent.setup();
    render(
      <DocumentPanel
        documents={[
          makeDocument({
            isImage: true,
            contentType: "image/jpeg",
            filename: "site.jpg",
            description: "East elevation, week 12",
          }),
        ]}
        entityType="Property"
        entityId={PROPERTY_ID}
      />,
    );

    await user.click(screen.getByLabelText("Gallery view"));
    await user.click(screen.getByRole("button", { name: /Show preview/ }));

    await waitFor(() => expect(mockedGetUrl).toHaveBeenCalledWith("doc-1"));
    // The description is the alt text where there is one — a filename like
    // "IMG_4821.jpg" tells a screen reader nothing.
    const image = await screen.findByAltText("East elevation, week 12");
    expect(image).toHaveAttribute("src", "https://signed.example/doc");
  });

  it("opens a PDF directly rather than trying to preview it", async () => {
    const user = userEvent.setup();
    render(
      <DocumentPanel documents={[makeDocument()]} entityType="Property" entityId={PROPERTY_ID} />,
    );

    await user.click(screen.getByLabelText("Gallery view"));
    await user.click(screen.getByRole("button", { name: /Open/ }));

    await waitFor(() => expect(window.open).toHaveBeenCalled());
  });
});
