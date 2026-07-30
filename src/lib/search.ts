// Client/test-safe: the shape of a search result, with no database access.
//
// Split out of src/lib/data/search.ts for the same reason src/lib/documents.ts
// is split from src/lib/data/documents.ts: CommandPalette is a Client
// Component and cannot import a `server-only` module. A type-only import
// would be erased at compile time and technically work, but it would leave a
// client component naming a server module in its import list, which is the
// convention this codebase avoids everywhere else.

export type SearchResultKind = "client" | "property" | "document" | "activity";

export interface SearchResult {
  kind: SearchResultKind;
  id: string;
  title: string;
  /** Secondary line — email, area, the record a file is filed against. */
  subtitle: string;
  href: string;
}
