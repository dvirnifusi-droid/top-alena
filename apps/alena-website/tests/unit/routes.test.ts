import { describe, it, expect } from "vitest";
import { routes, landingSlugs } from "@/lib/routes";

describe("routes", () => {
  it("has Hebrew primary routes", () => {
    expect(routes.menu).toBe("/תפריט");
    expect(routes.events).toBe("/אירועים");
    expect(routes.contact).toBe("/צור-קשר");
  });

  it("lists 7 SEO landing slugs", () => {
    expect(landingSlugs).toHaveLength(7);
    expect(landingSlugs).toContain("חמארה-בראשון-לציון");
    expect(landingSlugs).toContain("המבורגר-בראשון");
  });
});
